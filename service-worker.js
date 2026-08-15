/* ============================================
   Service Worker — Cache offline (PWA)

   IMPORTANTE:
   - Cacheia APENAS o shell estatico (HTML, CSS, JS, manifest)
   - NUNCA cacheia respostas da API (/api/*) nem /docs
     -> garante que sorteios e dados aparecem em tempo real
   - Estrategia: stale-while-revalidate para o shell
   ============================================ */

const CACHE_NAME = 'copa-avosos-v30';

const ASSETS = [
  './',
  './index.html',
  './sobre.html',
  './memorias.html',
  './inscricao.html',
  './login.html',
  './minha-area.html',
  './campeonato.html',
  './album.html',
  './ajuda.html',
  './admin/index.html',
  './manifest.json',
  './css/styles.css',
  './css/admin.css',
  './js/main.js',
  './js/storage.js',
  './js/api.js',
  './js/data.js',
  './js/components.js',
  './js/inscricao.js',
  './js/campeonato.js',
  './js/album.js',
  './js/admin.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting()) // ativa imediatamente
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // assume controle de todas as abas
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. NUNCA interceptar a API ou a documentacao
  //    -> garante leitura fresca a cada chamada
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/docs') ||
      url.pathname.startsWith('/openapi')) {
    return; // browser faz a request normal, sem SW
  }

  // 2. Apenas same-origin
  if (url.origin !== location.origin) return;

  // 3. Para assets: stale-while-revalidate
  //    Retorna do cache imediatamente, mas atualiza em background
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone));
        }
        return resp;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// Permite que o front force a ativacao via postMessage
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
