/**
 * program.js —— 节目单侧栏渲染
 * 四幕分组（可折叠），每幕含曲目；点击曲目回调 onTrackClick；
 * main.js 调用 updateActive() 同步高亮，markMissing() 标记缺失。
 */

import { ACTS, TRACKS, SECTIONS, INTERMISSION_SECONDS } from './config.js';
import { fmtTime } from './utils.js';

export class Program {
  /**
   * @param {HTMLElement} container 抽屉内容容器
   * @param {(index:number)=>void} onTrackClick 点击曲目
   */
  constructor(container, onTrackClick) {
    this.container = container;
    this.onTrackClick = onTrackClick;
    this.trackEls = [];   // 曲目 DOM，下标即曲目索引
    this.actEls = [];     // 幕分组 DOM
    this.render();
  }

  render() {
    const frag = document.createDocumentFragment();

    // 中场休息块（插在上半场与下半场之间）
    let restInserted = false;
    let prevGroup = null;

    ACTS.forEach((act, ai) => {
      // 进入下半场前插入中场休息
      if (act.group === 'lower' && prevGroup === 'upper' && !restInserted) {
        frag.appendChild(this.buildIntermissionBlock());
        restInserted = true;
      }
      prevGroup = act.group;

      const group = document.createElement('div');
      group.className = 'act-group';
      group.style.setProperty('--act-color', act.color);
      group.style.setProperty('--act-glow', act.glow);

      // 分组头（点击折叠）
      const head = document.createElement('button');
      head.className = 'act-group-head';
      head.innerHTML = `
        <span class="act-group-name">${act.name}「${act.title}」</span>
        <span class="act-group-duration">${act.duration}</span>
      `;
      const mood = document.createElement('p');
      mood.className = 'act-group-mood';
      mood.textContent = act.mood;

      const list = document.createElement('div');
      list.className = 'act-group-list';
      list.style.display = 'none'; // 默认折叠，仅当前幕展开

      // 折叠状态
      head.addEventListener('click', () => {
        const open = list.style.display === 'block';
        list.style.display = open ? 'none' : 'block';
        head.querySelector('.act-group-name').innerHTML = open
          ? `${act.name}「${act.title}」`
          : `▾ ${act.name}「${act.title}」`;
      });

      // 该幕曲目
      TRACKS.forEach((track, ti) => {
        if (track.act !== ai) return;
        const btn = document.createElement('button');
        btn.className = 'track';
        btn.innerHTML = `
          <span class="track-index">${ti + 1}
            <span class="eq"><i></i><i></i><i></i></span>
          </span>
          <span class="track-name">${track.title}</span>
          ${track.missing ? '<span class="track-missing-tag">音频待添加</span>' : `<span class="track-source">${track.encore ? 'ENCORE' : track.source}</span>`}
          <span class="track-duration">${track.duration}</span>
        `;
        btn.addEventListener('click', () => this.onTrackClick(ti));
        list.appendChild(btn);
        this.trackEls[ti] = btn;
      });

      group.append(head, mood, list);
      frag.appendChild(group);
      this.actEls[ai] = group;
    });

    // 声部图例
    const legend = document.createElement('div');
    legend.className = 'drawer-legend';
    legend.innerHTML = '<b>声部</b>' + SECTIONS.map((s) =>
      `<span style="--c:${s.cloth}"><i></i>${s.label}×${s.count}</span>`
    ).join('');
    frag.appendChild(legend);

    // 数据来源说明
    const note = document.createElement('div');
    note.className = 'program-note';
    note.innerHTML = `
      <b>音频来源</b>：曲目 01–17 均可从
      <a href="https://downloads.khinsider.com/game-soundtracks/album/stellaris-gamerip-2016" target="_blank" rel="noopener">KHInsider</a>
      免费下载（本体 10 首见 “Stellaris (gamerip) (2016)” 专辑；DLC 曲目站内搜索 Stellaris Utopia / Apocalypse / Leviathans / Nemesis），
      下载后按序号重命名为 <code>01.mp3 ~ 17.mp3</code> 放入 <code>audio/</code> 目录即可。缺失文件显示“音频待添加”，不影响其他功能。
      <br><b>在线直链</b>：如需免下载播放，可在 <code>js/config.js</code> 为曲目配置 <code>url</code> 字段（支持跨域的长期音频直链），本地缺失时自动在线播放。
    `;
    frag.appendChild(note);

    this.container.appendChild(frag);
  }

  /** 中场休息块 */
  buildIntermissionBlock() {
    const box = document.createElement('div');
    box.className = 'intermission-block';
    box.innerHTML = `
      <div class="intermission-ico">☕</div>
      <div class="intermission-info">
        <div class="intermission-title">中场休息 · INTERMISSION</div>
        <div class="intermission-sub">约 ${fmtTime(INTERMISSION_SECONDS)} · 上半场落幕，稍作休整</div>
      </div>
    `;
    return box;
  }

  /**
   * 同步高亮状态（并自动展开当前幕、折叠其它幕）
   * @param {number|null} current 当前曲目索引
   * @param {boolean} playing 是否播放中
   */
  updateActive(current, playing) {
    this.trackEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('active', i === current);
      el.classList.toggle('playing', i === current && playing);
    });
    const act = current != null ? TRACKS[current].act : -1;
    this.actEls.forEach((el, i) => {
      el.classList.toggle('active', i === act);
      if (i === act) {
        const list = el.querySelector('.act-group-list');
        const name = el.querySelector('.act-group-name');
        if (list && list.style.display !== 'block') {
          list.style.display = 'block';
          name.innerHTML = `▾ ${ACTS[i].name}「${ACTS[i].title}」`;
        }
      }
    });
  }

  /** 更新某一首的缺失标记（音频加载失败后调用） */
  markMissing(index) {
    const el = this.trackEls[index];
    if (!el) return;
    TRACKS[index].missing = true;
    el.classList.add('missing');
    const src = el.querySelector('.track-source');
    if (src) {
      const tag = document.createElement('span');
      tag.className = 'track-missing-tag';
      tag.textContent = '音频待添加';
      src.replaceWith(tag);
    }
  }
}
