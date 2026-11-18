/* FOCUS AI Content Studio — Service Worker
   설치 가능한 PWA 조건을 채우기 위한 최소·안전한 캐시 전략.
   - 정적 shell: 네트워크 우선, 실패 시 캐시 fallback
   - 시세 API 등 외부/비-GET 요청: 손대지 않고 그대로 통과
*/
const CACHE_NAME = 'focus-shell-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 개별 캐시: 한 파일이 404여도 설치 자체는 실패하지 않게 한다.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { cache: 'reload' }));
            if (res && res.ok) await cache.put(url, res.clone());
          } catch (e) {
            /* 무시: 다음 네트워크 요청에서 채워진다 */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET만 다룬다. POST 등은 브라우저 기본 동작.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 외부 도메인(시세 워커, Gemini, 위키미디어 등)은 캐시하지 않고 그대로 통과.
  if (url.origin !== self.location.origin) return;

  // API·실시간 데이터 경로는 절대 캐시하지 않는다.
  if (url.pathname.includes('/api/')) return;

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>FOCUS AI — 오프라인</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#09090f;color:#e9e7f5;font:15px/1.6 system-ui,sans-serif"><div style="text-align:center"><div style="font-size:20px;font-weight:800;letter-spacing:-.4px">FOCUS <span style="color:#c34dff">AI</span></div><p style="color:#9697aa;margin:8px 0 0">오프라인 상태입니다. 연결되면 자동으로 다시 열립니다.</p></div></body>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}
