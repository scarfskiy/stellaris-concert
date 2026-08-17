/**
 * player.js —— 播放控制 + 中场休息状态机
 * 负责：<audio> 元素加载/播放/切歌、进度条拖动、音量、顺序/单曲循环，
 * 以及「音乐会整体时间轴」——上半场结束自动进入中场休息（倒计时/可跳过），
 * 之后进入下半场；通过回调把状态变化通知 main.js（联动舞台、节目单、时间轴）。
 */

import { TRACKS, ACTS, AUDIO_DIR, INTERMISSION_SECONDS, DEFAULT_COVER } from './config.js';
import {
  overallFromTrack,
  overallFromIntermission,
  LAST_UPPER_INDEX,
  FIRST_LOWER_INDEX,
} from './timeline.js';
import { fmtTime } from './utils.js';

export class Player {
  constructor(audioEngine, callbacks = {}) {
    this.engine = audioEngine;
    this.el = audioEngine.el;
    this.cb = callbacks; // { onState, onTrackChange, onError, onIntermission, onOverall, onEnd }

    this.current = -1;      // 当前曲目索引
    this.playing = false;
    this.repeatOne = false; // false 顺序播放(列表循环) / true 单曲循环
    this.userInteracted = false;
    this._dragging = false; // 进度条拖动中（拖动时暂停 timeupdate 对 UI 的覆盖）

    // 中场休息状态机
    this.state = 'playing';          // 'playing' 演奏中 / 'intermission' 中场休息
    this._restRemain = 0;            // 中场剩余秒
    this._intermissionDone = false;  // 本场是否已发生过中场（避免列表循环后再休息）

    this._queue = [];       // 当前曲目的候选音频源（本地 -> 远程 url）
    this._sourceKind = 'local'; // 'local' 本地文件 / 'remote' 在线直链

    this.$ = (id) => document.getElementById(id);
    this.dom = {
      playBtn: this.$('btn-play'),
      prevBtn: this.$('btn-prev'),
      nextBtn: this.$('btn-next'),
      modeBtn: this.$('btn-mode'),
      title: this.$('player-title'),
      sub: this.$('player-sub'),
      cur: this.$('time-cur'),
      total: this.$('time-total'),
      bar: this.$('progress-bar'),
      fill: this.$('progress-fill'),
      thumb: this.$('progress-thumb'),
      volume: this.$('volume'),
      disc: this.$('player-disc'),
      discCover: this.$('player-disc-cover'),
      discLabel: this.$('player-disc-label'),
      player: this.$('player'),
    };

    this.bindAudio();
    this.bindControls();
    this.setVolume(0.8);

    // 初始预载第一首元数据（不自动播放），使单曲进度条即刻可点击寻址
    this.load(0);
  }

  /* ---------------- <audio> 事件 ---------------- */
  bindAudio() {
    const el = this.el;
    el.addEventListener('timeupdate', () => this.updateProgress());
    el.addEventListener('loadedmetadata', () => {
      this.dom.total.textContent = fmtTime(el.duration);
    });
    // 播完：单曲循环 / 中场休息 / 返场落幕 / 下一首
    el.addEventListener('ended', () => {
      if (this.repeatOne) {
        el.currentTime = 0;
        el.play().catch(() => {});
      } else if (this.current === TRACKS.length - 1) {
        // 返场曲落幕：音乐会结束，暂停
        this._curtain(); 
      } else if (this.current === LAST_UPPER_INDEX && !this._intermissionDone) {
        // 上半场结束 -> 中场休息
        this.enterIntermission();
      } else {
        this.next(true);
      }
    });
    // 加载失败：还有候选源则继续尝试；全部失败才标记缺失并自动跳下一首
    el.addEventListener('error', () => {
      if (this.current < 0) return;
      if (this._queue.length) {
        this._loadNext();
      } else {
        this._allFailed();
      }
    });
    el.addEventListener('play', () => this.setPlaying(true));
    el.addEventListener('pause', () => this.setPlaying(false));
    this._autoSkipCount = 0;
  }

