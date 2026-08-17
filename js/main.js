/**
 * main.js —— 入口（播放器式界面）
 * 组装：全屏星空 / 像素舞台 / 节目单抽屉 / 播放器 / 音乐会整体时间轴(填色)与中场休息；
 * 统一 rAF 循环。顶部仅保留单一「当前幕」指示，避免重复元素。
 */

import { ACTS, TRACKS, INTERMISSION_SECONDS, AUDIO_DIR } from './config.js';
import { buildBounds, totalSeconds, LAST_UPPER_INDEX, locate, setTrackDurations } from './timeline.js';
import { Starfield } from './starfield.js';
import { Stage } from './stage.js';
import { AudioEngine } from './audio-engine.js';
import { Program } from './program.js';
import { Player } from './player.js';
import { rgbHex } from './utils.js';

/** 秒 -> "h:mm:ss" 或 "m:ss" */
function fmtHM(sec) {
  if (!isFinite(sec)) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/* ---------- 像素舞台画布 ---------- */
const stageCanvas = document.getElementById('stage');
stageCanvas.width = 960;
stageCanvas.height = 540;

const audioEl = document.getElementById('audio');
const engine = new AudioEngine(audioEl);
const stage = new Stage(stageCanvas);
stage.setAudio(engine);

/* ---------- 全屏背景星空 ---------- */
const starfield = new Starfield(document.getElementById('starfield'));

/* ---------- 顶部：单一「当前幕」指示 ---------- */
const actSub = document.getElementById('act-sub');
const actDot = document.getElementById('act-dot');
function setActText(txt, color) {
  actSub.querySelector('.act-text').textContent = txt;
  if (color) { actDot.style.setProperty('--c', rgbHex(color)); }
}
function setActUI(actIndex) {
  const act = ACTS[actIndex];
  stage.setAct(actIndex);
  setActText(`${act.name}「${act.title}」`, act.light);
}

/* ---------- 音乐会整体时间轴（填色进度） ---------- */
const timelineBar = document.getElementById('concert-timeline');
const concertTotal = document.getElementById('concert-total');
const segEls = [];                 // 每首曲目的段，下标对 TRACKS
const interSeg = document.createElement('div');
const fill = document.createElement('div');

/** 各曲目真实时长（秒），元数据就绪后回填，用于全局进度条的曲段长度 */
const durs = {};

function buildTimeline() {
  const b = buildBounds();
  interSeg.className = 'tl-seg tl-inter';
  interSeg.style.flexGrow = String(INTERMISSION_SECONDS);
  interSeg.title = '中场休息 · 约 20:00';
  interSeg.addEventListener('click', () => {
    if (player.state === 'intermission') player.skipIntermission();
    else if (player.current >= 0) player.enterIntermission();
  });

  const frag = document.createDocumentFragment();
  for (let i = 0; i < TRACKS.length; i++) {
    const seg = document.createElement('div');
    seg.className = 'tl-seg';
    seg.style.flexGrow = String(b[i].dur); // 曲段按真实时长比例
    seg.title = `${i + 1}. ${TRACKS[i].title} · ${TRACKS[i].duration}${TRACKS[i].encore ? ' ★' : ''}`;
    seg.addEventListener('click', () => player.playTrack(i));
    // 缓存/缓冲进度覆盖层
    const cacheEl = document.createElement('i');
    cacheEl.className = 'tl-cache';
    seg.appendChild(cacheEl);
    segEls[i] = seg;
    frag.appendChild(seg);
  }
  timelineBar.appendChild(frag);
  segEls[LAST_UPPER_INDEX].after(interSeg);

  // 填色进度层：覆盖整条时间轴（含中场），指针宽度即全局进度
  fill.className = 'tl-fill';
  timelineBar.appendChild(fill);
}

/** 某曲目元数据就绪：记录真实时长并重排时间轴长度 */
function recordDuration(index, d) {
  if (index < 0 || !isFinite(d) || d <= 0) return;
  if (durs[index] === d) return;
  durs[index] = d;
  setTrackDurations({ ...durs });
  const b = buildBounds();
  TRACKS.forEach((_, i) => { if (segEls[i]) segEls[i].style.flexGrow = String(b[i].dur); });
  concertTotal.textContent = `0:00 / ${fmtHM(b.total)}`;
}

/** 高亮当前曲段 + 更新填色进度（全局累计进度） */
function updateTimeline(overall, inRest) {
  const b = buildBounds();
  const ev = inRest ? null : locate(overall);
  segEls.forEach((el, i) => el.classList.toggle('active', !!ev && !inRest && ev.index === i));
  interSeg.classList.toggle('active', inRest);
  const pct = Math.min(100, (overall / b.total) * 100);
  fill.style.width = `${pct}%`;
}

buildTimeline();

/* ---------- 节目单抽屉 ---------- */
const drawer = document.getElementById('drawer');
const drawerMask = document.getElementById('drawer-mask');
const btnProgram = document.getElementById('btn-program');
const btnClose = document.getElementById('btn-close');

const openDrawer = () => {
  drawer.classList.add('open');
  drawerMask.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
};
const closeDrawer = () => {
  drawer.classList.remove('open');
  drawerMask.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
};
btnProgram.addEventListener('click', openDrawer);
btnClose.addEventListener('click', closeDrawer);
drawerMask.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

const program = new Program(document.getElementById('drawer-body'), (index) => {
  setActUI(TRACKS[index].act);
  player.playTrack(index);
  closeDrawer();
});

/* ---------- 中场休息浮层 ---------- */
const overlay = document.getElementById('intermission-overlay');
const interRemain = document.getElementById('intermission-remain');
const interSkip = document.getElementById('intermission-skip');

/* ---------- 播放器 ---------- */
const player = new Player(engine, {
  onState: (current, playing) => program.updateActive(current, playing),
  onTrackChange: (index) => {
    setActUI(TRACKS[index].act);
    program.updateActive(index, false);
    recordDuration(index, audioEl.duration);
  },
  onError: (index) => {
    program.markMissing(index);
    player.dom.sub.textContent = '音频待添加 · 请将文件放入 audio/ 目录';
    player.dom.sub.classList.add('warn');
  },
  onIntermission: (active) => {
    overlay.hidden = !active;
    stage.setIntermission(active);
    if (active) {
      setActText('中场休息 · 稍作休整', ACTS[3].light);
    } else {
      setActUI(TRACKS[player.current].act);
    }
  },
  onOverall: (overall, inRest) => {
    updateTimeline(overall, inRest);
    concertTotal.textContent = `${fmtHM(overall)} / ${fmtHM(totalSeconds())}`;
  },
  onEnd: () => {
    document.getElementById('btn-play').textContent = '▶';
  },
});

interSkip.addEventListener('click', () => player.skipIntermission());
setActUI(0);

// 曲目真实时长一旦可得，重排全局时间轴曲段
audioEl.addEventListener('durationchange', () => recordDuration(player.current, audioEl.duration));

/* ---------- 启动加载页 + Service Worker 通信 ---------- */
const boot = document.getElementById('boot');
const bootFill = document.getElementById('boot-fill');
const bootSub = document.getElementById('boot-sub');
let swReg = null;

function swPost(msg) {
  if (swReg && swReg.active) swReg.active.postMessage(msg);
}
window.__swPost = swPost; // 供 player.js 请求预取

function prefetchUrls(fromIndex) {
  const list = [];
  for (const t of [TRACKS[fromIndex], TRACKS[fromIndex + 1]]) {
    if (t && t.file) list.push(AUDIO_DIR + t.file);
  }
  return list;
}

function indexOfAudioUrl(url) {
  const i = url.indexOf(AUDIO_DIR);
  if (i < 0) return -1;
  const rel = url.slice(i + AUDIO_DIR.length);
  return TRACKS.findIndex((t) => t.file === rel);
}

function markCached(index) {
  const seg = segEls[index];
  if (!seg) return;
  seg.classList.add('cached');
  const cacheEl = seg.querySelector('.tl-cache');
  if (cacheEl) cacheEl.style.width = '100%';
}

function onPrefetchProgress(m) {
  const i = indexOfAudioUrl(m.url);
  if (i < 0) return;
  if (m.done) {
    markCached(i);
    if (i === 0) {
      bootSub.textContent = '首曲已缓存 · 正在预热舞台…';
      bootFill.style.width = '100%';
    }
    return;
  }
  if (i === 0) {
    const pct = m.total ? Math.min(100, Math.round((m.received / m.total) * 100)) : 0;
    bootFill.style.width = `${pct}%`;
    bootSub.textContent = `正在缓存 ${String(i + 1).padStart(2, '0')} ${TRACKS[i].title} · ${pct}%`;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      swReg = reg;
      if (reg.active) swPost({ type: 'prefetch', urls: prefetchUrls(0) });
      else reg.addEventListener('statechange', () => { if (reg.active) swPost({ type: 'prefetch', urls: prefetchUrls(0) }); });
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'prefetch-progress') onPrefetchProgress(m);
    else if (m.type === 'cache-status') {
      for (const [url, ok] of Object.entries(m.results || {})) {
        const i = indexOfAudioUrl(url);
        if (i >= 0 && ok) markCached(i);
      }
    }
  });
}

