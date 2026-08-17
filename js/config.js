/**
 * config.js —— 全站配置中心
 * 想调整曲目、幕色、乐队人数/位置、频段映射，改这里即可。
 */

/** 逻辑画布尺寸（舞台内部坐标系），舞台按 16:9 等比缩放显示 */
export const STAGE_W = 960;
export const STAGE_H = 540;

/** 中场休息时长（秒）。音乐会总长 = 上半场 + 中场 + 下半场 ≈ 90 分钟 */
export const INTERMISSION_SECONDS = 20 * 60;

/**
 * 四幕定义
 * light: 舞台聚光灯 RGB（随幕平滑过渡）
 * color / glow: 节目单卡片主题色（CSS 用）
 * group: 'upper' 上半场（启程~繁荣） / 'lower' 下半场（风暴~终章），中场休息插在两组之间
 */
export const ACTS = [
  {
    name: '第一幕',
    title: '启程 · 深空探索',
    duration: '22:00',
    mood: '宇宙苏醒，深空展开。粒子与引力低语，探索的星图缓缓点亮。',
    light: [110, 132, 255],
    color: '#9fb4ff',
    glow: '#7c8cf0',
    group: 'upper',
    stage: '游戏开篇：宇宙诞生与初次探索',
  },
  {
    name: '第二幕',
    title: '文明 · 崛起繁荣',
    duration: '11:57',
    mood: '文明破土而生，天穹都市拔地而起，黄金时代在金色的晨光中降临。',
    light: [255, 175, 90],
    color: '#f5c86b',
    glow: '#e8a94f',
    group: 'upper',
    stage: '游戏中段：帝国扩张与科技黎明',
  },
  {
    name: '第三幕',
    title: '风暴 · 冲突末日',
    duration: '20:56',
    mood: '警报划破星海，舰队集结，巨龙腾空。战鼓与铜管把星海燃成火海。',
    light: [255, 96, 64],
    color: '#ff9d7a',
    glow: '#f06a45',
    group: 'lower',
    stage: '游戏中后期：威胁与全面战争',
  },
  {
    name: '第四幕',
    title: '超越 · 星海终章',
    duration: '14:43',
    mood: '终局序曲，银河在圣洁的白蓝色光辉中重生。最后的返场，将超越光速。',
    light: [215, 232, 255],
    color: '#cfe0ff',
    glow: '#a8c4f5',
    group: 'lower',
    stage: '游戏终局：飞升与银河命运',
  },
];

/**
 * 曲目总表 —— 按游戏进程精简为 11 首，构成约 90 分钟整体时间轴
 * （上半场 33:57 + 中场 20:00 + 下半场 35:39 = 89:36）
 * act: 所属幕索引（对应 ACTS）
 * encore: 返场曲（安排在音乐会最后的高潮）
 * file: audio/ 目录下的文件；url: 可选的在线兜底直链（见 player.js）
 * cover: 播放器左下角黑胶中心的专辑封面图（来自网易云音乐）
 *
 * 相比最初 17 首，为贴合「一场一个半小时」删减了：
 *   Alpha Centauri、Utopia Main Title、Cradle of the Galaxy、Supermassive Fleet、
 *   Pillars of Creation、The Birth of a Star —— 它们或与相邻曲节奏重复、或时长过长；
 *   终章把高潮集中让给返场曲 Faster Than Light。
 */
export const TRACKS = [
  { file: '01.mp3', title: 'Stellaris Suite: Creation and Beyond', duration: '8:30', source: '本体',       act: 0, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '02.mp3', title: 'Deep Space Travels',                    duration: '7:29', source: '本体',       act: 0, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '03.mp3', title: 'In Search of Life',                     duration: '6:01', source: '本体',       act: 0, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '05.mp3', title: 'Genesis',                               duration: '6:08', source: '本体',       act: 1, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '06.mp3', title: 'The Celestial City',                    duration: '5:49', source: '本体',       act: 1, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '09.mp3', title: 'Hostile Fleet Detected',                duration: '4:03', source: 'Apocalypse',  act: 2, cover: 'assets/cover/apocalypse.jpg' },
  { file: '11.mp3', title: 'Assembling the Fleet',                  duration: '5:15', source: 'Leviathans',  act: 2, cover: 'assets/cover/leviathans.jpg' },
  { file: '10.mp3', title: 'Dragon Breath',                         duration: '6:39', source: 'Leviathans',  act: 2, cover: 'assets/cover/leviathans.jpg' },
  { file: '12.mp3', title: 'Doomsday',                              duration: '4:59', source: 'Apocalypse',  act: 2, cover: 'assets/cover/apocalypse.jpg' },
  { file: '17.mp3', title: 'Luminescence',                          duration: '8:03', source: '本体',       act: 3, cover: 'assets/cover/stellaris-ost.jpg' },
  { file: '16.mp3', title: 'Faster Than Light',                     duration: '6:40', source: '本体',       act: 3, encore: true, cover: 'assets/cover/stellaris-ost.jpg',
    url: 'https://nu.vgmtreasurechest.com/soundtracks/stellaris-original-soundtrack-2016/ahkdjopj/02.%20Faster%20Than%20Light.mp3' },
];

