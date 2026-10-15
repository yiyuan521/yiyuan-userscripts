#!/usr/bin/env node
/*
 * build-es.js — 从英文版自动生成西语版
 *
 *   node tools/build-es.js                      # 覆盖 pokesurvivor-zh-es.user.js
 *   node tools/build-es.js --check              # 只报告差异，不写文件
 *   node tools/build-es.js --game D:\code\pokesurvivor
 *
 * 原理：`js/data/lang-en.js` 本身就是「西语原文 → 英文」的完整对照，
 * 所以西语词表不需要重译，直接把英文版里已有中文按对照关系改挂到西语键上：
 *
 *   英文版:  "Defeat 25 bosses." : "击败 25 个 BOSS。"
 *   对照:    'Derrota a 25 jefes.'  ->  'Defeat 25 bosses.'
 *   西语版:  "Derrota a 25 jefes." : "击败 25 个 BOSS。"
 *
 * 三件额外的事：
 *   · 一个英文键可能对应多个西语键（如 Guardar / Partida 英文都是 Save），全部生成；
 *   · 英文版是靠"碎片替换"凑出来的条目，用英文版的 translate() 先算一遍再挂过去；
 *   · 英文版里没有、西语版独有的条目（西语分支文案、管理员面板等）原样保留。
 * 引擎代码整段照抄英文版，所以只维护一份逻辑。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const HERE = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const GAME = L.gameDir(opt('game'));
const EN_FILE = path.resolve(HERE, opt('en', 'pokesurvivor-zh-en.user.js'));
const OUT_FILE = path.resolve(HERE, opt('out', 'pokesurvivor-zh-es.user.js'));
const CHECK = argv.includes('--check');

/* 英文版里"只在英文模式出现"的东西：西语版不要，必须丢掉（否则西语版会挂着英文键） */
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_MAINT = [
  'We are under maintenance.',
  'We are moving the game to new servers so it can stay free for everyone. Your account, your save and your Pokémon are safe. Please come back in a few hours!',
  'Try again'];
const EN_CHANGELOG_ONLY_LABELS = ['New', 'Changes', 'Fixes'];          // 「更新内容」三个分组标题（英文分支）
const isEnRanking = k => /^(You're not in the top 50 |Your best |You don't have a )/.test(k) && !/^\s*$/.test(k);

/* 手工修正：英文层把西语的区别抹平了，这里分开 */
const OVERRIDE = new Map([
  ['Guardar', '保存'],      // 英文都是 "Save"
  ['Partida', '存档'],
  ['Vida', '体力'],         // "HP"
  ['Psíquico', '超能力'],   // 属性名，不是招式
]);

/* ---------------------------------------------------------------- 读入 */
const enSrc = fs.readFileSync(EN_FILE, 'utf8');
const enTables = L.parseTables(enSrc, ['Interface_Dict', 'Pokemon_Dict', 'Skill_Dict', 'Addition_Dict']);
const zhOf = new Map();
for (const t of Object.values(enTables)) for (const [k, v] of t) zhOf.set(k, v);
const { zh: zhEn } = L.loadScript(EN_FILE, 'en');

const pairs = L.langPairs(GAME);
const clRows = L.changelogRows(L.changelog(GAME));
const langEn = new Map(), en2esList = new Map();
for (const [es, en] of pairs) {
  if (!langEn.has(es)) langEn.set(es, en);
  if (!en2esList.has(en)) en2esList.set(en, []);
  if (!en2esList.get(en).includes(es)) en2esList.get(en).push(es);
}
const esKeySet = new Set(langEn.keys());
const hasZh = s => L.HAS_ZH.test(s || '');
function zhForEs(es) {
  const en = langEn.get(es);
  if (en === undefined) return null;
  if (zhOf.has(en)) return zhOf.get(en);
  const out = zhEn(en);                              // 英文版靠碎片替换出来的条目
  return hasZh(out) ? out : null;
}

/* ---------------------------------------------------------------- 推导西语词表 */
const ES = { Interface_Dict: [], Pokemon_Dict: [], Skill_Dict: [], Addition_Dict: [] };
const emitted = new Set();
const stats = { mapped: 0, viaManyToOne: 0, viaFragment: 0, keptAsIs: 0, dropped: 0 };
function push(table, key, value) {
  if (emitted.has(key)) return;
  emitted.add(key);
  ES[table].push([key, value]);
}

