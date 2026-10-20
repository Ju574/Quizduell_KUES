-- Prüfi-Duell: Datenbank einrichten
-- Supabase → SQL Editor → New query → diesen kompletten Text einfügen → Run.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden (z. B. nach einem Update).
-- Danach: gruppen-passwort.sql (einmalig) und fragen-import.sql ausführen.

create extension if not exists pgcrypto with schema extensions;

-- ===== Spieler, Duelle, Lernstand =====

create table if not exists public.spieler (
  id text primary key,                         -- Name in Kleinbuchstaben
  name text not null check (char_length(name) between 2 and 20),
  erstellt timestamptz not null default now()
);

create table if not exists public.duelle (
  id uuid primary key default gen_random_uuid(),
  modus text not null check (modus in ('runden', 'live')),
  spieler1 text not null references public.spieler(id),
  spieler2 text not null references public.spieler(id),
  status text not null check (status in ('offen', 'laeuft', 'beendet', 'abgelehnt')),
  daten jsonb not null default '{}'::jsonb,
  version integer not null default 0,          -- schützt vor gleichzeitigem Überschreiben
  erstellt timestamptz not null default now(),
  aktualisiert timestamptz not null default now()
);
-- Dritter Spieler (Duelle zu dritt)
alter table public.duelle add column if not exists spieler3 text references public.spieler(id);
create index if not exists duelle_spieler3 on public.duelle (spieler3);
create index if not exists duelle_spieler1 on public.duelle (spieler1);
create index if not exists duelle_spieler2 on public.duelle (spieler2);
create index if not exists duelle_status on public.duelle (status);

create table if not exists public.lernstand (
  spieler text not null references public.spieler(id),
  frage_id text not null,
  richtig integer not null default 0,
  falsch integer not null default 0,
  serie integer not null default 0,            -- richtige Antworten in Folge
  zuletzt timestamptz not null default now(),
  primary key (spieler, frage_id)
);

-- Zählt eine Antwort in den Lernstand ein (ohne Konflikte bei gleichzeitigen Antworten)
create or replace function public.lernstand_buchen(p_spieler text, p_frage_id text, p_richtig boolean)
returns void
language sql
as $$
  insert into public.lernstand as l (spieler, frage_id, richtig, falsch, serie)
  values (p_spieler, p_frage_id, p_richtig::int, (not p_richtig)::int, p_richtig::int)
  on conflict (spieler, frage_id) do update set
    richtig = l.richtig + excluded.richtig,
    falsch  = l.falsch + excluded.falsch,
    serie   = case when p_richtig then l.serie + 1 else 0 end,
    zuletzt = now();
$$;

-- Anmeldung nur per Name, daher dürfen alle lesen und schreiben – aber nichts löschen.
alter table public.spieler enable row level security;
alter table public.duelle enable row level security;
alter table public.lernstand enable row level security;

grant select, insert, update on public.spieler, public.duelle, public.lernstand to anon, authenticated;
grant execute on function public.lernstand_buchen(text, text, boolean) to anon, authenticated;

drop policy if exists "spieler lesen" on public.spieler;
drop policy if exists "spieler anlegen" on public.spieler;
create policy "spieler lesen" on public.spieler for select to anon, authenticated using (true);
create policy "spieler anlegen" on public.spieler for insert to anon, authenticated with check (true);

drop policy if exists "duelle lesen" on public.duelle;
drop policy if exists "duelle anlegen" on public.duelle;
drop policy if exists "duelle aendern" on public.duelle;
create policy "duelle lesen" on public.duelle for select to anon, authenticated using (true);
create policy "duelle anlegen" on public.duelle for insert to anon, authenticated with check (true);
create policy "duelle aendern" on public.duelle for update to anon, authenticated using (true) with check (true);

drop policy if exists "lernstand lesen" on public.lernstand;
drop policy if exists "lernstand anlegen" on public.lernstand;
drop policy if exists "lernstand aendern" on public.lernstand;
create policy "lernstand lesen" on public.lernstand for select to anon, authenticated using (true);
create policy "lernstand anlegen" on public.lernstand for insert to anon, authenticated with check (true);
create policy "lernstand aendern" on public.lernstand for update to anon, authenticated using (true) with check (true);

-- Echtzeit-Updates für Duelle (Live-Modus, Einladungen)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duelle'
  ) then
    alter publication supabase_realtime add table public.duelle;
  end if;
end $$;

-- ===== Fragen (geschützt) =====
-- Die Tabellen sind von außen NICHT lesbar (keine Policies, keine Rechte).
-- Zugriff nur über die Funktionen unten, und nur mit dem Gruppen-Passwort.

create table if not exists public.einstellungen (
  schluessel text primary key,
  wert text not null
);

create table if not exists public.fragen (
  id text primary key,
  kategorie text not null,
  frage text not null,
  richtig text not null,
  falsch text[] not null,
  erklaerung text,
  aktiv boolean not null default true,
  geaendert timestamptz not null default now()
);

alter table public.einstellungen enable row level security;
alter table public.fragen enable row level security;
revoke all on public.einstellungen, public.fragen from anon, authenticated;

create or replace function public.passwort_ok(p_passwort text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.einstellungen
    where schluessel = 'gruppen_passwort' and wert = crypt(coalesce(p_passwort, ''), wert)
  );
$$;

