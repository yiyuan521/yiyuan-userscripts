/*
 * lib.js — 公共库（Node 下把 userscript 跑起来 + 读取游戏里的文案）
 *
 * 这些工具只在**你自己维护词表时**用，游戏和脚本运行时都不需要 Node。
 * 用法见 tools/README.md。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/** 游戏源码目录：默认是 ../../../pokesurvivor（与本项目同级的那个 clone） */
const DEFAULT_GAME = path.resolve(__dirname, '..', '..', '..', 'pokesurvivor');

function gameDir(arg) {
  const dir = arg ? path.resolve(arg) : DEFAULT_GAME;
  const need = path.join(dir, 'js', 'data', 'lang-en.js');
  if (!fs.existsSync(need)) {
    console.error('找不到游戏源码：' + need);
    console.error('用 --game <目录> 指定游戏仓库位置（默认 ' + DEFAULT_GAME + '）');
    process.exit(2);
  }
  return dir;
}

/* ------------------------------------------------------------------ 浏览器桩 */

/** Node 21+ 的 global.navigator 是只读 getter，只能 defineProperty */
function setNavigator(lang) {
  const nav = { languages: [lang === 'en' ? 'en-US' : 'es-ES'], language: lang === 'en' ? 'en-US' : 'es-ES' };
  Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
}

/**
 * 把一份 userscript 在 Node 里执行，返回它的 translate()。
 * @param {string} file userscript 路径
 * @param {'en'|'es'} lang 脚本会强制游戏用哪种语言（决定桩里的浏览器语言）
 */
function loadScript(file, lang) {
  const messages = [];
  const win = {
    confirm: m => { messages.push(m); return true; },
    alert: m => { messages.push(m); },
    prompt: m => { messages.push(m); return ''; },
  };
  global.window = win;
  global.localStorage = { getItem: () => null, setItem: () => {} };
  global.document = {
    readyState: 'loading',
    documentElement: { lang: '' },
    addEventListener: () => {},
    createTreeWalker: () => ({ nextNode: () => null }),
    title: '',
  };
  global.MutationObserver = function () { this.observe = () => {}; };
  global.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
  setNavigator(lang);
  global.CanvasRenderingContext2D = { prototype: { fillText() {}, strokeText() {}, measureText() {} } };

  eval(fs.readFileSync(file, 'utf8'));          // eslint-disable-line no-eval
  if (!win.__PSZH) throw new Error(file + ' 没有暴露 window.__PSZH');
  return { zh: win.__PSZH.translate, dict: win.__PSZH.dict, messages, window: win };
}

/**
 * 载入游戏自己的 i18n（西→英层）。lang='es' 时它是空转的，和浏览器里一致。
 * 返回 t()：把游戏里的西语原文变成它实际显示的文案。
 */
function loadGameI18n(dir, lang) {
  const store = { 'ps.lang': lang };
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: () => {} };
  global.location = { pathname: '/' };
  global.document = { documentElement: { lang: '' }, createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [], body: {} };
  global.MutationObserver = function () { this.observe = () => {}; };
  global.window = { confirm: () => {}, alert: () => {} };
  global.CanvasRenderingContext2D = { prototype: { fillText() {}, strokeText() {}, measureText() {} } };
  global.G = {};
  eval(fs.readFileSync(path.join(dir, 'js', 'core', 'i18n.js'), 'utf8'));   // eslint-disable-line no-eval
  if (lang === 'en') eval(fs.readFileSync(path.join(dir, 'js', 'data', 'lang-en.js'), 'utf8')); // eslint-disable-line no-eval
  return global.G.I18n.t;
}

/* ------------------------------------------------------------------ 读取语料 */

const read = p => fs.readFileSync(p, 'utf8');

/** lang-en.js 的 [西语, 英语] 对照表 */
function langPairs(dir) {
  const pairs = [];
  global.G = { I18n: { add: d => { for (const [es, en] of Object.entries(d)) pairs.push([es, en]); } } };
  eval(read(path.join(dir, 'js', 'data', 'lang-en.js')));                    // eslint-disable-line no-eval
  return pairs;
}

/** changelog.js：每条都是 [西语, 英语] */
function changelog(dir) {
  global.G = global.G || {};
  global.G.CHANGELOG = [];
  eval(read(path.join(dir, 'js', 'data', 'changelog.js')));                  // eslint-disable-line no-eval
  return global.G.CHANGELOG;
}

