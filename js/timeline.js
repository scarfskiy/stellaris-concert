/**
 * timeline.js —— 音乐会整体时间轴模型
 *
 * 把顺序播放当作一条连续的时间轴（曲目 + 中场休息），用于：
 *   - 计算每首曲目在整场中的起止位置（整体进度条）
 *   - 判断中场休息节点与上/下半场边界
 *   - 定位任意整体时刻所属的事件
 *
 * 曲目时长默认取 config，若某曲目真实音频元数据就绪（setTrackDurations），
 * 则优先使用真实时长，保证全局进度条曲段长度与实际相符。
 */

import { TRACKS, INTERMISSION_SECONDS } from './config.js';

/** "mm:ss" / "h:mm:ss" -> 秒 */
export function secondsOf(str) {
  const parts = String(str).split(':').map(Number);
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}

/** 曲目时长覆盖表：index -> 真实秒数（可为空对象） */
const overrides = {};
/** 注入实际音频时长（key=曲目下标，value=秒） */
export function setTrackDurations(map) {
  for (const k in map) overrides[k] = map[k];
}
/** 取某曲目时长（真实优先，否则 config） */
export const durOf = (i) => (overrides[i] && isFinite(overrides[i]) ? overrides[i] : secondsOf(TRACKS[i].duration));

/** 上半场曲目（act=0/1）、下半场曲目（act=2/3） */
export const UPPER = TRACKS.map((t, i) => i).filter((i) => TRACKS[i].act <= 1);
export const LOWER = TRACKS.map((t, i) => i).filter((i) => TRACKS[i].act >= 2);

/** 上半场最后一首下标、下半场第一首下标 */
export const LAST_UPPER_INDEX = UPPER[UPPER.length - 1];
export const FIRST_LOWER_INDEX = LOWER[0];

/**
 * 构建整体时间轴边界。
 * @returns {{[index]:{start,end,dur}, intermissionStart, intermissionEnd, total}}
 */
export function buildBounds() {
  const bounds = [];
  let acc = 0;
  let intermissionStart = -1;
  let intermissionEnd = -1;
  for (let i = 0; i < TRACKS.length; i++) {
    const d = durOf(i);
    bounds[i] = { start: acc, end: acc + d, dur: d };
    acc += d;
    if (i === LAST_UPPER_INDEX) {
      // 上半场结束插入中场休息
      intermissionStart = acc;
      acc += INTERMISSION_SECONDS;
      intermissionEnd = acc;
    }
  }
  bounds.intermissionStart = intermissionStart;
  bounds.intermissionEnd = intermissionEnd;
  bounds.total = acc;
  return bounds;
}

/** 音乐会总长（秒），随真实时长动态更新 */
export function totalSeconds() {
  return buildBounds().total;
}

/** 由「曲目下标 + 曲内进度秒」计算当前整体进度（音乐会时钟）秒 */
export function overallFromTrack(index, within) {
  return buildBounds()[index].start + within;
}

/** 中场：整体进度 = 中场开始点 + 已休息秒数 */
export function overallFromIntermission(elapsed) {
  return buildBounds().intermissionStart + elapsed;
}

/**
 * 由整体秒定位所属事件。
 * @returns {{type:'track',index:number}|{type:'intermission',elapsed:number}}
 */
export function locate(overallSec) {
  const b = buildBounds();
  if (overallSec >= b.intermissionStart && overallSec < b.intermissionEnd) {
    return { type: 'intermission', elapsed: overallSec - b.intermissionStart };
  }
  if (overallSec >= b.total) return { type: 'track', index: TRACKS.length - 1 };
  for (let i = 0; i < TRACKS.length; i++) {
    if (overallSec < b[i].end) return { type: 'track', index: i };
  }
  return { type: 'track', index: TRACKS.length - 1 };
}