-- Liste aller Fragen-IDs mit Kategorie (ohne Texte)
create or replace function public.fragen_katalog(p_passwort text)
returns table (id text, kategorie text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  return query select f.id, f.kategorie from public.fragen f where f.aktiv order by f.kategorie, f.id;
end $$;

-- Fragetexte mit gemischten Antworten – OHNE Hinweis, welche richtig ist
create or replace function public.fragen_holen(p_passwort text, p_ids text[])
returns table (id text, kategorie text, frage text, antworten text[])
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 20 then
    raise exception 'Höchstens 20 Fragen pro Abruf';
  end if;
  return query
    select f.id, f.kategorie, f.frage,
           (select array_agg(a order by random()) from unnest(array_prepend(f.richtig, f.falsch)) as a)
    from public.fragen f
    where f.id = any(p_ids);
end $$;

-- Lösungen – die App ruft sie erst ab, nachdem eine Antwort gewählt wurde
create or replace function public.loesungen_holen(p_passwort text, p_ids text[])
returns table (id text, richtig text, erklaerung text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 20 then
    raise exception 'Höchstens 20 Lösungen pro Abruf';
  end if;
  return query select f.id, f.richtig, f.erklaerung from public.fragen f where f.id = any(p_ids);
end $$;

-- ===== Gemeldete Fragen =====
-- Spieler können Fragen melden (nur mit Gruppen-Passwort); lesen kann sie nur der Admin.

create table if not exists public.meldungen (
  id bigint generated always as identity primary key,
  frage_id text not null,
  spieler text,
  grund text not null check (char_length(grund) <= 60),
  kommentar text check (char_length(kommentar) <= 500),
  erstellt timestamptz not null default now(),
  erledigt boolean not null default false
);
alter table public.meldungen enable row level security;
revoke all on public.meldungen from anon, authenticated;

create or replace function public.frage_melden(p_passwort text, p_frage_id text, p_spieler text, p_grund text, p_kommentar text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  insert into public.meldungen (frage_id, spieler, grund, kommentar)
  values (p_frage_id, left(p_spieler, 40), left(p_grund, 60), nullif(left(trim(coalesce(p_kommentar, '')), 500), ''));
end $$;

revoke execute on function public.frage_melden(text, text, text, text, text) from public;
grant execute on function public.frage_melden(text, text, text, text, text) to anon, authenticated;

-- ===== Admin =====
-- Eigenes Admin-Passwort (admin-passwort.sql). Nur damit lassen sich Spieler und Duelle löschen.

create or replace function public.admin_ok(p_passwort text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.einstellungen
    where schluessel = 'admin_passwort' and wert = crypt(coalesce(p_passwort, ''), wert)
  );
$$;

-- Löscht einen Spieler samt seiner Duelle und seines Lernstands
create or replace function public.admin_spieler_loeschen(p_passwort text, p_spieler text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  delete from public.duelle where spieler1 = p_spieler or spieler2 = p_spieler or spieler3 = p_spieler;
  delete from public.lernstand where spieler = p_spieler;
  delete from public.spieler where id = p_spieler;
end $$;

create or replace function public.admin_duell_loeschen(p_passwort text, p_duell uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  delete from public.duelle where id = p_duell;
end $$;

create or replace function public.admin_lernstand_zuruecksetzen(p_passwort text, p_spieler text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  delete from public.lernstand where spieler = p_spieler;
end $$;

create or replace function public.admin_meldungen(p_passwort text)
returns table (id bigint, frage_id text, kategorie text, frage text, richtig text, spieler text, grund text, kommentar text, erstellt timestamptz, erledigt boolean)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  return query
    select m.id, m.frage_id, f.kategorie, f.frage, f.richtig, m.spieler, m.grund, m.kommentar, m.erstellt, m.erledigt
    from public.meldungen m
    left join public.fragen f on f.id = m.frage_id
    order by m.erledigt, m.erstellt desc;
end $$;

create or replace function public.admin_meldung_erledigen(p_passwort text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  update public.meldungen set erledigt = true where id = p_id;
end $$;

revoke execute on function public.admin_meldungen(text) from public;
revoke execute on function public.admin_meldung_erledigen(text, bigint) from public;
grant execute on function public.admin_meldungen(text) to anon, authenticated;
grant execute on function public.admin_meldung_erledigen(text, bigint) to anon, authenticated;

revoke execute on function public.admin_ok(text) from public;
revoke execute on function public.admin_spieler_loeschen(text, text) from public;
revoke execute on function public.admin_duell_loeschen(text, uuid) from public;
revoke execute on function public.admin_lernstand_zuruecksetzen(text, text) from public;
grant execute on function public.admin_ok(text) to anon, authenticated;
grant execute on function public.admin_spieler_loeschen(text, text) to anon, authenticated;
grant execute on function public.admin_duell_loeschen(text, uuid) to anon, authenticated;
grant execute on function public.admin_lernstand_zuruecksetzen(text, text) to anon, authenticated;

revoke execute on function public.passwort_ok(text) from public;
revoke execute on function public.fragen_katalog(text) from public;
revoke execute on function public.fragen_holen(text, text[]) from public;
revoke execute on function public.loesungen_holen(text, text[]) from public;
grant execute on function public.passwort_ok(text) to anon, authenticated;
grant execute on function public.fragen_katalog(text) to anon, authenticated;
grant execute on function public.fragen_holen(text, text[]) to anon, authenticated;
grant execute on function public.loesungen_holen(text, text[]) to anon, authenticated;
