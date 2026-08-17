/**
 * utils.js —— 通用小工具
 */

/** 秒 -> mm:ss */
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 数值限幅 */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** RGB 数组 -> "r,g,b"（用于 rgba() 拼接） */
export const rgbStr = ([r, g, b]) => `${r},${g},${b}`;

/** RGB 数组 -> "#rrggbb"（用于 CSS） */
export const rgbHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

/** 两个 RGB 数组线性插值 */
export function lerpRGB(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