/** 封面兜底（避免 cover 缺失时露出空白） */
export const DEFAULT_COVER = 'assets/cover/stellaris-ost.jpg';

/**
 * 声部布局（960x540 逻辑坐标，y 越大越靠近观众，坐标为脚底基准）
 * —— 调整人数 count / 位置 x,y / 间距 spread 即可改变乐队排列
 *
 * band: 该声部由哪个频段驱动（见 audio-engine.js BAND_RANGES）
 *   low      0-80Hz      指挥挥棒 / 打击乐 / 铜管
 *   midLow   80-250Hz    大提琴 / 低音提琴
 *   mid      250-2000Hz  中提琴 / 木管
 *   midHigh  2000-6000Hz 小提琴
 *   high     6000Hz+     竖琴 / 钢琴
 */
export const SECTIONS = [
  { id: 'conductor', label: '指挥家',   count: 1, x: 480, y: 512, spread: 0,  cloth: '#16161f', trim: '#f0f0f5', instrument: 'conductor', band: 'low',     hair: '#2b2b33' },
  { id: 'violin1',   label: '第一小提琴', count: 8, x: 305, y: 468, spread: 30, cloth: '#c9a06a', trim: '#e8d5b0', instrument: 'violin',   band: 'midHigh', hair: '#4a3520' },
  { id: 'violin2',   label: '第二小提琴', count: 8, x: 655, y: 468, spread: 30, cloth: '#c9a06a', trim: '#e8d5b0', instrument: 'violin',   band: 'midHigh', hair: '#4a3520' },
  { id: 'viola',     label: '中提琴',   count: 6, x: 480, y: 404, spread: 52, cloth: '#7a5230', trim: '#c9a06a', instrument: 'viola',   band: 'mid',     hair: '#3a2817' },
  { id: 'celloL',    label: '大提琴·左', count: 2, x: 258, y: 434, spread: 36, cloth: '#1d1d28', trim: '#8b8b9c', instrument: 'cello',   band: 'midLow',  hair: '#23232c', sitting: true },
  { id: 'celloR',    label: '大提琴·右', count: 2, x: 702, y: 434, spread: 36, cloth: '#1d1d28', trim: '#8b8b9c', instrument: 'cello',   band: 'midLow',  hair: '#23232c', sitting: true },
  { id: 'bass',      label: '低音提琴', count: 3, x: 236, y: 384, spread: 32, cloth: '#141419', trim: '#6d6d80', instrument: 'bass',    band: 'midLow',  hair: '#1e1e26' },
  { id: 'woodwind',  label: '木管组',   count: 8, x: 478, y: 356, spread: 52, cloth: '#2b3a8c', trim: '#7c8cf0', instrument: 'woodwind', band: 'mid',     hair: '#23233a' },
  { id: 'brass',     label: '铜管组',   count: 8, x: 478, y: 318, spread: 50, cloth: '#d9a441', trim: '#ffe4a8', instrument: 'brass',   band: 'low',     hair: '#3d2f16' },
  { id: 'percussion',label: '打击乐组', count: 4, x: 480, y: 290, spread: 64, cloth: '#8c2f39', trim: '#d98a92', instrument: 'percussion', band: 'low',  hair: '#2c1a1d' },
  { id: 'harp',      label: '竖琴',    count: 1, x: 802, y: 448, spread: 0,  cloth: '#e8ecf5', trim: '#ffffff', instrument: 'harp',    band: 'high',    hair: '#7a5a3a' },
  { id: 'piano',     label: '钢琴',    count: 1, x: 160, y: 448, spread: 0,  cloth: '#20242e', trim: '#c9d2e8', instrument: 'piano',   band: 'high',    hair: '#17171e' },
];

/** 皮肤色板（按座位轮换，增加层次） */
export const SKIN_TONES = ['#e8b98d', '#d9a06c', '#c98d5f', '#f0caa0'];

/** 音频目录 */
export const AUDIO_DIR = 'audio/';
