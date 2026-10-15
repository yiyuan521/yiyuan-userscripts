# tools/ — 维护工具

只在改词表 / 游戏更新后用，**玩游戏不需要 Node**。

```
node tools/audit.js                      # 两份脚本都体检
node tools/audit.js --script pokesurvivor-zh-en.user.js
node tools/build-es.js                   # 从英文版重新生成西语版
node tools/build-es.js --check           # 只报告有没有差异，不写文件
```

默认到 `../../../pokesurvivor` 找游戏源码（与本项目同级）；用 `--game <目录>` 指定别处。

## audit.js — 找出"还没翻译"的文案

四项检查，前三项是**精确**的（有输出就是真遗漏，退出码 1）：

| 检查 | 说明 |
| --- | --- |
| `lang-en.js` 全部条目 | 游戏自带西→英表的每一条，取脚本对应语言的那一侧（1153 条） |
| 更新内容正文 | `js/data/changelog.js`（87 条） |
| 图鉴名字 | `js/data/pokedex.js`（966 个） |
| 运行时拼接句断言 | 游戏把片段拼成整句再显示（`'¡Un ' + name + ' se ha perdido!…'`），这里用示例名字还原整句再测（51 条） |

另外会打印"**疑似拼接文案候选**"的数量（游戏更新后可以过一眼），它**不影响退出码** —— 那些是源码里带 `+`/`${}` 的行，既有真文案也有 CSS/模板噪音，所以只做提醒。

判定标准：翻译结果里如果还剩实义拉丁词就算未译；`HP`、`Lv.`、`Pokémon`、`BOSS`、`Google` 这类刻意保留的（见 `audit.js` 里的 `KEEP` / `strip()`）不算。

**游戏更新后的用法**：先 `git pull` 更新游戏源码，跑一次 `audit.js`，把列出来的新条目加进英文版，再 `build-es.js` 生成西语版。

## build-es.js — 翻译只维护一份

西语词表不是重译出来的，而是**反查**出来的：`lang-en.js` 本身就是「西语原文 → 英文」的完整对照，而英文版里已经有对应的中文。

```
英文键 → 西语键        78 条（其中英文层合并的 7 组、需要引擎补译的 0 条）
语言无关/原样保留      167 条
只在英文模式出现的丢掉  166 条
保留的西语独有条目      182 条
更新内容重新挂键        87 条
```

三件事值得知道：

1. **一个英文键可能对应多个西语键**（`Guardar` / `Partida` 英文都是 `Save`），全部会生成；其中 4 条手工分开（→ 保存 / 存档 / 体力 / 超能力），见脚本里的 `OVERRIDE`。
2. 英文版里靠"**碎片替换**"凑出来的条目，会先用英文版的 `translate()` 算一遍再挂到西语键上。
3. **西语独有条目会被保留**：生成时会读一遍现有西语版，把"推导不出来"的条目（西语分支文案、管理员面板、西语月份等）原样带过来。所以你可以放心手工往西语版加条目，重跑不会丢。

引擎代码整段照抄英文版，只改 `forceLang` 和头部注释 —— 逻辑永远只有一份。

## lib.js — 公共库

在 Node 里把 userscript 跑起来（桩掉 `window` / `document` / `canvas` / `MutationObserver`，Node 21+ 的 `global.navigator` 是只读的所以用 `defineProperty`），并读取游戏里的语料（`lang-en.js`、`changelog.js`、`pokedex.js`）、解析 userscript 里的词表。

自己写小工具时可以复用：

```js
const L = require('./lib');
const GAME = L.gameDir();                       // 或 L.gameDir('D:/code/pokesurvivor')
const { zh, dict } = L.loadScript('pokesurvivor-zh-es.user.js', 'es');
const T = L.loadGameI18n(GAME, 'es');           // 游戏自己的西→英层（es 模式是空转）
console.log(zh(T('Derrota a 25 jefes')));       // → 击败 25 个 BOSS
```
