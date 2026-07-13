const VERSION = 'v2';
const SHELL_CACHE = `recipebox-shell-${VERSION}`;
const IMAGE_CACHE = `recipebox-images-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
  '/css/style.css',
  '/js/main.js',
  '/js/api.js',
  '/js/state.js',
  '/js/router.js',
  '/js/ui.js',
  '/js/lib/image.js',
  '/js/lib/timer.js',
  '/js/lib/wake-lock.js',
  '/js/lib/recipe-format.js',
  '/js/pages/login.js',
  '/js/pages/dashboard.js',
  '/js/pages/recipe-detail.js',
  '/js/pages/recipe-form.js',
  '/js/pages/cooking-mode.js',
  '/js/pages/groups.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isRecipeImage = url => /^\/api\/recipes\/[^/]+\/image/.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Fotos: cache primeiro. É o que faz o modo cozinha funcionar sem sinal —
  // e a resposta é imutável até a foto ser trocada (o ETag muda junto).
  if (isRecipeImage(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Demais chamadas de API sempre vão à rede: uma receita servida do cache
  // poderia estar desatualizada, e não há como saber sem perguntar.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Só respostas boas entram no cache. A versão anterior guardava qualquer
  // coisa — inclusive 404 e 500, que depois eram servidos como se fossem
  // conteúdo válido.
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Devolve o cache na hora (app abre instantâneo) e atualiza por trás.
  const response = cached || (await network);
  if (response) return response;

  // Offline e sem cache: uma navegação ainda pode ser servida pelo shell.
  if (request.mode === 'navigate') {
    const shell = await cache.match('/index.html');
    if (shell) return shell;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
