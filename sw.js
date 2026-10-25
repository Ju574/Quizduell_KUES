'use strict';

// Service Worker für die App auf dem Startbildschirm.
// Immer zuerst aus dem Netz laden (damit nie eine alte Version hängen bleibt); nur ohne Netz kommt die
// zuletzt geladene Fassung der Seitendateien aus dem Zwischenspeicher. Anfragen an andere Server
// (Supabase mit Fragen, Lösungen, Chat) werden nicht angefasst und nie gespeichert.

const SPEICHER = 'pruefi-seite-1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== SPEICHER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(SPEICHER).then((s) => s.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(async () => (await caches.match(anfrage)) || (anfrage.mode === 'navigate' && (await caches.match('./', { ignoreSearch: true }))) || Response.error())
  );
});
