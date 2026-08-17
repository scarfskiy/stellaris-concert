/**
 * stage.js —— 像素风交响舞台渲染
 *
 * 结构：星云幕布 -> 舞台地板（梯形）-> 聚光灯 -> 乐团小人（按 SECTIONS 排列）
 * 小人由 2 像素网格色块拼成，动作分 3 帧，由所属频段能量驱动；
 * 暂停时全员静止，仅保留呼吸般的微起伏。
 *
 * 关键可调项都在 config.js（人数 / 坐标 / 频段映射 / 幕色）。
 */

import { STAGE_W, STAGE_H, ACTS, SECTIONS, SKIN_TONES } from './config.js';
import { rgbStr, lerpRGB } from './utils.js';

/** 像素格尺寸：1 格 = 逻辑坐标 2px，人物约 8x12 格（16x24px） */
const P = 2;
/** 人物半宽（格数），身高 12 格：头4 + 身6 + 腿2 */
const HW = 3, HH = 12;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; // 保持像素锯齿

    this.actIndex = 0;
    this.light = ACTS[0].light.slice();           // 当前灯色（平滑过渡用）
    this.lightIntensity = 0.4;                    // 灯光亮度 0~1
    this.playing = false;
    this.intermission = false;                    // 中场休息状态（暖光、安静）

    /** @type {import('./audio-engine.js').AudioEngine} */
    this.audio = null;
    this.time = 0;

    // 生成乐手：每个声部按 count / spread 展开座位
    this.musicians = [];
    SECTIONS.forEach((sec, si) => {
      const n = sec.count;
      for (let i = 0; i < n; i++) {
        // 居中排开；n=1 时直接落座
        const offset = n === 1 ? 0 : (i - (n - 1) / 2) * sec.spread;
        this.musicians.push({
          sec,
          x: sec.x + offset,
          y: sec.y,
          face: offset < -1 ? 1 : offset > 1 ? -1 : (si % 2 ? 1 : -1), // 朝向舞台中心
          phase: Math.random() * Math.PI * 2,        // 呼吸/动作相位错开
          frame: 0,                                   // 0/1/2 动画帧
          frameTimer: Math.random() * 300,
          skin: SKIN_TONES[(si + i) % SKIN_TONES.length],
          breath: Math.random() * Math.PI * 2,        // 暂停时的呼吸相位
        });
      }
    });

    // 幕布星云参数（固定随机种子布局，避免每帧闪烁）
    this.nebulaStars = Array.from({ length: 90 }, () => ({
      x: Math.random() * STAGE_W,
      y: 90 + Math.random() * 150,
      s: Math.random() < 0.8 ? 2 : 3,
      tw: Math.random() * Math.PI * 2,
      c: Math.random() < 0.12 ? '#f5c86b' : Math.random() < 0.25 ? '#8b7bff' : '#cdd8ff',
    }));
  }

  /** 绑定音频引擎（main.js 调用） */
  setAudio(audio) { this.audio = audio; }

  /** 切换目标幕（灯光平滑过渡） */
  setAct(i) { this.actIndex = i; }

  setPlaying(v) { this.playing = v; }

  /** 切换中场休息氛围：暖琥珀光、乐手安静 */
  setIntermission(v) { this.intermission = v; }

  /* ================= 主帧 ================= */
  frame(t, dt) {
    this.time = t;
    const { ctx } = this;

    // ---- 灯色向目标过渡（中场休息为暖琥珀色） ----
    const target = this.intermission
      ? [255, 162, 96]
      : ACTS[this.actIndex].light;
    const k = Math.min(1, dt / 900);
    this.light = lerpRGB(this.light, target, k);

    // ---- 亮度：随音量，暂停时回落到基础值；中场休息时降低且微微呼吸 ----
    let targetLit;
    if (this.intermission) {
      targetLit = 0.24 + 0.05 * Math.sin(t / 1600); // 休息时的柔和呼吸光
    } else {
      targetLit = this.playing ? 0.45 + this.audio.energy * 0.55 : 0.35;
    }
    this.lightIntensity += (targetLit - this.lightIntensity) * Math.min(1, dt / 500);

    // ---- 背景 ----
    this.drawBackdrop(t);
    this.drawFloor(t);
    this.drawSpotlights(t);
    this.drawMusicians(t, dt);
    this.drawFrontGlow();
  }

  /* ================= 背景：深空 + 星云幕布 ================= */
  drawBackdrop(t) {
    const { ctx } = this;
    const [r, g, b] = this.light;

    // 深空底色（带一点点幕色）
    const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    bg.addColorStop(0, '#04040c');
    bg.addColorStop(0.45, `rgb(${8 + r * 0.06},${8 + g * 0.06},${18 + b * 0.1})`);
    bg.addColorStop(1, '#07071a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // 星云（随幕色变化的柔和光斑）
    const clouds = [
      { x: 240, y: 140, rx: 260, ry: 110, a: 0.16 },
      { x: 700, y: 120, rx: 300, ry: 120, a: 0.14 },
      { x: 480, y: 190, rx: 380, ry: 90,  a: 0.1 },
    ];
    for (const c of clouds) {
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(c.rx, c.ry));
      grad.addColorStop(0, `rgba(${rgbStr(this.light)},${c.a * this.lightIntensity + 0.05})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, c.ry / c.rx);
      ctx.translate(-c.x, -c.y);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 幕布星点（缓慢闪烁）
    for (const s of this.nebulaStars) {
      const tw = 0.5 + 0.5 * Math.sin(t / 1000 * 1.4 + s.tw);
      ctx.globalAlpha = 0.25 + tw * 0.6;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x | 0, s.y | 0, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // 拱形幕布边缘（像素锯齿的悬挂褶皱）
    ctx.fillStyle = 'rgba(10,10,26,0.9)';
    for (let x = 0; x < STAGE_W; x += 24) {
      const h = 26 + (Math.sin(x * 0.05) * 0.5 + 0.5) * 16;
      ctx.fillRect(x, 0, 24, h | 0);
    }
  }

  /* ================= 舞台地板：深色梯形 ================= */
  drawFloor(t) {
    const { ctx } = this;
    const topY = 250; // 地板最远端

    // 梯形（近大远小）
    const grad = ctx.createLinearGradient(0, topY, 0, STAGE_H);
    grad.addColorStop(0, '#12142a');
    grad.addColorStop(0.5, '#0d0f22');
    grad.addColorStop(1, '#090a18');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(210, topY);          // 后左
    ctx.lineTo(750, topY);          // 后右
    ctx.lineTo(950, STAGE_H);       // 前右
    ctx.lineTo(10, STAGE_H);        // 前左
    ctx.closePath();
    ctx.fill();

    // 像素风地板缝（横线越来越宽，营造纵深）
    const [r, g, b] = this.light;
    for (let i = 0; i < 7; i++) {
      const p = i / 7;
      const y = topY + (STAGE_H - topY) * p * p; // 近处间隔更大
      const inset = 210 - ((210 - 10) * p);
      ctx.globalAlpha = 0.25 + p * 0.3;
      ctx.fillStyle = `rgba(${(r * 0.3) | 0},${(g * 0.3) | 0},${(40 + b * 0.3) | 0},${0.5})`;
      ctx.fillRect(inset + 200 * p, y | 0, (STAGE_W - inset * 2 - 400 * p) | 0, 2);
    }
    ctx.globalAlpha = 1;

    // 台前沿口 + 灯光反射
    ctx.fillStyle = '#1a1c38';
    ctx.fillRect(10, STAGE_H - 14, 940, 14);
    const glow = ctx.createLinearGradient(0, STAGE_H - 60, 0, STAGE_H);
    glow.addColorStop(0, `rgba(${rgbStr(this.light)},0)`);
    glow.addColorStop(1, `rgba(${rgbStr(this.light)},${0.1 + this.lightIntensity * 0.18})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, STAGE_H - 60, STAGE_W, 60);
  }

  /* ================= 聚光灯 ================= */
  drawSpotlights(t) {
    const { ctx } = this;
    const [r, g, b] = this.light;
    const flick = this.playing && this.audio
      ? 0.85 + Math.min(0.15, this.audio.energy * 0.3)
      : 1;

    const spots = [
      { x: 480, ty: 430, w: 300 }, // 中央主光
      { x: 260, ty: 430, w: 250 }, // 左光
      { x: 700, ty: 430, w: 250 }, // 右光
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of spots) {
      const grad = ctx.createLinearGradient(s.x, -20, s.x, STAGE_H);
      const a = 0.02 + this.lightIntensity * 0.09 * flick;
      grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${a * 1.4})`);
      grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x - 26, -20);
      ctx.lineTo(s.x + 26, -20);
      ctx.lineTo(s.x + s.w / 2, STAGE_H);
      ctx.lineTo(s.x - s.w / 2, STAGE_H);
      ctx.closePath();
      ctx.fill();

      // 台上光斑
      const pool = ctx.createRadialGradient(s.x, s.ty, 0, s.x, s.ty, s.w * 0.36);
      pool.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${0.16 * this.lightIntensity * flick})`);
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(s.x, s.ty, s.w * 0.4, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 灯架（像素桁架）
    ctx.fillStyle = '#15162a';
    ctx.fillRect(120, 6, STAGE_W - 240, 8);
    for (let x = 120; x < STAGE_W - 120; x += 48) {
      ctx.fillRect(x, 6, 4, 14);
      ctx.fillStyle = `rgba(${rgbStr(this.light)},${0.5 * this.lightIntensity + 0.2})`;
      ctx.fillRect(x, 18, 4, 4); // 灯珠
      ctx.fillStyle = '#15162a';
    }
  }

  /* ================= 乐手绘制 ================= */
  drawMusicians(t, dt) {
    const playing = this.playing && this.audio && !this.audio.el.paused;
    for (const m of this.musicians) {
      const band = playing ? this.audio.bands[m.sec.band] || 0 : 0;

      // 动作帧推进：能量越高换帧越快（2-3 帧循环）
      m.frameTimer += dt * (0.6 + band * 2.4) * (playing ? 1 : 0);
      if (m.frameTimer > 120) {
        m.frameTimer = 0;
        m.frame = (m.frame + 1) % 3;
      }

      // 暂停时呼吸微起伏（2px 内）
      const breath = playing
        ? 0
        : Math.sin(t / 1000 * 1.2 + m.breath) * 1.2;

      // 身体摆动幅度：基础 1px + 能量驱动
      const sway = playing
        ? (m.frame - 1) * 1.4 * P * (0.5 + band)
        : 0;

      this.drawMusician(m, band, sway, breath, t);
    }
  }

  /** 画一个小人：坐标为脚底中心（逻辑像素） */
  drawMusician(m, band, sway, breath, t) {
    const c = this.ctx;
    const px = (gx, gy, w, h, color) => {
      c.fillStyle = color;
      c.fillRect(Math.round(m.x + gx * P), Math.round(m.y - (gy + h) * P + sway + breath), w * P, h * P);
    };

    const { sec } = m;
    const sitting = sec.sitting;
    // 身高（格）：坐姿矮 2 格
    const legH = sitting ? 1 : 2;
    const bodyH = sitting ? 5 : 6;

    // ---- 腿 ----
    px(-2, 0, 2, legH, '#191922');
    px(0, 0, 2, legH, '#191922');
    if (sitting) {
      // 椅子
      px(-3, 0, 6, 1, '#2a2418');
      px(-3, 1, 1, 2, '#2a2418');
      px(2, 1, 1, 2, '#2a2418');
    }

    // ---- 身体（礼服/声部色） ----
    px(-HW, legH, HW * 2, bodyH, sec.cloth);
    // 领口 / 修饰
    px(-1, legH + bodyH - 1, 2, 1, sec.trim);
    // 手臂：随帧摆动
    const armUp = m.frame === 1 ? 1 : 0;
    px(-HW - 1, legH + 2 - armUp, 1, 3, sec.cloth);
    px(HW, legH + 2 + (m.frame === 2 ? 1 : 0), 1, 3, sec.cloth);

    // ---- 头 ----
    const headY = legH + bodyH;
    px(-2, headY, 4, 4, m.skin);
    // 头发
    px(-2, headY + 3, 4, 1, sec.hair);
    px(-2, headY + 2, 1, 1, sec.hair);
    px(1, headY + 2, 1, 1, sec.hair);

    // ---- 乐器（几何形状，按声部） ----
    this.drawInstrument(m, px, band, legH, bodyH, headY, t);
  }

  /** 各声部乐器：几何色块 + 频段驱动动作 */
  drawInstrument(m, px, band, legH, bodyH, headY, t) {
    const { sec } = m;
    const f = m.face;                       // 朝向：1 右 / -1 左
    const amp = 0.4 + band * 1.6;           // 动作幅度
    const swing = m.frame - 1;              // -1/0/1

    switch (sec.instrument) {
      case 'conductor': {
        // 指挥棒：低频驱动，上下挥动
        const lift = band * 3 * P;
        const bx = f * (HW + 1);
        const by = legH + bodyH + 1;
        px(bx, by + lift, 1, 1, '#f0f0f5');
        // 棒杆（斜线像素）
        px(bx + f, by + 1 + lift, 1, 1, '#f0f0f5');
        px(bx + f * 2, by + 2 + lift + swing, 1, 1, '#f0f0f5');
        px(bx + f * 3, by + 3 + lift + swing, 1, 1, '#ffffff');
        break;
      }
      case 'violin':
      case 'viola': {
        // 弦乐：琴身菱形 + 琴颈，运弓随帧
        const big = sec.instrument === 'viola';
        const wx = f * (HW + 1);
        const wy = legH + 2;
        const wob = swing * amp;
        // 琴身
        px(wx, wy + wob, 2, 3, big ? '#8a5a2a' : '#a06a30');
        px(wx + f, wy + 1 + wob, 1, 1, '#5a3a18');
        // 琴颈指向肩上
        px(wx + f * 2, wy + 3 + wob, 1, 2, '#5a3a18');
        // 弓（细杆，随帧前后）
        px(wx - f, wy + 2 - m.frame + wob, f * 4, 1, '#d8d0c0');
        break;
      }
      case 'cello':
      case 'bass': {
        // 竖置大琴： taller box + 琴头，弓在中频低段拉动
        const big = sec.instrument === 'bass';
        const h = big ? 8 : 6;
        const wx = f * (HW + 1);
        const wob = swing * amp * 0.6;
        px(wx, 1, 3, h, big ? '#3a2410' : '#4a2e14');          // 琴身
        px(wx + 1, 1 + h, 1, 3, '#241608');                    // 琴脚
        px(wx + 1, h + 1 + wob, 1, 1, '#d8d0c0');              // 琴码亮点
        px(wx - f, 3 + wob, f * 4, 1, '#d8d0c0');              // 弓
        break;
      }
      case 'woodwind': {
        // 长笛/双簧管：横向细杆，指尖随帧起落
        const wx = f * (HW + 1);
        const wy = legH + 3 + swing;
        px(wx, wy, f * 4, 1, '#c8b060');
        px(wx + f * 2, wy - 1, 1, 1, '#e8d8a0'); // 按键亮点
        break;
      }
      case 'brass': {
        // 小号：喇叭口 + 管身，低频驱动整体摆动
        const wx = f * (HW + 1);
        const wy = legH + 3 + swing * amp * 0.5;
        px(wx, wy, 1, 1, '#ffe4a8');             // 喇叭口
        px(wx + f, wy, f * 3, 1, '#e8c060');     // 管身
        px(wx + f * 3, wy - 1, 1, 1, '#fff0c0'); // 反光点
        break;
      }
      case 'percussion': {
        // 定音鼓：鼓面 + 鼓槌，低频敲击
        px(-4, legH + 1, 8, 2, '#5a3a20');       // 鼓身
        px(-4, legH + 3, 8, 1, '#8a6a40');       // 鼓皮
        const hit = band > 0.25 ? -2 : 0;        // 敲击瞬间抬高
        px(-3, legH + 4 + hit, 1, 2, '#c8b060'); // 槌杆
        px(-3, legH + 6 + hit, 1, 1, '#e8d8a0'); // 槌头
        break;
      }
      case 'harp': {
        // 竖琴：三角框架 + 琴弦，高频拨动
        const wx = f * (HW + 2);
        px(wx, 0, 1, 9, '#e8e0d0');              // 柱
        px(wx, 8, f * 3, 1, '#e8e0d0');          // 底座
        px(wx + f * 2, 1, 1, 7, '#d0c8b8');      // 斜梁
        for (let i = 0; i < 4; i++) {            // 琴弦（高频时闪亮）
          const glow = band > 0.3;
          px(wx + f * (1 + i * 0.5) | 0, 2 + i, 1, 6 - i, glow ? '#fff0c0' : '#a8a090');
        }
        break;
      }
      case 'piano': {
        // 钢琴：黑色琴体 + 白键，高频按键
        const wx = f * (HW + 1);
        px(wx, legH + 1, f * 5, 2, '#14141c');   // 琴体
        px(wx, legH + 3, f * 5, 1, '#e8e8f0');   // 键盘
        const kx = wx + f * (1 + (m.frame % 3)); // 移动的按下键
        px(kx, legH + 3, 1, 1, band > 0.3 ? '#f5c86b' : '#c8c8d8');
        break;
      }
    }
  }

  /* ================= 前景氛围 ================= */
  drawFrontGlow() {
    const { ctx } = this;
    // 顶部 vignette
    const v = ctx.createLinearGradient(0, 0, 0, 90);
    v.addColorStop(0, 'rgba(0,0,0,0.55)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, STAGE_W, 90);
  }
}
