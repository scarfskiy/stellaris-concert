/**
 * starfield.js —— Hero 区缓慢流动的星空粒子
 * 多层深度视差：滚动页面时远星慢移、近星快移。
 */

const LAYERS = [
  { count: 60, size: 1,   speed: 0.06, alpha: 0.5 },  // 远景
  { count: 45, size: 1.6, speed: 0.12, alpha: 0.75 }, // 中景
  { count: 28, size: 2.4, speed: 0.2,  alpha: 1 },    // 近景（含少量金色/紫色星）
];

export class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.scrollY = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('scroll', () => { this.scrollY = window.scrollY; }, { passive: true });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.build();
  }

  /** 重建星点 */
  build() {
    this.stars = [];
    LAYERS.forEach((L, li) => {
      for (let i = 0; i < L.count; i++) {
        this.stars.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          layer: li,
          size: L.size * (0.7 + Math.random() * 0.6),
          vx: (Math.random() - 0.5) * 6 * L.speed,   // 缓慢漂移
          vy: (2 + Math.random() * 6) * L.speed,
          tw: Math.random() * Math.PI * 2,            // 闪烁相位
          twSpeed: 0.4 + Math.random() * 1.2,
          // 少量彩色星：紫 / 金
          color: Math.random() < 0.06 ? '#f5c86b' : Math.random() < 0.1 ? '#b7a8ff' : '#e8f0ff',
        });
      }
    });
  }

  /** 每帧调用 */
  frame(t, dt) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const dts = dt / 1000;

    for (const s of this.stars) {
      const L = LAYERS[s.layer];
      // 缓慢流动
      s.x += s.vx * dts;
      s.y += s.vy * dts;
      if (s.y > h + 4) { s.y = -4; s.x = Math.random() * w; }
      if (s.x < -4) s.x = w + 4;
      if (s.x > w + 4) s.x = -4;

      // 视差偏移：深度越大，滚动跟随越明显
      const px = s.x - this.scrollY * L.speed * 0.35;
      const py = s.y - this.scrollY * L.speed * 0.12;

      // 闪烁
      const twinkle = 0.6 + 0.4 * Math.sin(t / 1000 * s.twSpeed * Math.PI * 2 + s.tw);
      ctx.globalAlpha = L.alpha * twinkle;
      ctx.fillStyle = s.color;
      // 像素感：取整绘制
      ctx.fillRect(Math.round(px), Math.round(py), Math.ceil(s.size), Math.ceil(s.size));
    }
    ctx.globalAlpha = 1;
  }
}
