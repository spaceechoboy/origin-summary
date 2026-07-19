/* Origin Summary PWA service worker — 앱 셸 캐시(설치형 PWA) + network-first.
   외부 RPC/API/CDN은 통과(캐시 안 함). */
const CACHE = 'lgns-summary-v6';
const SHELL = [
  './', './index.html', './app.js', './contracts.js',
  './src/codec.js', './src/rpc.js', './src/scan_long.js', './src/scan_tokens.js',
  './src/scan_turbine.js', './src/scan_anubis_extra.js', './src/scanner.js',
  './src/aggregate.js', './src/prices.js', './src/display.js',
  './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 앱 셸(같은 출처)만 network-first→cache 폴백. 외부 API/RPC는 그대로 통과.
  if (url.origin === location.origin && e.request.method === 'GET') {
    // HTML뿐 아니라 JS/JSON 셸도 HTTP 캐시 우회(cache:'reload') — network-first여도 e.request를 쓰면
    // 브라우저 HTTP 캐시에서 구 모듈이 그대로 돌아온다(2026-07-19 실측: 스캐너는 새 필드를 내는데
    // 화면은 계속 0. GitHub Pages의 긴 JS 캐시에서 배포 후에도 재현되는 문제).
    const isHTML = e.request.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname.endsWith('/');
    const isCode = /\.(js|json)$/.test(url.pathname);
    const req = (isHTML || isCode) ? new Request(e.request.url, { cache: 'reload' }) : e.request;
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
    );
  }
});
