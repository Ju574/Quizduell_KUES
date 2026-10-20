-- Prüfi-Duell: Datenbank einrichten
-- Supabase → SQL Editor → New query → diesen kompletten Text einfügen → Run.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.

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

-- Zugriffsrechte: Anmeldung nur per Name, daher dürfen alle lesen und schreiben – aber nichts löschen.
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
