#!/usr/bin/env node
/*
 * audit.js — 一键审计：找出脚本还没翻译的游戏文案
 *
 *   node tools/audit.js                          # 两份脚本都查
 *   node tools/audit.js --script pokesurvivor-zh-es.user.js
 *   node tools/audit.js --game D:\code\pokesurvivor
 *
 * 三个**精确**检查（有输出就是真遗漏，退出码 1）：
 *   1. lang-en.js 的全部条目（游戏自带的西→英表，取脚本对应语言的那一侧）
 *   2. 「更新内容」正文（西/英两列，取对应语言那一列）
 *   3. 图鉴 966 个名字
 * 两个**辅助**输出（不影响退出码）：
 *   4. 已知的"运行时拼接句"断言表（游戏把片段拼成整句再显示，必须整句能译）
 *   5. 源码里新出现的"疑似拼接文案"候选，供人工过目
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const HERE = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const GAME = L.gameDir(opt('game'));
const SCRIPTS = opt('script')
  ? [path.resolve(HERE, opt('script'))]
  : ['pokesurvivor-zh-en.user.js', 'pokesurvivor-zh-es.user.js'].map(f => path.join(HERE, f));

/* 运行时拼接句断言表：{x} 会被换成示例名字再整句测试。
   左边是"游戏实际拼出来的样子"，两边（英/西）都列出来。 */
const ASSEMBLED = {
  en: [
    '{x} is enraged!', '{x} got away!', 'A wild {x} appeared!', 'A wild shiny {x} appeared!',
    'A shiny {x} is nearby!', 'You got a shiny {x}!', 'Another shiny {x}! (+300 coins)',
    '{x} needs help! · 120 m', 'Paused: {x} is choosing…', 'Paused: {x} are choosing…',
    'Paused: waiting for {x} (host)…', '{x} left the game', '{x} joins you!', '{x} joins your team!',
    'New best record {x} on the leaderboard!', 'Request sent to {x}', 'Invite sent to {x}',
    "You're now friends with {x}", 'It will fire at the same time as {x}.',
    'Choose which move joins {x}', 'Which move do you bond {x} with?',
    "Report {x}'s record as cheating?", 'You already hold {x}', 'Lv. 12 · 1,234 defeated',
    'RIFT · 12 m · 30 s', '{x} HORDE · 20 s', 'GOLDEN HOUR · 20 s',
    'JUDGMENT · 12:34 · BOSSES 3', '{x} power! {x} for 10 s', 'Waiting for {x}…',
    'Still choosing: {x}', 'Still choosing: {x} and you', 'Choose your card',
    '{x} answers the Judgment!', '{x} is following you! Take it to the green marker',
    'A {x} is lost! Find it and take it to the marker',
    'You brought {x} home! It thanks you', '{x} got scared and ran away…!',
    '{x} got tired of waiting and left…', '{x} was waiting in the rift!',
    'You defeated {x}! Grab your reward…', 'Mission complete: {x}', 'Achievement: {x}!',
    'A {x}-type horde!', 'Defeat {x}', 'Defeat {x} in a rift.', 'Defeat 10,000 Pokémon',
    'Defeat 25 bosses', '3 h 20 min', '1 d 5 h', 'POKé SLOTS',
  ],
  es: [
    '¡{x} se ha enfurecido!', '¡{x} se ha escapado!', '¡{x} salvaje apareció!',
    '¡{x} shiny salvaje apareció!', '¡Un {x} shiny anda cerca!', '¡Has conseguido a {x} shiny!',
    '¡Otro {x} shiny! (+300 monedas)', '¡{x} necesita ayuda! · 120 m', 'Pausa: {x} está eligiendo…',
    'Pausa: {x} están eligiendo…', 'Pausa: esperando a {x} (anfitrión)…', '{x} ha dejado la partida',
    '¡{x} se une a ti!', '¡{x} se une a tu equipo!', '¡Nueva mejor marca {x} en el ranking!',
    'Solicitud enviada a {x}', 'Invitación enviada a {x}', 'Ahora eres amigo de {x}',
    'Se lanzará a la vez que {x}.', 'Elige qué movimiento se une a {x}', '¿Con cuál unes {x}?',
    '¿Reportar la marca de {x} como trampa?', 'Ya llevas {x}', 'Nv. 12 · 1.234 derrotados',
    'GRIETA · 12 m · 30 s', 'HORDA 3 · 20 s', 'HORA DORADA · 20 s',
    'SENTENCIA · 12:34 · JEFES 3', '¡Poder {x}! {x} durante 10 s', 'Esperando a {x}…',
    'Faltan por elegir: {x}', 'Faltan por elegir: {x} y tú', 'Elige tu carta',
    '¡{x} acude a la Sentencia!', '¡{x} te sigue! Llévalo a la marca verde',
    '¡Un {x} se ha perdido! Búscalo y llévalo a la marca',
    '¡Has llevado a {x} a casa! Te lo agradece', '¡{x} se ha asustado y ha huido…!',
    '{x} se ha cansado de esperar y se ha ido…', '¡{x} te esperaba en la grieta!',
    '¡Has vencido a {x}! Recoge el premio…', 'Misión completada: {x}', '¡Logro: {x}!',
    '¡Horda de tipo {x}!', 'Vence a {x}', 'Derrota a {x} en una grieta.',
    'Derrota a 10.000 Pokémon', 'Derrota a 25 jefes', '3 h 20 min', '1 d 5 h', 'POKé SLOTS',
  ],
};
const SAMPLE = { en: 'Mewtwo', es: 'Mewtwo' };