function changelogRows(cl) {
  const rows = [];
  for (const e of cl) {
    if (e.title) rows.push(e.title);
    for (const k of ['new', 'chg', 'fix']) for (const r of (e[k] || [])) rows.push(r);
  }
  return rows;
}

/** pokedex.js 里宝可梦在界面上显示的名字 */
function dexNames(dir) {
  global.G = global.G || {};
  global.G.DEX = [];
  eval(read(path.join(dir, 'js', 'data', 'pokedex.js')));                    // eslint-disable-line no-eval
  return global.G.DEX.map(d => d.name);
}

/** 从 userscript 里解析出四张词表 */
function parseTables(text, names) {
  const out = {};
  for (const name of names) out[name] = parseTable(text, name);
  return out;
}
function parseTable(text, name) {
  const i = text.indexOf('  var ' + name + ' = {');
  if (i < 0) throw new Error('找不到词表 ' + name);
  const o = text.indexOf('{', i);
  let d = 0, end = -1;
  for (let j = o; j < text.length; j++) {
    if (text[j] === '{') d++;
    else if (text[j] === '}') { d--; if (!d) { end = j; break; } }
  }
  const body = text.slice(o, end + 1);
  const pairs = [];
  for (const m of body.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    pairs.push([m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')]);
  }
  return pairs;
}

/** 把一串词表渲染成 userscript 里的对象字面量。
 *  同名键与 JS 对象字面量一致：保留第一次出现的位置、最后一次赋的值。 */
function table(name, entries, comment) {
  const m = new Map();
  for (const [k, v] of entries) m.set(k, v);
  const lines = [...m].map(([k, v]) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',');
  return '  ' + comment + '\n  var ' + name + ' = {\n' + lines.join('\n') + '\n  };';
}

/** 抽出源码里的所有字符串字面量（带位置），跳过注释行 */
function literalsOf(dir, opts) {
  opts = opts || {};
  const out = [];
  const skip = /assets|\.git|node_modules|tools|docs|functions|^en$/;
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.test(e.name)) walk(p); continue; }
      if (/\.(js|html)$/.test(e.name) && !/app\.min|lang-en/.test(e.name)) files.push(p);
    }
  })(dir);
  for (const f of files) {
    const rel = path.relative(dir, f).replace(/\\/g, '/');
    read(f).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;               // 注释行
      const code = line.replace(/\/\/.*$/, '');
      const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
      let m;
      while ((m = re.exec(code))) {
        const s = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
        if (!s || !/[A-Za-zÀ-ÿ]/.test(s)) continue;
        if (opts.minLen && s.length < opts.minLen) continue;
        out.push({ s, loc: rel + ':' + (i + 1) });
      }
    });
  }
  return out;
}

/* ------------------------------------------------------------------ 判定 */

const HAS_ZH = /[\u3400-\u9FFF]/;

/** 只保留"看起来是给人看的文本"（挡掉类名、图标数据、日志、模板） */
function looksLikeText(s) {
  if (!/\s/.test(s)) return false;                                      // 单词另有一套判定
  if (/[{}<>;=()[\]]|=>/.test(s)) return false;                         // 代码/模板
  if (/^[\s\d.:#%+×°/-]+$/.test(s)) return false;                       // 纯符号数字
  if (/^(rgba?|hsla?)\(/.test(s)) return false;
  if (/^(doc|btn|box|scr|row|sub|note|panel|chip|tab|seg|field|topbar|menu-item|boot|credits-line|tapstart|pcard|lay|rk|fav|items|dexgrid)\b/.test(s)) return false;
  if (/^\d+\s*\d*px\b|\bPixelify\b|\bSegoe UI\b/.test(s)) return false;  // 字体
  if (/^[A-G]#?\d/.test(s)) return false;                               // 音符
  if (/console\.|\[Net\]|\[Social\]|\[DB\]|\[Game\]|\[Arranque\]/.test(s)) return false;
  return true;
}

module.exports = {
  DEFAULT_GAME, gameDir, loadScript, loadGameI18n,
  langPairs, changelog, changelogRows, dexNames,
  parseTables, parseTable, table, literalsOf,
  HAS_ZH, looksLikeText,
};

