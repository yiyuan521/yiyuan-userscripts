// ==UserScript==
// @name         PokéSurvivor 小地图 Minimapa
// @name:en      PokéSurvivor Minimap
// @namespace    https://github.com/yiyuan521/yiyuan-userscripts
// @version      1.0.0
// @description  左上角半透明小地图：地形、敌人、Boss、闪光、宝箱/祭坛/泉眼、裂缝、陷阱、队友。M 键开关，Alt+拖动移动，Alt+拖右下角缩放。
// @author       yiyuan521
// @match        https://pokesurvivor.com/*
// @match        https://www.pokesurvivor.com/*
// @match        https://pokesurvivor.games/*
// @icon         https://pokesurvivor.com/assets/icons/icon-96.png
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @downloadURL  https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-minimap.user.js
// @updateURL    https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-minimap.user.js
// ==/UserScript==

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  PokéSurvivor 小地图（油猴脚本）
 *
 *  做什么
 *    在画面左上角（默认在 HUD 下面一点）画一个半透明的小地图，以你为中心：
 *      · 地形：亮色=能走的地面，蓝色=水/岩浆，**暗到发黑=过不去**（石墙、树、石头）
 *        走过的区域会记住，越走越全；没探索过的地方是偏蓝的深灰，不会和黑墙看混
 *      · 白色五角星：你     彩色圆点：联机队友
 *      · 小红点：普通敌人   大金圆点（会呼吸）：Boss   青点带圈：闪光
 *      · 金色小方块：小宝箱    金色大方块+锁孔+光晕：大宝箱
 *      · 彩色菱形：祭坛（加成柱子）    薄荷绿空心圈：泉眼
 *      · 紫色圆点：裂缝（格里塔）    金色/紫色小点：掉落物、票
 *      · X：陷阱，（毒：紫；粘：绿；爆炸：橙色）
 *      · Boss / 裂缝 出了范围会贴在边框上指方向
 *
 *  怎么用
 *    M 键 显示 / 隐藏。Alt + 左键拖动 可以挪到任意位置；
 *    Alt + 拖右下角 可以把小地图拉大 / 缩小（96–640px）。
 *    油猴菜单里能改：大小（滑块或直接输入数字）、缩放范围、透明度、位置、地形开关。
 *
 *  为什么需要「捕获 G」
 *    发布版（index.html + js/app.min.js）把整个游戏关在一个闭包里并做了混淆，
 *    window.G 不存在，控制台也摸不到游戏状态，为的是防止改内存作弊。
 *    小地图只是「看」，不需要改任何东西，所以这里用一个只读的办法拿到那个对象：
 *      游戏里 G 是 `var G = {}` 之后一个个挂属性：G.U = ...、G.World = ...、
 *      G.Game = ...（压缩后是 _0xABC['U'] = ... 这种形式，一共 77 个）。
 *      我们在 Object.prototype 上给这些名字装上 setter —— 谁给对象赋 .U，
 *      setter 里的 this 就是那个对象。于是 G 就到手了。
 *      （注意：不能用 G.LIFT = 18 那个，terser 会把它内联进对象字面量
 *       `var G = {LIFT: 18}`，那样根本不产生赋值。）
 *      每个 setter 触发后立刻自毁，并把值原样写回成对象自己的属性，
 *      游戏行为完全不变；抓到 G 之后（几十毫秒内）其余陷阱全部撤掉。
 *    只读、不改游戏数据、不影响排名判定（js/game.js 的 clean() 只看玩家对象）。
 *    如果哪天压缩方式变了、抓不到 G，脚本什么也不做，也不会报错刷屏。
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  const CFG_KEY = 'psmm.cfg.v1';
  const GK = '__PSMM_G__';
  const LOG = 'color:#7fd0ff;font-weight:700';

  // ============================ 配置 ============================

  const DEF = {
    on: true,          // 是否显示
    size: 176,         // 边长（CSS px）
    range: 1800,       // 小地图覆盖的世界范围（世界 px，正方形边长）
    alpha: 0.82,       // 整体不透明度
    pos: 'tl-hud',     // 位置预设
    xy: null,          // 自定义位置 { x, y }
    terrain: true,     // 画地形
    dots: true         // 画敌人 / 物件
  };

  const POS = {
    'tl-hud': { left: 12, top: 76 },   // 左上，让开血条/等级那一块（默认）
    'tl': { left: 12, top: 12 },   // 左上角（会压住血条）
    'tr': { right: 12, top: 76 },
    'bl': { left: 12, bottom: 14 },
    'br': { right: 12, bottom: 14 }
  };
  const POS_ORDER = ['tl-hud', 'tl', 'tr', 'bl', 'br'];
  const POS_NAME = { 'tl-hud': '左上（HUD 下）', 'tl': '左上角', 'tr': '右上', 'bl': '左下', 'br': '右下', custom: '自定义' };
  const RANGES = [1200, 1800, 2600];
  const ALPHAS = [0.6, 0.82, 1];

  // 小地图尺寸范围（CSS px）
  const SIZE_MIN = 96, SIZE_MAX = 640, SIZE_DEF = 176;

  function clampSize(v) {
    if (v === '' || v == null) return SIZE_DEF;
    v = Math.round(+v);
    if (!isFinite(v)) return SIZE_DEF;
    return Math.max(SIZE_MIN, Math.min(SIZE_MAX, v));
  }

  const hasGM = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function');

  const cfg = (() => {
    try {
      const raw = hasGM ? GM_getValue(CFG_KEY, '') : localStorage.getItem(CFG_KEY);
      if (raw) {
        const o = Object.assign({}, DEF, JSON.parse(raw));
        o.size = clampSize(o.size);
        return o;
      }
    } catch (e) { /* 配置坏了就用默认值 */ }
    return Object.assign({}, DEF);
  })();

  function saveCfg() {
    try {
      const raw = JSON.stringify(cfg);
      if (hasGM) GM_setValue(CFG_KEY, raw); else localStorage.setItem(CFG_KEY, raw);
    } catch (e) { /* 存不了也没关系 */ }
  }

  // ============================ 拿到游戏内部的 G ============================

  // 这段函数会被序列化成字符串，作为 <script> 注入页面真实上下文执行
  // （万一油猴沙箱和页面不是同一个 realm，注入这份才保险）。
  function TRAP() {
    if (window.__PSMM_CANDS__) return;         // 同一 realm 时已经装过了
    // G 会依次拿到这些属性（顺序见 main.js 的 NEED）；谁先赋值谁就把 G 交出来。
    // （不能用 G.LIFT：terser 会把它内联成 `var G = {LIFT: 18}`，那样没有赋值。）
    var NAMES = ['U', 'I18n', 'T', 'MUSIC', 'BIOME_MUSIC', 'DEX', 'DEX_BY', 'SPRITE_META',
      'DB', 'Audio', 'Input', 'Touch', 'Sprites', 'Camera', 'Moves', 'Types',
      'STARTERS', 'Enemies', 'Upgrades', 'Items', 'Tiles', 'World', 'FX',
      'EnemyMgr', 'Pickups', 'Player', 'Combat', 'Spawner', 'Rift', 'HUD',
      'UI', 'Game', 'Flow'];
    var cands = window.__PSMM_CANDS__ = [];

    function arm(NAME) {
      try {
        Object.defineProperty(Object.prototype, NAME, {
          configurable: true, enumerable: false,
          get: function () { return undefined; },
          set: function (v) {
            // 立刻自毁，并把值写回成对象自己的属性 —— 游戏那边感觉不到区别
            try { delete Object.prototype[NAME]; } catch (e) { }
            try {
              Object.defineProperty(this, NAME, { value: v, writable: true, enumerable: true, configurable: true });
            } catch (e) { }
            if (cands.indexOf(this) < 0) cands.push(this);
          }
        });
      } catch (e) { }
    }

    function disarm() {
      for (var i = 0; i < NAMES.length; i++) { try { delete Object.prototype[NAMES[i]]; } catch (e) { } }
    }

    function ok(o) {
      if (!o || typeof o !== 'object') return false;
      var K = ['U', 'Camera', 'World', 'EnemyMgr', 'Game', 'Player', 'Tiles', 'Sprites'], n = 0;
      for (var i = 0; i < K.length; i++) if (o[K[i]]) n++;
      return n >= 5;
    }

    for (var i = 0; i < NAMES.length; i++) arm(NAMES[i]);

    var timer = setInterval(function () {
      for (var i = 0; i < cands.length; i++) {
        if (ok(cands[i])) {
          window.__PSMM_G__ = cands[i];
          clearInterval(timer);
          disarm();
          return;
        }
      }
    }, 30);
    // 兜底：10 秒还没认出来就把陷阱全部撤掉，别一直挂在 Object.prototype 上
    setTimeout(function () { clearInterval(timer); disarm(); }, 10000);
  }

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  function injectTrap() {
    try {
      const s = document.createElement('script');
      s.textContent = '(' + TRAP.toString() + ')();';
      (document.head || document.documentElement).appendChild(s);
      s.parentNode.removeChild(s);
    } catch (e) { /* 有 CSP 挡着内联脚本就靠下面直接装 */ }
    try { TRAP(); } catch (e) { }          // 同一个 realm 时这句就够了
  }

  function looksLikeG(o) {
    if (!o || typeof o !== 'object') return false;
    let n = 0;
    for (const k of ['U', 'Camera', 'World', 'EnemyMgr', 'Game', 'Player', 'Tiles', 'Sprites']) if (o[k]) n++;
    return n >= 5;
  }

  function findG() {
    for (const o of [W[GK], window[GK], W.G, window.G]) if (looksLikeG(o)) return o;
    for (const arr of [W.__PSMM_CANDS__, window.__PSMM_CANDS__]) {
      if (arr) for (const o of arr) if (looksLikeG(o)) return o;
    }
    return null;
  }

  // ============================ 状态 ============================

  let G = null;                        // 游戏本体
  let mm = null, mctx = null;          // 覆盖画布
  let S = DEF.size, DPR = 1;           // 小地图边长 / 像素比
  let TS = 32, CW = 512;               // 一个 tile / 一个 chunk 的世界尺寸
  let followX = null, followY = null;  // 平滑跟随的镜头中心
  const chunks = new Map();            // "cx,cy" -> { cx, cy, kinds, baked, biome }
  let lastArena = null, lastGC = 0, lastPropQ = 0;
  let props = [];
  let loopErr = false;

  // ============================ 覆盖画布 ============================

  function ensureOverlay() {
    if (mm) return;
    mm = document.createElement('canvas');
    mm.id = 'ps-minimap';
    mm.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;' +
      'image-rendering:pixelated;border-radius:10px;display:none;';
    (document.body || document.documentElement).appendChild(mm);
    mctx = mm.getContext('2d');
  }

  function applyLayout() {
    if (!mm) return;
    S = cfg.size = clampSize(cfg.size);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    mm.style.width = S + 'px';
    mm.style.height = S + 'px';
    mm.width = Math.round(S * DPR);
    mm.height = Math.round(S * DPR);
    mm.style.opacity = String(cfg.alpha);
    const p = (cfg.pos === 'custom' && cfg.xy) ? { left: cfg.xy.x, top: cfg.xy.y } : (POS[cfg.pos] || POS['tl-hud']);
    for (const k of ['left', 'right', 'top', 'bottom']) mm.style[k] = (p && p[k] != null) ? p[k] + 'px' : 'auto';
  }

  // ============================ 地形缓存 ============================

  /** 朝 b 混色（b 用 '#rrggbb'）；用来把地形压暗，让障碍物一眼看出来。 */
  function mixHex(a, b, t) {
    if (typeof a !== 'string' || a.length !== 7 || a[0] !== '#') return b;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round((pa >> 16 & 255) + ((pb >> 16 & 255) - (pa >> 16 & 255)) * t);
    const g = Math.round((pa >> 8 & 255) + ((pb >> 8 & 255) - (pa >> 8 & 255)) * t);
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /**
   * 每个 chunk 采 16×16 个格子，每格一个状态：
   *   0 空地 · 1 石墙 · 2 水/岩浆 · 3 挡路的物件（树、石头…）
   * 挡路用 walkable()（格子坐标）判，所以树和石头也能画出来，不只石墙。
   */
  function sampleChunk(cx, cy) {
    const kinds = new Uint8Array(256);
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const tx = cx * 16 + i, ty = cy * 16 + j;
        let k = 0;
        try {
          const kind = G.World.kindAt(tx * TS + TS / 2, ty * TS + TS / 2);
          if (kind === 'wall') k = 1;
          else if (kind === 'liquid') k = 2;
          else if (!G.World.walkable(tx, ty)) k = 3;      // 树 / 石头 / 祭坛…
        } catch (e) { /* 拿不到就当地板 */ }
        kinds[j * 16 + i] = k;
      }
    }
    return { cx, cy, kinds, baked: null, biome: -1 };
  }

  function bake(c, biome) {
    const B = (G.Tiles && G.Tiles.BIOMES && G.Tiles.BIOMES[biome]) || null;
    const floor = (B && B.floor && B.floor[1]) || '#3e7a39';
    const liq = (B && B.liq) || '#3b7fc6';
    // 障碍物压暗：石墙几乎全黑（留一点生物群系的色调），挡路的树/石头是更暗的地面色
    const wall = mixHex((B && B.wallTop && B.wallTop[1]) || '#5d6e49', '#000000', 0.78);
    const block = mixHex(floor, '#000000', 0.58);
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const c2 = cv.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const k = c.kinds[i];
      c2.fillStyle = k === 1 ? wall : k === 2 ? liq : k === 3 ? block : floor;
      c2.fillRect(i & 15, i >> 4, 1, 1);
    }
    c.baked = cv;
    c.biome = biome;
  }

  /**
   * 采样地形。每帧只做几个新 chunk：`kindAt` 会顺手把那一块的地形数据生成出来
   * （游戏自己也是这么干的），一次做太多会掉帧。刚开局缓存还空的时候放宽一点，
   * 让地图一下就铺满。
   */
  function ensureTerrain(px, py) {
    if (!cfg.terrain) return;
    const r = cfg.range / 2;
    const c0x = Math.floor((px - r) / CW), c1x = Math.floor((px + r) / CW);
    const c0y = Math.floor((py - r) / CW), c1y = Math.floor((py + r) / CW);
    const biome = G.World.biome;
    let budget = chunks.size < 48 ? 4 : 2;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const key = cx + ',' + cy;
        let c = chunks.get(key);
        if (!c) {
          if (budget <= 0) continue;
          budget--;
          c = sampleChunk(cx, cy);
          chunks.set(key, c);
        }
        if (!c.baked || c.biome !== biome) bake(c, biome);
      }
    }
  }

  /** 走远了就把老 chunk 丢掉（否则一小时能攒下几万个）。 */
  function gcChunks(px, py) {
    if (chunks.size < 700) return;
    const lim = cfg.range * 2;
    for (const [k, c] of chunks) {
      if (Math.abs(c.cx * CW + CW / 2 - px) > lim || Math.abs(c.cy * CW + CW / 2 - py) > lim) chunks.delete(k);
    }
  }

  // ============================ 绘制小工具 ============================

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function dot(c, x, y, r, fill, ring) {
    c.beginPath();
    c.arc(x, y, r, 0, 6.2832);
    c.fillStyle = fill;
    c.fill();
    if (ring) { c.lineWidth = 1; c.strokeStyle = ring; c.stroke(); }
  }

  /** 空心圈（泉眼）：和所有实心点都不一样，不会看混。 */
  function ringMark(c, x, y, r, color, w) {
    c.beginPath();
    c.arc(x, y, r, 0, 6.2832);
    c.lineWidth = w || 1.5;
    c.strokeStyle = color;
    c.stroke();
  }

  /** 菱形（祭坛 / 加成柱子）。 */
  function diamond(c, x, y, r, used, fill, edge) {
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y);
    c.closePath();
    c.fillStyle = fill;
    if (!used) c.fill();
    if (edge) { c.lineWidth = 1; c.strokeStyle = edge; c.stroke(); }
  }

  /** 方块（宝箱）：小箱子。 */
  function square(c, x, y, s, fill, edge) {
    const h = s / 2;
    c.fillStyle = fill;
    c.fillRect(x - h, y - h, s, s);
    if (edge) { c.lineWidth = 1; c.strokeStyle = edge; c.strokeRect(x - h - 0.5, y - h - 0.5, s + 1, s + 1); }
  }

  /** 叉号（陷阱）：两条对角线，一眼看出是「别踩」。 */
  function cross(c, x, y, r, color, w) {
    c.beginPath();
    c.moveTo(x - r, y - r); c.lineTo(x + r, y + r);
    c.moveTo(x + r, y - r); c.lineTo(x - r, y + r);
    c.lineWidth = w || 1.6;
    c.lineCap = 'round';
    c.strokeStyle = color;
    c.stroke();
  }

  /** 五角星（玩家）：小地图里最通俗的「你在这里」。 */
  function star(c, x, y, R, fill, edge) {
    const r = R * 0.44;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = (i & 1) ? r : R;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (edge) { c.lineWidth = 1.2; c.lineJoin = 'round'; c.strokeStyle = edge; c.stroke(); }
  }

  // ============================ 主绘制 ============================

  function draw(pl) {
    const k = S / cfg.range;                     // 世界 px -> 小地图像素
    const now = performance.now();

    if (followX == null) { followX = pl.x; followY = pl.y; }
    else { followX += (pl.x - followX) * 0.28; followY += (pl.y - followY) * 0.28; }

    const ox = followX - cfg.range / 2, oy = followY - cfg.range / 2;
    const X = wx => (wx - ox) * k;
    const Y = wy => (wy - oy) * k;
    const inBox = (x, y, m) => x > -m && y > -m && x < S + m && y < S + m;

    /** 框外的点贴到边框上（用来提示远处的 Boss / 裂缝在哪个方向）。 */
    const edgeOf = (x, y, m) => {
      const c = S / 2, dx = x - c, dy = y - c;
      const lim = c - m;
      const t = Math.min(dx ? lim / Math.abs(dx) : Infinity, dy ? lim / Math.abs(dy) : Infinity);
      return t >= 1 ? null : [c + dx * t, c + dy * t];
    };

    // 裂缝的竞技场换了 / 第一次进来：地形缓存作废（那一块被改成围墙了）
    const arena = G.World.arena;
    if (arena !== lastArena) { lastArena = arena; chunks.clear(); }

    ensureTerrain(followX, followY);
    if (now - lastGC > 10000) { lastGC = now; gcChunks(followX, followY); }

    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mctx.clearRect(0, 0, S, S);
    mctx.imageSmoothingEnabled = false;
    mctx.save();
    roundRect(mctx, 0, 0, S, S, 10);
    mctx.clip();

    // 底（没探索过的地方：偏蓝的深灰，别和「全黑的石墙」看混）
    mctx.fillStyle = 'rgba(30,40,58,.5)';
    mctx.fillRect(0, 0, S, S);

    // ---------- 地形 ----------
    if (cfg.terrain) {
      mctx.globalAlpha = 0.75;
      for (const c of chunks.values()) {
        if (!c.baked) continue;
        const x = X(c.cx * CW), y = Y(c.cy * CW), w = CW * k;
        if (x > S || y > S || x + w < 0 || y + w < 0) continue;
        mctx.drawImage(c.baked, x, y, w, w);
      }
      mctx.globalAlpha = 1;
      // 压一点亮度，让红点/金点更跳
      mctx.fillStyle = 'rgba(6,10,18,.18)';
      mctx.fillRect(0, 0, S, S);
    }

    // ---------- 竞技场边界 ----------
    if (arena) {
      const ax = X(arena.tx * TS), ay = Y(arena.ty * TS), ar = arena.r * TS * k;
      mctx.save();
      mctx.setLineDash([5, 4]);
      mctx.lineWidth = 1.5;
      mctx.strokeStyle = 'rgba(180,138,255,.85)';
      mctx.beginPath(); mctx.arc(ax, ay, ar, 0, 6.2832); mctx.stroke();
      mctx.restore();
    }

    // ---------- 物件（每 0.7 秒查一次就够） ----------
    if (cfg.dots) {
      if (now - lastPropQ > 700) {
        lastPropQ = now;
        props = queryProps(followX, followY);
      }
      for (const p of props) {
        const x = X(p.x), y = Y(p.y);
        if (!inBox(x, y, 8)) continue;
        if (p.type === 'chest') {
          // 小宝箱：金色小方块
          square(mctx, x, y, 4.5, '#f2c443', 'rgba(35,18,0,.95)');
        } else if (p.type === 'bigchest') {
          // 大宝箱：更大的方块 + 锁孔 + 呼吸的金色光晕
          const beat = 0.5 + Math.sin(now / 300) * 0.5;
          mctx.globalAlpha = 0.22 + beat * 0.28;
          dot(mctx, x, y, 8 + beat * 3, '#ffd23f');
          mctx.globalAlpha = 1;
          square(mctx, x, y, 7.5, '#ffd23f', 'rgba(35,18,0,.95)');
          mctx.fillStyle = '#4a2a10';
          mctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        } else if (p.type === 'altar') {
          // 祭坛（加成柱子）：菱形，用它的效果颜色
          const col = ['#ff5f6d', '#5fd4ff', '#ff8ad8', '#ffd23f'][p.kind & 3] || '#ffd23f';
          diamond(mctx, x, y, 4, p.used, col, 'rgba(0,0,0,.85)');
        } else if (p.type === 'spring') {
          // 泉眼：空心圈（薄荷绿），和实心的祭坛菱形一眼就能分开
          ringMark(mctx, x, y, 3, '#7dffd4', 1.6);
          mctx.fillStyle = 'rgba(125,255,212,.85)';
          mctx.beginPath(); mctx.arc(x, y, 0.9, 0, 6.2832); mctx.fill();
        } else if (p.type === 'trap') {
          // 陷阱：妖异叉号，颜色按类型（0紫 1绿 2橙）
          // 形状（X）+ 深色垫底 是关键：和所有圆点/方块/菱形都不同
          const col = ['#c026d3', '#39ff14', '#ff5500'][p.kind] || TRAP_COL[0];
          // 每颗陷阱相位错开，不会所有点一起同步闪，更像活的
          const beat = 0.5 + Math.sin(now / 300 + p.x * 0.013 + p.y * 0.017) * 0.5;

          // 外层呼吸光晕（妖气）
          mctx.globalAlpha = 0.15 + beat * 0.25;
          dot(mctx, x, y, 7 + beat * 2.5, col);
          mctx.globalAlpha = 0.35 + beat * 0.35;
          ringMark(mctx, x, y, 4 + beat * 2, col, 1);
          mctx.globalAlpha = 1;

          // 深色垫底 + 霓虹叉：浅色地形 / 黑墙上都清晰
          cross(mctx, x, y, 3.6, 'rgba(0,0,0,.9)', 3.4);
          cross(mctx, x, y, 3.6, col, 1.6);
        }
      }

      // ---------- 掉落物（只标值钱的） ----------
      try {
        for (const p of G.Pickups.all()) {
          if (p.kind !== 'item' && p.kind !== 'ticket' && p.kind !== 'ticket10') continue;
          const x = X(p.x), y = Y(p.y);
          if (!inBox(x, y, 3)) continue;
          dot(mctx, x, y, p.kind === 'item' ? 2.6 : 2, p.kind === 'item' ? '#ffe14d' : '#c47bff');
        }
      } catch (e) { }
    }

    // ---------- 裂缝 ----------
    const rift = G.Rift && G.Rift.rift;
    if (rift) {
      let x = X(rift.x), y = Y(rift.y), off = false;
      if (!inBox(x, y, 10)) {
        const p = edgeOf(x, y, 11);
        if (p && Math.hypot(x - S / 2, y - S / 2) < S * 2.5) { x = p[0]; y = p[1]; off = true; }
        else x = null;
      }
      if (x != null) {
        const beat = 0.5 + Math.sin(now / 220) * 0.5;
        mctx.globalAlpha = off ? 0.6 : 0.25 + beat * 0.3;
        dot(mctx, x, y, (off ? 5 : 7) + beat * 3, '#b48aff');
        mctx.globalAlpha = off ? 0.9 : 1;
        dot(mctx, x, y, off ? 2.8 : 3.4, '#e2d0ff', 'rgba(60,20,120,.9)');
        mctx.globalAlpha = 1;
      }
    }

    // ---------- 敌人 ----------
    if (cfg.dots) {
      try {
        for (const e of G.EnemyMgr.all()) {
          if (e.dead) continue;
          const x = X(e.x), y = Y(e.y);
          if (e.boss) {
            // Boss 出了范围就贴在边框上指个方向
            let bx = x, by = y, off = false;
            if (!inBox(x, y, 6)) {
              const p = edgeOf(x, y, 11);
              if (!p || Math.hypot(x - S / 2, y - S / 2) > S * 2.5) continue;
              bx = p[0]; by = p[1]; off = true;
            }
            const beat = 0.5 + Math.sin(now / 260) * 0.5;
            mctx.globalAlpha = (off ? 0.5 : 0.28) + beat * 0.3;
            dot(mctx, bx, by, (off ? 6 : 8) + beat * 3, '#ffcb3d');
            mctx.globalAlpha = off ? 0.9 : 1;
            dot(mctx, bx, by, off ? 3.2 : 4.4, '#ffcb3d', 'rgba(60,30,0,.9)');
            mctx.globalAlpha = 1;
          } else if (!inBox(x, y, 6)) {
            continue;
          } else if (e.shiny) {
            mctx.globalAlpha = 0.5;
            dot(mctx, x, y, 5, '#9ae6ff');
            mctx.globalAlpha = 1;
            dot(mctx, x, y, 2.6, '#e8fbff', 'rgba(0,60,90,.9)');
          } else {
            dot(mctx, x, y, 2.2, 'rgba(255,95,109,.95)', 'rgba(40,0,0,.55)');
          }
        }
      } catch (e) { }
    }

    // ---------- 队友 ----------
    try {
      if (G.Coop && G.Coop.active) {
        for (const m of G.Coop.mates) {
          if (!m.connected || !m.pl) continue;
          const x = X(m.pl.x), y = Y(m.pl.y);
          if (!inBox(x, y, 6)) continue;
          dot(mctx, x, y, 3.4, m.pl.dead ? '#ff8a96' : (m.color || '#7fe0ff'), 'rgba(0,0,0,.75)');
        }
      }
    } catch (e) { }

    // ---------- 自己（五角星，小地图里最通俗的「你在这里」） ----------
    {
      const px = X(pl.x), py = Y(pl.y);
      // 底下垫一层暗色，压在浅色地形上也看得清
      mctx.globalAlpha = 0.35;
      dot(mctx, px, py, 8, 'rgba(0,0,0,.9)');
      mctx.globalAlpha = 1;
      star(mctx, px, py, 6.2, pl.dead ? '#ff8a96' : '#ffffff', 'rgba(0,0,0,.9)');
    }

    // ---------- 按住 Alt：右下角提示「可以拖着放大/缩小」 ----------
    if (altDown) {
      const g = 16;
      mctx.save();
      mctx.beginPath();
      mctx.moveTo(S - 3, S - g);
      mctx.lineTo(S - 3, S - 3);
      mctx.lineTo(S - g, S - 3);
      mctx.closePath();
      mctx.fillStyle = 'rgba(150,200,255,.9)';
      mctx.fill();
      mctx.strokeStyle = 'rgba(255,255,255,.8)';
      mctx.lineWidth = 1;
      mctx.beginPath();
      mctx.moveTo(S - 12, S - 3);
      mctx.lineTo(S - 3, S - 12);
      mctx.stroke();
      mctx.restore();
    }

    mctx.restore();   // 去掉圆角裁剪

    // ---------- 边框 + 方位刻度 ----------
    roundRect(mctx, 0.75, 0.75, S - 1.5, S - 1.5, 10);
    mctx.lineWidth = 1.5;
    mctx.strokeStyle = 'rgba(160,190,230,.4)';
    mctx.stroke();

    mctx.font = '700 9px system-ui,sans-serif';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'top';
    mctx.fillStyle = 'rgba(200,215,240,.55)';
    mctx.fillText('N', S / 2, 3);
  }

  function queryProps(px, py) {
    const out = [];
    try {
      for (const p of G.World.specialsNear(px, py, cfg.range * 0.5)) {
        // if (p.type === 'trap') continue;
        out.push(p);
      }
      for (const p of G.World.propsInCircle(px, py, cfg.range * 0.42)) {
        if (p.type === 'chest') out.push(p);
      }
    } catch (e) { }
    return out;
  }

  // ============================ 循环 ============================

  function loop() {
    requestAnimationFrame(loop);
    if (!G || !mm) return;
    const game = G.Game;
    const pl = game && game.player;
    const st = game && game.state;
    if (!cfg.on || !pl || st === 'ui' || st === 'over') {
      if (mm.style.display !== 'none') mm.style.display = 'none';
      return;
    }
    if (mm.style.display === 'none') {
      mm.style.display = 'block';
      followX = followY = null;
    }
    try { draw(pl); }
    catch (e) { if (!loopErr) { loopErr = true; console.warn('[小地图] 绘制出错（已忽略）', e); } }
  }

  // ============================ 交互 ============================

  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
      cfg.on = !cfg.on;
      saveCfg();
      console.log('%c[小地图] ' + (cfg.on ? '开' : '关'), LOG);
    }
  }

  // Alt + 左键拖动移动小地图（画布本身 pointer-events:none，不挡游戏点击）
  // Alt + 左键拖动 = 移动小地图；Alt + 拖右下角 = 缩放尺寸。
  // （画布本身 pointer-events:none，不挡游戏点击）
  const RESIZE_ZONE = 24;             // 右下角多大范围算「缩放手柄」
  let drag = null;

  function inMap(x, y) {
    if (!mm || mm.style.display === 'none') return false;
    const r = mm.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function inCorner(x, y) {
    if (!inMap(x, y)) return false;
    const r = mm.getBoundingClientRect();
    return x >= r.right - RESIZE_ZONE && y >= r.bottom - RESIZE_ZONE;
  }

  function onDown(e) {
    if (!e.altKey || !inMap(e.clientX, e.clientY)) return;
    const r = mm.getBoundingClientRect();
    if (inCorner(e.clientX, e.clientY)) {
      // 缩放：记下起点尺寸
      drag = { mode: 'resize', x0: e.clientX, y0: e.clientY, s0: cfg.size };
    } else {
      // 移动
      drag = { mode: 'move', dx: e.clientX - r.left, dy: e.clientY - r.top };
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onMove(e) {
    if (!drag) return;

    if (drag.mode === 'resize') {
      // 往右下拖 = 变大；取两个方向的较大值，斜着拖也顺手
      const d = Math.max(e.clientX - drag.x0, e.clientY - drag.y0);
      const s = clampSize(drag.s0 + d);
      if (s !== cfg.size) { cfg.size = s; applyLayout(); }
      return;
    }

    const x = Math.max(0, Math.min(window.innerWidth - cfg.size, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - cfg.size, e.clientY - drag.dy));
    cfg.pos = 'custom';
    cfg.xy = { x: Math.round(x), y: Math.round(y) };
    mm.style.left = cfg.xy.x + 'px';
    mm.style.top = cfg.xy.y + 'px';
    mm.style.right = 'auto';
    mm.style.bottom = 'auto';
  }

  function onUp() {
    if (!drag) return;
    drag = null;
    saveCfg();
  }

  // 跟踪 Alt 是否按下（用来画右下角的缩放提示）
  let altDown = false;
  function onAltKey(e) {
    const v = !!e.altKey;
    if (altDown !== v) altDown = v;
  }

  // ============================ 油猴菜单 ============================

  function cycle(arr, cur) {
    const i = arr.indexOf(cur);
    return arr[(i + 1) % arr.length];
  }

  // ============================ 设置面板 ============================

  let panelEl = null;

  function openSettings() {
    // 已经开着就关掉（当成开关用）
    if (panelEl) { panelEl.remove(); panelEl = null; return; }

    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed', 'z-index:2147483600', 'left:50%', 'top:50%',
      'transform:translate(-50%,-50%)', 'width:322px', 'padding:16px 18px',
      'background:rgba(18,24,36,.97)', 'color:#dbe6f5',
      'font:13px/1.6 system-ui,"Segoe UI",sans-serif',
      'border:1px solid rgba(120,160,220,.45)', 'border-radius:12px',
      'box-shadow:0 14px 48px rgba(0,0,0,.65)',
      'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
      'user-select:none'
    ].join(';');
    panelEl = root;

    // —— 小工具：一行 label + 控件 ——
    const row = (label, control) => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:8px 0;gap:12px';
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = 'flex:0 0 auto;color:#b6c6dd';
      r.appendChild(l); r.appendChild(control);
      return r;
    };

    const mkCheck = (val, onChange) => {
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = !!val;
      c.style.cssText = 'width:16px;height:16px;accent-color:#5aa9ff;cursor:pointer';
      c.onchange = () => onChange(c.checked);
      return c;
    };

    const mkSelect = (opts, val, onChange) => {
      const s = document.createElement('select');
      s.style.cssText = 'flex:1;min-width:0;background:#0f1726;color:#dbe6f5;' +
        'border:1px solid rgba(120,160,220,.35);border-radius:6px;padding:3px 6px;' +
        'font:inherit;outline:none;cursor:pointer';
      for (const [v, t] of opts) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        if (String(v) === String(val)) o.selected = true;
        s.appendChild(o);
      }
      s.onchange = () => onChange(s.value);
      return s;
    };

    const mkRange = (min, max, step, val, onChange, fmt) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;display:flex;align-items:center;gap:8px;min-width:0';
      const r = document.createElement('input');
      r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
      r.style.cssText = 'flex:1;min-width:0;accent-color:#5aa9ff;cursor:pointer';
      const v = document.createElement('span');
      v.style.cssText = 'flex:0 0 38px;text-align:right;color:#8fb8e0;font-variant-numeric:tabular-nums';
      v.textContent = fmt ? fmt(val) : val;
      r.oninput = () => { v.textContent = fmt ? fmt(r.value) : r.value; onChange(+r.value); };
      wrap.appendChild(r); wrap.appendChild(v);
      return wrap;
    };

    // —— 标题 ——
    const title = document.createElement('div');
    title.textContent = '小地图设置';
    title.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:4px;color:#eaf2ff';
    root.appendChild(title);

    // —— 各项 ——
    root.appendChild(row('显示 (M)', mkCheck(cfg.on, v => { cfg.on = v; saveCfg(); })));
    root.appendChild(row('地形', mkCheck(cfg.terrain, v => { cfg.terrain = v; saveCfg(); })));
    root.appendChild(row('物件点', mkCheck(cfg.dots, v => { cfg.dots = v; saveCfg(); })));

    root.appendChild(row('大小', (() => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;display:flex;align-items:center;gap:8px;min-width:0';

      const r = document.createElement('input');
      r.type = 'range'; r.min = SIZE_MIN; r.max = SIZE_MAX; r.step = 1; r.value = cfg.size;
      r.style.cssText = 'flex:1;min-width:0;accent-color:#5aa9ff;cursor:pointer';

      const n = document.createElement('input');
      n.type = 'number'; n.min = SIZE_MIN; n.max = SIZE_MAX; n.step = 1; n.value = cfg.size;
      n.title = '输入 ' + SIZE_MIN + '–' + SIZE_MAX + '，回车确认';
      n.style.cssText = 'flex:0 0 58px;width:58px;box-sizing:border-box;background:#0f1726;' +
        'color:#dbe6f5;border:1px solid rgba(120,160,220,.35);border-radius:6px;' +
        'padding:3px 5px;font:inherit;outline:none;text-align:right';

      const set = v => {
        v = clampSize(v);
        cfg.size = v; saveCfg(); applyLayout();
        if (+r.value !== v) r.value = v;
        if (+n.value !== v) n.value = v;
      };

      r.oninput = () => { n.value = r.value; set(r.value); };
      n.onchange = () => set(n.value);
      n.onkeydown = e => { if (e.key === 'Enter') { set(n.value); n.blur(); } };

      wrap.appendChild(r); wrap.appendChild(n);
      return wrap;
    })()));

    root.appendChild(row('范围', mkSelect(
      RANGES.map(v => [v, v + ' 世界px']), cfg.range,
      v => { cfg.range = +v; saveCfg(); }
    )));

    root.appendChild(row('透明度', mkRange(0.3, 1, 0.02, cfg.alpha,
      v => { cfg.alpha = v; saveCfg(); applyLayout(); },
      v => Math.round(v * 100) + '%'
    )));

    root.appendChild(row('位置', mkSelect(
      POS_ORDER.concat('custom').map(v => [v, POS_NAME[v] || v]),
      cfg.pos,
      v => { cfg.pos = v; if (v !== 'custom') cfg.xy = null; saveCfg(); applyLayout(); }
    )));

    // —— 底部按钮 ——
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px';

    const mkBtn = (text, primary, onClick) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = [
        'padding:5px 12px', 'border-radius:7px', 'font:inherit', 'cursor:pointer',
        'border:1px solid ' + (primary ? '#5aa9ff' : 'rgba(120,160,220,.35)'),
        'background:' + (primary ? '#2b6fbf' : 'transparent'),
        'color:' + (primary ? '#fff' : '#cfe0f5')
      ].join(';');
      b.onclick = onClick;
      return b;
    };

    bar.appendChild(mkBtn('恢复默认', false, () => {
      Object.assign(cfg, DEF, { xy: null });
      saveCfg(); applyLayout();
      root.remove(); panelEl = null;
      openSettings();                      // 重开一次，刷新控件状态
    }));
    bar.appendChild(mkBtn('关闭', true, () => { root.remove(); panelEl = null; }));
    root.appendChild(bar);

    // —— 点面板外部关闭 ——
    const onOutside = e => {
      if (panelEl && !panelEl.contains(e.target)) {
        panelEl.remove(); panelEl = null;
        document.removeEventListener('pointerdown', onOutside, true);
      }
    };
    setTimeout(() => {
      if (panelEl === root) document.addEventListener('pointerdown', onOutside, true);
    }, 0);

    (document.body || document.documentElement).appendChild(root);
  }

  // ============================ 油猴菜单 ============================

  function menu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    const reg = (label, fn) => { try { GM_registerMenuCommand(label, fn); } catch (e) { } };
    reg('小地图：设置面板…', openSettings);
    reg('小地图：显示 / 隐藏（M）', () => { cfg.on = !cfg.on; saveCfg(); });
    reg('小地图：恢复默认设置', () => {
      Object.assign(cfg, DEF, { xy: null });
      saveCfg(); applyLayout();
    });
  }

  // ============================ 启动 ============================

  injectTrap();
  menu();

  let tries = 0;
  const timer = setInterval(() => {
    const g = findG();
    const cvEl = document.getElementById('game');
    if (g && cvEl) {
      clearInterval(timer);
      start(g, cvEl);
      return;
    }
    if (++tries > 600) clearInterval(timer);   // 60 秒还没等到：不是这个游戏页面（陷阱自己会撤）
  }, 100);

  function start(g, cvEl) {
    G = g;
    try {
      TS = G.World.TS || 32;
      CW = G.World.CW || 512;
    } catch (e) { }
    ensureOverlay();
    applyLayout();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', onAltKey, true);
    window.addEventListener('keyup', onAltKey, true);
    window.addEventListener('blur', () => { altDown = false; });
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('blur', onUp);
    window.addEventListener('resize', applyLayout);
    requestAnimationFrame(loop);
    console.log('%c[小地图] 已启动（M 开关，Alt+拖动移动）', LOG);
  }
})();