const clEnSet = new Set(clRows.map(r => r[1]));
for (const table of ['Interface_Dict', 'Pokemon_Dict', 'Skill_Dict', 'Addition_Dict']) {
  for (const [k, v] of enTables[table]) {
    if (table === 'Pokemon_Dict') { push(table, k, v); continue; }        // 图鉴名字来自数据，两种模式一样
    if (clEnSet.has(k) || EN_MONTHS.includes(k) || EN_MAINT.includes(k) ||
        EN_CHANGELOG_ONLY_LABELS.includes(k) || k === 'Cargando…' || isEnRanking(k)) { stats.dropped++; continue; }
    if (OVERRIDE.has(k)) { push(table, k, OVERRIDE.get(k)); continue; }
    if (esKeySet.has(k)) {                                                // 这个键本身就是西语
      const zh = zhForEs(k);
      if (zh) { push(table, k, zh); stats.mapped++; } else { push(table, k, v); stats.keptAsIs++; }
      continue;
    }
    const list = en2esList.get(k) || [];
    if (list.length) {                                                    // 英文键 → 一个或多个西语键
      if (list.length > 1) stats.viaManyToOne++;
      for (const es of list) {
        if (!zhOf.has(langEn.get(es))) stats.viaFragment++;
        push(table, es, OVERRIDE.get(es) || zhForEs(es) || zhOf.get(k) || v);
      }
      continue;
    }
    push(table, k, v);                                                    // 语言无关的（品牌、id）原样保留
    stats.keptAsIs++;
  }
}
/* 西语独有的条目：直接沿用现有西语版里那些"推不出来"的（西语分支文案、月份、管理员面板…） */
let preserved = 0;
if (fs.existsSync(OUT_FILE)) {
  const old = L.parseTables(fs.readFileSync(OUT_FILE, 'utf8'), ['Interface_Dict', 'Pokemon_Dict', 'Skill_Dict', 'Addition_Dict']);
  for (const table of ['Addition_Dict', 'Interface_Dict', 'Skill_Dict']) {
    for (const [k, v] of old[table]) {
      if (emitted.has(k)) continue;
      push(table, k, v);
      preserved++;
    }
  }
}
/* 更新内容：中文不变，改挂到西语那一列 */
let clKeys = 0;
for (const [es, en] of clRows) {
  const zh = zhOf.get(en) || (hasZh(zhEn(en)) ? zhEn(en) : null);
  if (zh) { push('Addition_Dict', es, zh); clKeys++; }
}
/* 西语月份名（注册提示里会用到） */
['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  .forEach((m, i) => push('Addition_Dict', m, String(i + 1)));

/* ---------------------------------------------------------------- 生成文件 */
const headerEnd = enSrc.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
const engineStart = enSrc.indexOf('(function () {');
const tablesStart = enSrc.indexOf('  var Interface_Dict = {');
const tablesEnd = enSrc.indexOf('\n  };', enSrc.indexOf('  var Addition_Dict = {')) + '\n  };'.length;
const engineHead = enSrc.slice(engineStart, tablesStart).replace("forceLang: 'en'", "forceLang: 'es'");
const engineTail = enSrc.slice(tablesEnd);
const topComment = `
/*
 * 工作原理
 * --------
 * 游戏的原生语言是西班牙语，英文只是它自带的一层翻译（js/data/lang-en.js）。
 * 本脚本把游戏固定成西语渲染（ps.lang=es）。此时游戏自己的 i18n 完全不工作
 * （t() 直接返回原文、DOM 与 canvas 都不包装），调用链只剩 本脚本(es→zh) → 原生：
 * 以西语原文为准，少一层中转，也不再依赖它英文层是否完整。
 * 接管方式：
 *   1. 覆盖 CanvasRenderingContext2D 的 fillText / strokeText / measureText
 *   2. 用 TreeWalker + MutationObserver 遍历并持续翻译 DOM 文本节点与属性
 *   3. 另接 confirm / alert / prompt（游戏用它们弹确认框）
 * 词表是离线的（界面词条 + 宝可梦名 + 招式名 + 更新内容都在同一张 DICT 里），不发起任何网络请求。
 * 本文件由 tools/build-es.js 从 pokesurvivor-zh-en.user.js 生成 —— 请改英文版再重新生成。
 */
`;
const HEADER = `// ==UserScript==
// @name         PokéSurvivor 中文化（西语源）
// @name:en      PokéSurvivor Chinese (from Spanish)
// @namespace    https://github.com/yiyuan521/yiyuan-userscripts
// @version      1.0.0
// @description  把 PokéSurvivor 的界面、提示、任务、道具说明、宝可梦名/招式名和局内文字翻译成简体中文（离线词表，不联网；含全国图鉴 1-1025 全部宝可梦名）。本版以游戏原生的西班牙语文本为源。
// @author       yiyuan521
// @match        https://pokesurvivor.com/*
// @match        https://www.pokesurvivor.com/*
// @match        https://pokesurvivor.games/*
// @icon         https://pokesurvivor.com/assets/icons/icon-96.png
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-zh-es.user.js
// @updateURL    https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-zh-es.user.js
// ==/UserScript==`;

const TABLES = [
  L.table('Interface_Dict', ES.Interface_Dict, '/* ===================== 界面词表：UI / 按钮 / 提示 / 任务 / 道具说明 ===================== */'),
  L.table('Pokemon_Dict', ES.Pokemon_Dict, '/* ===================== 宝可梦名表：全国图鉴 1-1025 ===================== */'),
  L.table('Skill_Dict', ES.Skill_Dict, '/* ===================== 招式表 ===================== */'),
  L.table('Addition_Dict', ES.Addition_Dict, '/* ===================== 补充表：优先级最高 ===================== */'),
].join('\n\n');

const out = [HEADER, topComment, engineHead, TABLES, engineTail].join('\n');

const before = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
console.log('英文键 → 西语键：' + stats.mapped + ' 条（其中英文层合并的 ' + stats.viaManyToOne +
  ' 组、需要引擎补译的 ' + stats.viaFragment + ' 条）');
console.log('语言无关/原样保留：' + stats.keptAsIs + ' 条；只在英文模式出现的丢掉：' + stats.dropped + ' 条');
console.log('保留的西语独有条目：' + preserved + ' 条；更新内容重新挂键：' + clKeys + ' 条');
console.log('各区条目数：' + Object.entries(ES).map(([k, v]) => k + '=' + v.length).join(' '));

if (CHECK) {
  console.log(before === out ? '\n结果一致 ✓' : '\n有差异（未写入，去掉 --check 即覆盖）');
  process.exit(before === out ? 0 : 1);
}
fs.writeFileSync(OUT_FILE, out);
console.log('\n已写入 ' + path.relative(HERE, OUT_FILE) + '（' + out.split('\n').length + ' 行）');
