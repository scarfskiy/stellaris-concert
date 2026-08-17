const CACHE_NAME = 'stellaris-concert-v1';
const AUDIO_CACHE = 'stellaris-audio-v1';
const AUDIO_TYPE = 'audio/mpeg';
const RANGE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'max-age=600',
};

/* ---------- 安装：预缓存静态资源 ---------- */
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

/* ---------- 工具 ---------- */

/** 是否已存在「完整文件」缓存（排除 206 部分响应） */
async function isCachedFull(url) {
  const cache = await caches.open(AUDIO_CACHE);
  const r = await cache.match(url);
  return !!(r && r.ok && !r.headers.get('content-range'));
}

/** 把完整缓存按 Range 请求切片返回（206 / 416） */
async function serveRange(request, res) {
  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const range = request.headers.get('range');
  if (!range) {
    return new Response(buf, {
      status: 200,
      headers: { ...RANGE_HEADERS, 'Content-Type': AUDIO_TYPE, 'Content-Length': String(total) },
    });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : total - 1;
  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { ...RANGE_HEADERS, 'Content-Range': `bytes */${total}` },
    });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      ...RANGE_HEADERS,
      'Content-Type': AUDIO_TYPE,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    },
  });
}

/* ---------- 后台预取（边听边下） ---------- */

const prefetching = new Set();

async function prefetchAudio(url, source) {
  if (prefetching.has(url)) return;
  if (await isCachedFull(url)) {
    source?.postMessage({ type: 'prefetch-progress', url, received: 0, total: 0, done: true });
    return;
  }
  prefetching.add(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    let lastSent = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received - lastSent > 512 * 1024) {
        lastSent = received;
        source?.postMessage({ type: 'prefetch-progress', url, received, total, done: false });
      }
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('content-type') || AUDIO_TYPE);
    headers.set('Content-Length', String(received));
    headers.set('Cache-Control', 'max-age=600');
    await caches.open(AUDIO_CACHE).then((cache) =>
      cache.put(url, new Response(buf, { status: 200, headers }))
    );
    source?.postMessage({ type: 'prefetch-progress', url, received, total, done: true });
  } finally {
    prefetching.delete(url);
  }
}

/* ---------- 消息 ---------- */

self.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'prefetch') {
    (msg.urls || []).forEach((u) => prefetchAudio(u, e.source));
  } else if (msg.type === 'cache-status') {
    Promise.all((msg.urls || []).map(async (u) => [u, await isCachedFull(u)]))
      .then((results) =>
        e.source?.postMessage({
          type: 'cache-status',
          results: Object.fromEntries(results),
        })
      );
  }
});

/* ---------- 请求 ---------- */

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // 音频：缓存完整文件 -> Range 切片；否则网络透传（流式播放）
  if (path.includes('/audio/') && path.endsWith('.mp3')) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(AUDIO_CACHE);
        const cached = await cache.match(e.request);
        if (cached && cached.ok && !cached.headers.get('content-range')) {
          return serveRange(e.request, cached);
        }
        const res = await fetch(e.request);
        // 仅缓存完整 200 响应（如 <link rel=preload> 的请求）；206 部分响应不缓存
        if (res.ok && res.status === 200 && !e.request.headers.has('range')) {
          cache.put(e.request, res.clone()).catch(() => {});
        }
        return res;
      })()
    );
    return;
  }

  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
