// FORJA: funciona sin internet y envía recordatorios. Sube la versión al cambiar los archivos.
const CACHE = 'forja-v4';
const CDN = 'https://www.gstatic.com';   // SDK de Firebase: se guarda para poder abrir la app sin internet
const FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Solo borra versiones viejas de la app, nunca 'forja-state' (datos para los recordatorios).
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('forja-v') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero (para recibir actualizaciones), caché si no hay conexión.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== location.origin && !(u.origin === CDN && u.pathname.startsWith('/firebasejs/'))) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// ---------- Recordatorios en segundo plano (Chrome/Android con la app instalada) ----------
const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

async function checkReminder() {
  const c = await caches.open('forja-state');
  const r = await c.match('./state.json');
  if (!r) return;
  const st = await r.json();
  if (!st.notif) return;
  const now = new Date(), k = dk(now);
  if (st.done === k) return;                       // ya entrenó hoy
  const [h, m] = String(st.hora || '06:00').split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < h * 60 + m) return;                   // todavía no es la hora
  const slot = mins >= 20 * 60 ? 'noche' : 'dia';
  const nr = await c.match('./notified.json');
  const nd = nr ? await nr.json() : {};
  if (nd[k + slot]) return;                        // ya se avisó en este horario
  await c.put('./notified.json', new Response(JSON.stringify({ [k + 'dia']: nd[k + 'dia'], [k + 'noche']: nd[k + 'noche'], [k + slot]: 1 })));
  const name = st.nombre || '';
  await self.registration.showNotification(
    slot === 'noche' ? '⚠️ Última llamada, ' + name : '🔥 Hora de entrenar, ' + name,
    {
      body: slot === 'noche' ? 'Aún no cumples hoy. 7 minutos bastan. Nunca dos días seguidos.' : (st.frase || 'Tu tarea de hoy te espera.') + (st.racha ? ' · Racha: ' + st.racha + ' días' : ''),
      icon: 'icon-192.png', badge: 'icon-192.png', tag: 'forja', renotify: true, data: { url: './' }
    });
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'forja-diario') e.waitUntil(checkReminder());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
