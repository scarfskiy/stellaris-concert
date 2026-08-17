/**
 * audio-engine.js —— 音频引擎
 *
 * HTMLAudioElement -> MediaElementSource -> AnalyserNode -> destination
 * AnalyserNode 把频谱切成五个频段，供舞台动画驱动：
 *   low      0-80Hz      指挥挥棒 / 打击乐 / 铜管
 *   midLow   80-250Hz    大提琴 / 低音提琴
 *   mid      250-2000Hz  中提琴 / 木管
 *   midHigh  2000-6000Hz 小提琴
 *   high     6000Hz+     竖琴 / 钢琴
 *
 * 频段范围 / 增益均可在此调整。
 */

export const BAND_RANGES = {
  low:     [0, 80],
  midLow:  [80, 250],
  mid:     [250, 2000],
  midHigh: [2000, 6000],
  high:    [6000, 14000],
};

/** 各频段感知增益（补偿高频能量天然偏低的问题） */
const BAND_GAIN = { low: 1.15, midLow: 1.3, mid: 1.35, midHigh: 1.7, high: 2.2 };

export class AudioEngine {
  /** @param {HTMLAudioElement} audioEl */
  constructor(audioEl) {
    this.el = audioEl;
    this.ctx = null;
    this.analyser = null;
    this.freqData = null;

    /** 五频段能量 0~1 */
    this.bands = { low: 0, midLow: 0, mid: 0, midHigh: 0, high: 0 };
    /** 全局综合能量 0~1（驱动灯光亮度 / 整体动作幅度） */
    this.energy = 0;
    /** 是否正在出声（用于暂停时全员静止） */
    this.playing = false;

    // 音量缓动显示值
    this._smooth = { low: 0, midLow: 0, mid: 0, midHigh: 0, high: 0 };
  }

  /**
   * 初始化 Web Audio 图（必须由用户手势触发，见 player.js）
   * MediaElementSource 只能对同一 element 创建一次。
   *
   * 关键：如果取到 MediaElementSource 后，AudioContext 处于 'suspended'，
   * 元素仍会照常播放（时间推进）但耳朵里听不到任何声音（被图形接管后
   * 必须由 ctx 输出）。因此在创建后立即 await resume()，确保真有声音。
   * @returns {Promise<void>}
   */
  async ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        try { await this.ctx.resume(); } catch { /* 忽略 */ }
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // 极老浏览器：退化为纯播放、无可视化

    const ctx = new AC();
    // 若浏览器未立即放行（部分策略对新建上下文保守），显式 resume 一次
    if (ctx.state === 'suspended' && ctx.resume) {
      try { await ctx.resume(); } catch { /* 忽略 */ }
    }
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const src = ctx.createMediaElementSource(this.el);
    src.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  /** 每帧调用：更新频段能量（rAF 循环里，见 main.js） */
  update(dt) {
    if (!this.analyser || !this.playing || this.el.paused) {
      // 暂停时能量平滑衰减到 0（不突兀）
      const k = Math.min(1, dt / 400);
      for (const key in this.bands) {
        this._smooth[key] *= 1 - k;
        this.bands[key] = this._smooth[key];
      }
      this.energy = (this.bands.low + this.bands.midLow + this.bands.mid + this.bands.midHigh + this.bands.high) / 5;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;

    let sum = 0;
    for (const key in BAND_RANGES) {
      const [lo, hi] = BAND_RANGES[key];
      const from = Math.max(0, Math.floor(lo / hzPerBin));
      const to = Math.min(this.freqData.length - 1, Math.ceil(hi / hzPerBin));
      let acc = 0;
      for (let i = from; i <= to; i++) acc += this.freqData[i];
      const avg = acc / Math.max(1, to - from + 1) / 255;

      // 增益 + 限幅 + 时间平滑（上升快、下降慢，动作更跟手）
      const target = Math.min(1, avg * BAND_GAIN[key]);
      const prev = this._smooth[key];
      this._smooth[key] = target > prev ? prev + (target - prev) * 0.55 : prev + (target - prev) * 0.18;
      this.bands[key] = this._smooth[key];
      sum += this._smooth[key];
    }
    this.energy = sum / 5;
  }
}