  /* ---------------- 控件事件 ---------------- */
  bindControls() {
    const d = this.dom;

    d.playBtn.addEventListener('click', () => this.togglePlay());
    d.prevBtn.addEventListener('click', () => this.prev());
    d.nextBtn.addEventListener('click', () => this.next(false));

    // 顺序 / 单曲循环
    d.modeBtn.addEventListener('click', () => {
      this.repeatOne = !this.repeatOne;
      d.modeBtn.classList.toggle('on', this.repeatOne);
      d.modeBtn.title = this.repeatOne ? '单曲循环' : '列表循环';
      d.modeBtn.querySelector('span').textContent = this.repeatOne ? '单曲循环' : '列表循环';
    });

    // 进度条：点击 / 拖动（Pointer Events，兼容触屏）
    const seekTo = (clientX) => {
      const rect = d.bar.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      this.updateProgress(p);
      if (isFinite(this.el.duration) && this.el.duration > 0) {
        this.el.currentTime = p * this.el.duration;
      }
    };
    const startDrag = (e) => {
      this._dragging = true;
      d.bar.classList.add('dragging');
      d.bar.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
    };
    const endDrag = () => { this._dragging = false; d.bar.classList.remove('dragging'); };
    d.bar.addEventListener('pointerdown', startDrag);
    d.bar.addEventListener('pointermove', (e) => { if (this._dragging) seekTo(e.clientX); });
    d.bar.addEventListener('pointerup', endDrag);
    d.bar.addEventListener('pointercancel', endDrag);

    // 音量
    d.volume.addEventListener('input', () => this.setVolume(parseFloat(d.volume.value)));
  }

  setVolume(v) {
    this.el.volume = v;
    this.dom.volume.style.setProperty('--vol', `${v * 100}%`);
  }

  /* ---------------- 中场休息状态机 ---------------- */

  /** 进入中场休息：暂停音频，启动倒计时 */
  enterIntermission() {
    this.state = 'intermission';
    this._restRemain = INTERMISSION_SECONDS;
    this.el.pause();
    this.setPlaying(false); // 让舞台上乐手静止
    this.cb.onIntermission?.(true, INTERMISSION_SECONDS);
  }

  /** 跳过中场，立即开始下半场 */
  skipIntermission() {
    this.finishIntermission();
  }

  /** 倒计时结束（或跳过）：进入下半场第一首 */
  finishIntermission() {
    if (this.state !== 'intermission') return;
    this.state = 'playing';
    this._intermissionDone = true;
    this.cb.onIntermission?.(false, 0);
    this.load(FIRST_LOWER_INDEX);
    this.doPlay();
  }

  /** 由 main 的 rAF 循环逐帧驱动：倒计时 + 上报整体进度 */
  tick(dt) {
    if (this.state === 'intermission') {
      this._restRemain -= dt / 1000;
      if (this._restRemain <= 0) this.finishIntermission();
    }
    this.emitOverall();
  }

  /** 上报当前整体进度（音乐会时钟，秒）+ 是否处于中场 */
  emitOverall() {
    let overall;
    if (this.state === 'intermission') {
      const rest = Math.max(0, this._restRemain);
      overall = overallFromIntermission(INTERMISSION_SECONDS - rest);
    } else if (this.current >= 0) {
      overall = overallFromTrack(this.current, Number(this.el.currentTime) || 0);
    } else {
      overall = 0;
    }
    this.cb.onOverall?.(overall, this.state === 'intermission');
  }

  /** 返场落幕：音乐会结束 */
  _curtain() {
    this.setPlaying(false);
    this.dom.playBtn.textContent = '▶';
    this.dom.sub.textContent = '音乐会落幕 · 感谢聆听 · 乃群星与你同在';
    this.dom.sub.classList.add('warn');
    this.cb.onEnd?.();
  }

  /* ---------------- 播放逻辑 ---------------- */

  /** 播放指定曲目（点击曲目调用）：同曲切换播放/暂停，异曲直接换 */
  playTrack(index) {
    if (index === this.current) {
      this.togglePlay();
      return;
    }
    this.load(index);
    this.doPlay();
  }

  togglePlay() {
    if (this.playing) {
      this.el.pause();
    } else if (this.current >= 0) {
      this.doPlay();
    } else {
      // 尚未选曲：从第一首开始
      this.load(0);
      this.doPlay();
    }
  }