/* 首曲可播即进入主界面；超时兜底 + 加载失败也放行 */
function hideBoot() {
  if (boot.classList.contains('done')) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove?.(), 600);
}
audioEl.addEventListener('canplay', hideBoot);
audioEl.addEventListener('error', hideBoot);
setTimeout(hideBoot, 15000);

/* ---------- 统一动画循环 ---------- */
let lastT = performance.now();
let lastCacheCheck = 0;
function loop(t) {
  const dt = Math.min(64, t - lastT);
  lastT = t;

  engine.update(dt);
  player.tick(dt);
  starfield.frame(t, dt);
  stage.frame(t, dt);

  // 当前曲目缓冲进度 -> 时间轴曲段覆盖层
  const ci = player.current;
  if (ci >= 0 && !segEls[ci].classList.contains('cached')) {
    const el = audioEl;
    if (isFinite(el.duration) && el.duration > 0 && el.buffered.length) {
      const end = el.buffered.end(el.buffered.length - 1);
      const cacheEl = segEls[ci].querySelector('.tl-cache');
      if (cacheEl) cacheEl.style.width = `${Math.min(100, (end / el.duration) * 100)}%`;
    }
  }
  // 每 10 秒扫描一次已完整缓存的曲目（SW 缓存状态回填）
  if (t - lastCacheCheck > 10000) {
    lastCacheCheck = t;
    if (swReg && swReg.active) {
      swPost({ type: 'cache-status', urls: TRACKS.map((tr) => AUDIO_DIR + tr.file) });
    }
  }

  if (player.state === 'intermission') {
    const sec = Math.max(0, Math.ceil(player._restRemain));
    interRemain.textContent = fmtHM(sec);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);