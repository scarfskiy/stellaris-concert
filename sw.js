const CACHE_NAME = 'stellaris-concert-v1';
const AUDIO_CACHE = 'stellaris-audio-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        './css/base.css',
        './css/stage.css',
        './css/program.css',
        './css/player.css',
        './js/main.js',
        './js/config.js',
        './js/timeline.js',
        './js/starfield.js',
        './js/stage.js',
        './js/audio-engine.js',
        './js/program.js',
        './js/player.js',
        './js/utils.js',
        './assets/cover/stellaris-ost.jpg',
        './assets/cover/apocalypse.jpg',
        './assets/cover/leviathans.jpg',
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== AUDIO_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // 音频文件：网络优先，成功后写入长期缓存；离线时用缓存
  if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.ogg')) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const fetched = fetch(e.request).then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetched;
        })
      )
    );
    return;
  }

  // 静态资源：缓存优先，未命中再网络
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