  async doPlay() {
    // 首次用户手势时创建 AudioContext 并确保其 running（否则无声）
    try { await this.engine.ensureContext(); } catch { /* 极老浏览器无 Web Audio 时退化为普通播放 */ }
    this.engine.playing = true;
    try {
      await this.el.play();
    } catch (err) {
      // 自动播放被拦等情况：给用户明确提示，而非按钮毫无反应
      if (err && err.name === 'NotAllowedError') {
        this.dom.playBtn.textContent = '▶';
        this.dom.sub.textContent = '已阻止自动播放 · 请再次点击播放';
        this.dom.sub.classList.add('warn');
        this.cb.onState?.(this.current, false);
      }
    }
  }

  load(index) {
    // 若正处中场休息，用户手动点曲则直接退出休息
    if (this.state === 'intermission') {
      this.state = 'playing';
      this.cb.onIntermission?.(false, 0);
    }
    this.current = index;
    this._autoSkipCount = 0;
    const track = TRACKS[index];

    // 候选源：本地文件优先，远程 url 兜底
    this._queue = [];
    if (track.file) this._queue.push(AUDIO_DIR + track.file);
    if (track.url) this._queue.push(track.url);

    this._loadNext();
    this.cb.onTrackChange?.(index);
  }

  /** 尝试队列里的下一个音频源 */
  _loadNext() {
    const src = this._queue.shift();
    if (src === undefined) {
      this._allFailed();
      return;
    }
    this._sourceKind = src.startsWith(AUDIO_DIR) ? 'local' : 'remote';
    this.el.src = src;
    this.el.load();
    this.showTrack(this.current, true);
  }

  /** 所有源都加载失败：标记缺失，自动跳下一首（最多连跳 17 次防卡死） */
  _allFailed() {
    this.cb.onError?.(this.current);
    if (this._autoSkipCount < TRACKS.length) {
      this._autoSkipCount++;
      this.next(true);
    }
  }

  prev() { this.load((this.current - 1 + TRACKS.length) % TRACKS.length); this.doPlay(); }
  next(auto) {
    if (!auto) this._autoSkipCount = 0;
    this.load((this.current + 1) % TRACKS.length);
    this.doPlay();
  }

  /* ---------------- UI 更新 ---------------- */

  setPlaying(v) {
    this.playing = v;
    this.engine.playing = v;
    this.dom.playBtn.textContent = v ? '❚❚' : '▶';
    this.dom.player.classList.toggle('disc-spin', v);
    this.cb.onState?.(this.current, v);
  }

  showTrack(index, resetTime) {
    const track = TRACKS[index];
    const act = ACTS[track.act];
    this.dom.title.textContent = `${String(index + 1).padStart(2, '0')} · ${track.title}${track.encore ? ' ★' : ''}`;
    const online = this._sourceKind === 'remote' ? ' · 在线源' : '';
    const wing = act.group === 'upper' ? '上半场' : '下半场';
    this.dom.sub.textContent = `${wing} · ${track.source}${track.encore ? ' · ENCORE 返场' : ''}${online}`;
    this.dom.sub.classList.remove('warn');

    // 中心封面：优先用 track 自带 cover，缺失时用默认封面
    const cover = track.cover || DEFAULT_COVER;
    if (cover) {
      this.dom.discCover.style.backgroundImage = `url("${cover}")`;
      this.dom.disc.classList.add('has-cover');
    } else {
      this.dom.discCover.style.backgroundImage = '';
      this.dom.disc.classList.remove('has-cover');
    }
    this.dom.discLabel.textContent = String(index + 1).padStart(2, '0');

    if (resetTime) {
      this.dom.cur.textContent = '0:00';
      this.dom.total.textContent = track.duration;
    }
  }

  updateProgress(overrideP) {
    // 拖动中：忽略 timeupdate 的覆盖，UI 跟随指针位置
    if (overrideP === undefined && this._dragging) return;
    const el = this.el;
    const p = overrideP ?? (el.duration ? el.currentTime / el.duration : 0);
    this.dom.fill.style.width = `${p * 100}%`;
    this.dom.thumb.style.left = `${p * 100}%`;
    this.dom.cur.textContent = overrideP !== undefined
      ? fmtTime(overrideP * (el.duration || 0))
      : fmtTime(el.currentTime);
  }
}
