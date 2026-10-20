-- Gruppen-Passwort setzen oder ändern
-- 1. Unten bei neues_passwort dein Passwort zwischen die Hochkommas schreiben.
-- 2. Supabase → SQL Editor → New query → einfügen → Run.
-- Gespeichert wird nur ein Hash, nicht das Passwort selbst.
-- Nach einer Änderung müssen alle Mitspieler das neue Passwort einmal eingeben.

do $$
declare
  neues_passwort text := 'HIER-PASSWORT-EINTRAGEN';
begin
  if neues_passwort = 'HIER-PASSWORT-EINTRAGEN' or char_length(neues_passwort) < 6 then
    raise exception 'Bitte oben ein eigenes Passwort mit mindestens 6 Zeichen eintragen.';
  end if;
  insert into public.einstellungen (schluessel, wert)
  values ('gruppen_passwort', extensions.crypt(neues_passwort, extensions.gen_salt('bf')))
  on conflict (schluessel) do update set wert = excluded.wert;
end $$;
