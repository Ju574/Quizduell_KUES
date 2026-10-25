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

-- Fragetyp: 'auswahl' (Multiple Choice), 'eingabe' (Antwort eintippen, mit erlaubten Alternativen)
-- oder 'beschriften' (nummerierte Skizze; richtig = je Zeile „Nr: Lösung“, alternativen ebenfalls „Nr: …“)
alter table public.fragen add column if not exists typ text not null default 'auswahl';
alter table public.fragen add column if not exists alternativen text[] not null default '{}';
-- Optionale Skizzen: Verweis auf public.bilder; "bild" steht über der Frage, "bild_nach" erscheint erst in der Auflösung
alter table public.fragen add column if not exists bild text;
alter table public.fragen add column if not exists bild_nach text;
-- Rechenaufgaben lassen sich beim Duell ausschließen
alter table public.fragen add column if not exists rechnung boolean not null default false;

create table if not exists public.bilder (
  id text primary key,
  mime text not null,
  daten text not null,            -- Base64
  geaendert timestamptz not null default now()
);
alter table public.bilder enable row level security;
revoke all on public.bilder from anon, authenticated;
alter table public.fragen drop constraint if exists fragen_typ_check;
alter table public.fragen add constraint fragen_typ_check check (typ in ('auswahl', 'eingabe', 'beschriften'));

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

-- Liste aller Fragen-IDs mit Kategorie und Rechenaufgaben-Kennzeichen (ohne Texte)
drop function if exists public.fragen_katalog(text);
create function public.fragen_katalog(p_passwort text)
returns table (id text, kategorie text, rechnung boolean)
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
  return query select f.id, f.kategorie, f.rechnung from public.fragen f where f.aktiv order by f.kategorie, f.id;
end $$;

-- Fragetexte mit gemischten Antworten – OHNE Hinweis, welche richtig ist
-- (bei Eingabe-Fragen ganz ohne Antworten, bei Beschriften-Fragen die Nummern der Skizze
-- und getrennt davon die Begriffe in zufälliger Reihenfolge)
drop function if exists public.fragen_holen(text, text[]);
create function public.fragen_holen(p_passwort text, p_ids text[])
returns table (id text, kategorie text, frage text, typ text, antworten text[], bild text, begriffe text[])
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
    select f.id, f.kategorie, f.frage, f.typ,
           case when f.typ = 'eingabe' then '{}'::text[]
                when f.typ = 'beschriften' then array(
                  select (regexp_match(z, '^\s*([^:]+?)\s*:'))[1]
                  from unnest(string_to_array(f.richtig, E'\n')) with ordinality as t(z, n)
                  where z ~ ':' order by n)
                else (select array_agg(a order by random()) from unnest(array_prepend(f.richtig, f.falsch)) as a) end,
           f.bild,
           case when f.typ = 'beschriften' then array(
                  select trim(substr(z, strpos(z, ':') + 1))
                  from unnest(string_to_array(f.richtig, E'\n')) as t(z)
                  where z ~ ':' order by random()) end
    from public.fragen f
    where f.id = any(p_ids);
end $$;

-- Lösungen (inkl. erlaubter Alternativen) – die App ruft sie erst nach dem Antworten ab
drop function if exists public.loesungen_holen(text, text[]);
create function public.loesungen_holen(p_passwort text, p_ids text[])
returns table (id text, richtig text, erklaerung text, alternativen text[], bild_nach text)
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
  return query select f.id, f.richtig, f.erklaerung, f.alternativen, f.bild_nach from public.fragen f where f.id = any(p_ids);
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

-- ===== Fragen-Import per Skript =====
-- werkzeuge/fragen-importieren.js nutzt einen eigenen Import-Schlüssel (lokal in .import-schluessel,
-- in der Datenbank nur als Hash unter einstellungen.import_schluessel).