/* 候选：源码里"多个字面量拼起来 / 模板里带 ${}"的行，抽出来给人看 */
function candidates() {
  const out = [];
  const skipDir = /^(assets|tools|docs|functions|en|node_modules|\.git)$/;
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skipDir.test(e.name)) walk(p); continue; }
      if (e.name.endsWith('.js') && !/lang-en|app\.min/.test(e.name)) files.push(p);
    }
  })(path.join(GAME, 'js'));
  for (const f of files) {
    const rel = path.relative(GAME, f).replace(/\\/g, '/');
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '');
      if (!/\$\{|'\s*\+|\+\s*'/.test(code)) return;
      const words = code.replace(/<[^>]*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ').match(/[A-Za-zÀ-ÿ]{4,}/g) || [];
      if (words.length < 2) return;                         // 没有像样的人话
      if (/px|Pixelify|Segoe UI|monospace|rgba?\(|class=|style=|mailto:|https?:/.test(code)) return;
      out.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 110));
    });
  }
  return out;
}

const pairs = L.langPairs(GAME);
const clRows = L.changelogRows(L.changelog(GAME));
const dex = L.dexNames(GAME);
const cands = candidates();

/* 刻意保持拉丁字母的原文（品牌、缩写、以及"译成 BOSS 更好"的词），不算遗漏 */
const KEEP = new Set(['Lv.', 'Nv.', 'HP', 'Pokémon', 'PokéSurvivor', 'Google', 'Gmail', 'MIT', 'OFL', 'PMD',
  'Ko-fi', 'Firebase', 'Firestore', 'PokeAPI', 'SpriteCollab', 'PolyForm', 'Noncommercial', 'Nintendo',
  'Creatures', 'GAME FREAK', 'WASD', 'Esc', 'GitHub', 'Wi-Fi', 'iPhone', 'Safari', 'Chrome', 'JavaScript',
  'NFT', 'FPS', 'EUR', 'x10', 'Bosses', 'Jefes', 'Boss hunter', 'Cazajefes',
  'Terror of bosses', 'Terror de los jefes', '+8 vida']);

function strip(s) {
  return s.replace(
    /Pokémon|PokéSurvivor|BOSS(?:ES)?|HP|Lv\.|Nv\.|MIT|OFL|PMD|Ko-fi|Google|Gmail|Firebase|Firestore|PokeAPI|SpriteCollab|PolyForm|Noncommercial|Nintendo|Creatures|GAME FREAK|WASD|Esc|GitHub|Wi-Fi|iPhone|Safari|Chrome|JavaScript|Pixelify|Sans|CREDITS\.md|CC BY-NC|pokesurvivor\.com|Authentication|Settings|Authorized|domains|x10|Inc\.|The Pokémon Company|NFT|FPS|EUR|Mewtwo|Pikachu|Meowth|Gholdengo|Iron Treads/gi, '');
}
/** 译好了：输出里没有剩下的实义拉丁词，而且要么有中文、要么原文本身就是刻意保留的 */
function isOk(src, out) {
  if (/[A-Za-zÀ-ÿ]{3,}/.test(strip(out))) return false;
  if (L.HAS_ZH.test(out)) return true;
  return KEEP.has(src.trim()) || !/[A-Za-zÀ-ÿ]{3,}/.test(strip(src));
}

let failed = 0;
for (const file of SCRIPTS) {
  if (!fs.existsSync(file)) { console.error('找不到脚本：' + file); process.exit(2); }
  const lang = /-es\.user\.js$/.test(file) ? 'es' : 'en';
  const { zh, dict } = L.loadScript(file, lang);
  const T = L.loadGameI18n(GAME, lang);
  const idx = lang === 'en' ? 1 : 0;

  console.log('\n' + '='.repeat(64));
  console.log(path.basename(file) + '   （游戏语言 ' + lang + '，词表 ' + Object.keys(dict).length + ' 条）');
  console.log('='.repeat(64));

  const parts = [
    ['lang-en.js 全部条目', pairs.map(p => p[idx])],
    ['更新内容正文', clRows.map(r => r[idx])],
    ['图鉴名字', dex],
  ];
  let total = 0;
  for (const [label, list] of parts) {
    const bad = [];
    for (const s of list) {
      if (!s || !/[A-Za-zÀ-ÿ]/.test(s)) continue;
      const out = zh(T(s));
      if (isOk(s, out)) continue;
      bad.push([s, out]);
    }
    total += bad.length;
    console.log('\n· ' + label + '：' + list.length + ' 条，未译 ' + (bad.length || '0') + ' 条');
    for (const [s, out] of bad.slice(0, 25)) console.log('    ✗ ' + s.slice(0, 88) + '\n        → ' + out.slice(0, 88));
    if (bad.length > 25) console.log('    …还有 ' + (bad.length - 25) + ' 条');
  }

  // 运行时拼接句
  const sims = ASSEMBLED[lang].map(s => s.replace(/\{x\}/g, SAMPLE[lang]));
  const rbad = [];
  for (const s of sims) {
    const out = zh(T(s));
    if (isOk(s, out)) continue;
    rbad.push([s, out]);
  }
  total += rbad.length;
  console.log('\n· 运行时拼接句断言：' + sims.length + ' 条，未译 ' + (rbad.length || '0') + ' 条');
  for (const [s, out] of rbad) console.log('    ✗ ' + s.slice(0, 88) + '\n        → ' + out.slice(0, 88));

  console.log('\n· 疑似拼接文案候选（仅供参考，游戏更新后建议过一眼）：' + cands.length + ' 处');
  failed += total;
}

console.log('\n' + '='.repeat(64));
console.log(failed ? '共 ' + failed + ' 条需要处理' : '三个精确检查全部通过 ✓');
process.exit(failed ? 1 : 0);



