/**
 * main.js —— 入口（播放器式界面）
 * 组装：全屏星空 / 像素舞台 / 节目单抽屉 / 播放器 / 音乐会整体时间轴(填色)与中场休息；
 * 统一 rAF 循环。顶部仅保留单一「当前幕」指示，避免重复元素。
 */

import { ACTS, TRACKS, INTERMISSION_SECONDS } from './config.js';
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

/* ---------- 统一动画循环 ---------- */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(64, t - lastT);
  lastT = t;

  engine.update(dt);
  player.tick(dt);
  starfield.frame(t, dt);
  stage.frame(t, dt);

  if (player.state === 'intermission') {
    const sec = Math.max(0, Math.ceil(player._restRemain));
    interRemain.textContent = fmtHM(sec);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);