create or replace function public.fragen_importieren(p_schluessel text, p_fragen jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl integer;
begin
  if not exists (
    select 1 from public.einstellungen
    where schluessel = 'import_schluessel' and wert = crypt(coalesce(p_schluessel, ''), wert)
  ) then
    raise exception 'Falscher Import-Schlüssel';
  end if;
  if jsonb_array_length(p_fragen) > 100 then
    raise exception 'Höchstens 100 Fragen pro Aufruf';
  end if;
  insert into public.fragen (id, kategorie, frage, richtig, falsch, erklaerung, typ, alternativen, bild, bild_nach, rechnung)
  select f.id, f.kategorie, f.frage, f.richtig,
         coalesce(f.falsch, '{}'), nullif(f.erklaerung, ''), coalesce(f.typ, 'auswahl'), coalesce(f.alternativen, '{}'),
         nullif(f.bild, ''), nullif(f.bild_nach, ''), coalesce(f.rechnung, false)
  from jsonb_to_recordset(p_fragen) as f(id text, kategorie text, frage text, richtig text, falsch text[], erklaerung text,
                                          typ text, alternativen text[], bild text, bild_nach text, rechnung boolean)
  on conflict (id) do update set
    kategorie = excluded.kategorie, frage = excluded.frage, richtig = excluded.richtig, falsch = excluded.falsch,
    erklaerung = excluded.erklaerung, typ = excluded.typ, alternativen = excluded.alternativen,
    bild = excluded.bild, bild_nach = excluded.bild_nach, rechnung = excluded.rechnung,
    aktiv = true, geaendert = now();
  get diagnostics anzahl = row_count;
  return anzahl;
end $$;

create or replace function public.fragen_deaktivieren(p_schluessel text, p_kuerzel text, p_behalten text[])
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl integer;
begin
  if not exists (
    select 1 from public.einstellungen
    where schluessel = 'import_schluessel' and wert = crypt(coalesce(p_schluessel, ''), wert)
  ) then
    raise exception 'Falscher Import-Schlüssel';
  end if;
  update public.fragen set aktiv = false, geaendert = now()
  where aktiv and id like p_kuerzel || '%' and id <> all (p_behalten);
  get diagnostics anzahl = row_count;
  return anzahl;
end $$;

revoke execute on function public.fragen_importieren(text, jsonb) from public;
revoke execute on function public.fragen_deaktivieren(text, text, text[]) from public;
grant execute on function public.fragen_importieren(text, jsonb) to anon, authenticated;
grant execute on function public.fragen_deaktivieren(text, text, text[]) to anon, authenticated;

-- ===== Admin: Fragen durchsehen und zum Entfernen markieren =====
alter table public.fragen add column if not exists zum_entfernen boolean not null default false;

drop function if exists public.admin_fragen(text);
create function public.admin_fragen(p_passwort text)
returns table (id text, kategorie text, frage text, typ text, richtig text, falsch text[], alternativen text[], erklaerung text,
               zum_entfernen boolean, bild text, bild_nach text)
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
    select f.id, f.kategorie, f.frage, f.typ, f.richtig, f.falsch, f.alternativen, f.erklaerung, f.zum_entfernen, f.bild, f.bild_nach
    from public.fragen f where f.aktiv order by f.kategorie, f.id;
end $$;

create or replace function public.admin_frage_markieren(p_passwort text, p_id text, p_wert boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  update public.fragen set zum_entfernen = p_wert where id = p_id;
end $$;

revoke execute on function public.admin_fragen(text) from public;
revoke execute on function public.admin_frage_markieren(text, text, boolean) from public;
grant execute on function public.admin_fragen(text) to anon, authenticated;
grant execute on function public.admin_frage_markieren(text, text, boolean) to anon, authenticated;

-- ===== Skizzen =====
-- Bilder liegen geschützt in public.bilder und sind nur mit Gruppen- oder Admin-Passwort abrufbar.
create or replace function public.bild_holen(p_passwort text, p_id text)
returns table (mime text, daten text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.passwort_ok(p_passwort) and not public.admin_ok(p_passwort) then
    raise exception 'Falsches Passwort';
  end if;
  return query select b.mime, b.daten from public.bilder b where b.id = p_id;
end $$;

create or replace function public.bilder_importieren(p_schluessel text, p_bilder jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl integer;
begin
  if not exists (
    select 1 from public.einstellungen
    where schluessel = 'import_schluessel' and wert = crypt(coalesce(p_schluessel, ''), wert)
  ) then
    raise exception 'Falscher Import-Schlüssel';
  end if;
  insert into public.bilder (id, mime, daten)
  select b.id, b.mime, b.daten from jsonb_to_recordset(p_bilder) as b(id text, mime text, daten text)
  on conflict (id) do update set mime = excluded.mime, daten = excluded.daten, geaendert = now();
  get diagnostics anzahl = row_count;
  return anzahl;
end $$;

revoke execute on function public.bild_holen(text, text) from public;
revoke execute on function public.bilder_importieren(text, jsonb) from public;
grant execute on function public.bild_holen(text, text) to anon, authenticated;
grant execute on function public.bilder_importieren(text, jsonb) to anon, authenticated;

-- ===== Gruppenchat =====
-- Nur über Funktionen mit Gruppen-Passwort erreichbar (die Tabelle selbst ist für anon gesperrt).
-- Neue Nachrichten meldet die App per Realtime-Broadcast nur als „Anstoß“ ohne Inhalt; gelesen wird per chat_holen.

create table if not exists public.chat (
  id bigint generated always as identity primary key,
  spieler text,                                   -- null bei automatischen Ergebnis-Nachrichten
  text text not null check (char_length(text) between 1 and 500),
  art text not null default 'text' check (art in ('text', 'ergebnis')),
  duell uuid unique,                              -- Ergebnis-Nachricht: höchstens eine pro Duell
  reaktionen jsonb not null default '{}',         -- { "👍": ["spieler-id", …] }
  erstellt timestamptz not null default now()
);
alter table public.chat enable row level security;
revoke all on public.chat from anon, authenticated;

-- Die neuesten p_anzahl Nachrichten (aufsteigend sortiert)
create or replace function public.chat_holen(p_passwort text, p_anzahl int)
returns setof public.chat
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  return query select * from (select * from public.chat order by id desc limit least(greatest(p_anzahl, 1), 500)) c order by c.id;
end $$;

-- Anzahl Nachrichten anderer nach der zuletzt gelesenen
create or replace function public.chat_ungelesen(p_passwort text, p_nach bigint, p_spieler text)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  return (select count(*) from public.chat where id > coalesce(p_nach, 0) and spieler is distinct from p_spieler);
end $$;

create or replace function public.chat_senden(p_passwort text, p_spieler text, p_text text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  if not exists (select 1 from public.spieler where id = p_spieler) then
    raise exception 'Unbekannter Spieler';
  end if;
  insert into public.chat (spieler, text) values (p_spieler, left(trim(p_text), 500));
end $$;

-- Ergebnis eines beendeten Duells posten (mehrfaches Posten desselben Duells wird ignoriert)
create or replace function public.chat_ergebnis(p_passwort text, p_duell uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  if not exists (select 1 from public.duelle where id = p_duell and status = 'beendet') then
    raise exception 'Duell ist nicht beendet';
  end if;
  insert into public.chat (text, art, duell) values (left(trim(p_text), 500), 'ergebnis', p_duell)
  on conflict (duell) do nothing;
end $$;

-- Reaktion an-/abschalten (nur feste Emojis)
create or replace function public.chat_reagieren(p_passwort text, p_id bigint, p_spieler text, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  if p_emoji not in ('👍', '😂', '🔥', '😮', '💯') then
    raise exception 'Unbekannte Reaktion';
  end if;
  update public.chat set reaktionen =
    case when coalesce(reaktionen -> p_emoji, '[]') ? p_spieler
      then jsonb_set(reaktionen, array[p_emoji], (reaktionen -> p_emoji) - p_spieler)
      else jsonb_set(reaktionen, array[p_emoji], coalesce(reaktionen -> p_emoji, '[]') || to_jsonb(p_spieler))
    end
  where id = p_id;
end $$;

create or replace function public.admin_chat_loeschen(p_passwort text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  delete from public.chat where id = p_id;
end $$;

revoke execute on function public.chat_holen(text, int) from public;
revoke execute on function public.chat_ungelesen(text, bigint, text) from public;
revoke execute on function public.chat_senden(text, text, text) from public;
revoke execute on function public.chat_ergebnis(text, uuid, text) from public;
revoke execute on function public.chat_reagieren(text, bigint, text, text) from public;
revoke execute on function public.admin_chat_loeschen(text, bigint) from public;
grant execute on function public.chat_holen(text, int) to anon, authenticated;
grant execute on function public.chat_ungelesen(text, bigint, text) to anon, authenticated;
grant execute on function public.chat_senden(text, text, text) to anon, authenticated;
grant execute on function public.chat_ergebnis(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_reagieren(text, bigint, text, text) to anon, authenticated;
grant execute on function public.admin_chat_loeschen(text, bigint) to anon, authenticated;

-- ===== Sitzungs-Schlüssel =====
-- Geräte speichern nicht das Gruppen-Passwort, sondern einen zufälligen Schlüssel („s1.…“), den sie einmalig
-- gegen das Passwort eintauschen. In der Datenbank liegt nur dessen SHA-256-Hash. Überall, wo das
-- Gruppen-Passwort geprüft wird (passwort_ok), gilt auch ein gültiger Schlüssel (max. 1 Jahr alt).
-- Passwort ändern (gruppen-passwort.sql) oder „Alle Geräte abmelden“ im Admin löscht alle Schlüssel.

create table if not exists public.sitzungen (
  hash text primary key,
  erstellt timestamptz not null default now()
);
alter table public.sitzungen enable row level security;
revoke all on public.sitzungen from anon, authenticated;

create or replace function public.passwort_ok(p_passwort text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when p_passwort like 's1.%' then exists (
      select 1 from public.sitzungen
      where hash = encode(digest(p_passwort, 'sha256'), 'hex') and erstellt > now() - interval '1 year'
    )
    else exists (
      select 1 from public.einstellungen
      where schluessel = 'gruppen_passwort' and wert = crypt(coalesce(p_passwort, ''), wert)
    )
  end;
$$;

-- Gruppen-Passwort gegen einen neuen Sitzungs-Schlüssel tauschen (ein Schlüssel nur gegen das echte Passwort)
create or replace function public.sitzung_anlegen(p_passwort text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  schluessel text;
begin
  if p_passwort like 's1.%' or not public.passwort_ok(p_passwort) then
    raise exception 'Falsches Gruppen-Passwort';
  end if;
  schluessel := 's1.' || encode(gen_random_bytes(32), 'hex');
  insert into public.sitzungen (hash) values (encode(digest(schluessel, 'sha256'), 'hex'));
  delete from public.sitzungen where erstellt < now() - interval '1 year';
  return schluessel;
end $$;

-- Admin: alle Geräte abmelden (z. B. bei verlorenem Handy)
create or replace function public.admin_sitzungen_loeschen(p_passwort text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl int;
begin
  if not public.admin_ok(p_passwort) then
    raise exception 'Falsches Admin-Passwort';
  end if;
  delete from public.sitzungen;
  get diagnostics anzahl = row_count;
  return anzahl;
end $$;

revoke execute on function public.sitzung_anlegen(text) from public;
revoke execute on function public.admin_sitzungen_loeschen(text) from public;
grant execute on function public.sitzung_anlegen(text) to anon, authenticated;
grant execute on function public.admin_sitzungen_loeschen(text) to anon, authenticated;
