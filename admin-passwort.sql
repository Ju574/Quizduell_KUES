-- Admin-Passwort setzen oder ändern
-- 1. Unten bei neues_passwort dein Admin-Passwort zwischen die Hochkommas schreiben.
-- 2. Supabase → SQL Editor → New query → einfügen → Run.
-- Gespeichert wird nur ein Hash. Das Admin-Passwort sollte sich vom Gruppen-Passwort unterscheiden.

do $$
declare
  neues_passwort text := 'HIER-PASSWORT-EINTRAGEN';
begin
  if neues_passwort = 'HIER-PASSWORT-EINTRAGEN' or char_length(neues_passwort) < 8 then
    raise exception 'Bitte oben ein eigenes Admin-Passwort mit mindestens 8 Zeichen eintragen.';
  end if;
  insert into public.einstellungen (schluessel, wert)
  values ('admin_passwort', extensions.crypt(neues_passwort, extensions.gen_salt('bf')))
  on conflict (schluessel) do update set wert = excluded.wert;
end $$;
