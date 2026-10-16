# PokéSurvivor 脚本

给 [PokéSurvivor](https://pokesurvivor.com)（[源码](https://github.com/JPTER78/pokesurvivor)）做的 userscript：

- **中文化**：把界面、提示、任务、道具说明、宝可梦名 / 招式名、局内 HUD 与「更新内容」翻成简体中文（离线词表，不联网）；
- **小地图**：在左上角画一块半透明小地图（地形、敌人 / Boss / 闪光、宝箱 / 祭坛 / 泉眼、裂缝、陷阱、队友）。**只读**，不写游戏数据。

| 文件 | 作用 | 联网 |
| :--- | :--- | :--- |
| `pokesurvivor-zh-es.user.js` | 中文化 · **西语原文**（推荐） | 不联网（离线词表） |
| `pokesurvivor-zh-en.user.js` | 中文化 · 游戏自带的英文 | 不联网（离线词表） |
| `pokesurvivor-minimap.user.js` | 局内小地图（只读） | 不联网 |

两份脚本可以**同时装**，互不干扰（小地图画在自己的 canvas 覆盖层上）。

---

## 中文化

把 [PokéSurvivor](https://pokesurvivor.com)（[源码](https://github.com/JPTER78/pokesurvivor)）的界面、提示、任务、道具说明、宝可梦名 / 招式名、局内 HUD 与「更新内容」翻译成简体中文的 userscript。**离线词表，不联网。**

游戏的原生语言是**西班牙语**，英文只是它自带的一层翻译（`js/data/lang-en.js`）。所以这里提供两份脚本，词表分别挂在两种语言上：

| 文件 | 源语言 | 词表 | 强制游戏语言 |
| --- | --- | --- | --- |
| `pokesurvivor-zh-es.user.js` | **西语原文**（推荐） | 2523 条 | `ps.lang=es` |
| `pokesurvivor-zh-en.user.js` | 游戏自带的英文 | 2564 条 | `ps.lang=en` |

**装西语那份。** 它按原文翻译（少一层中转），也不依赖作者英文层是否完整 —— 实测过 `lang-en.js` 里有不少漏项（`€12.00 / mes`、管理员面板、局内事件句子）和 7 处把西语区别抹平的合并（`Guardar` / `Partida` 在英文里都是 `Save`）。

### 安装

1. 装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）；
2. 新建脚本，把 `pokesurvivor-zh-es.user.js` 的内容贴进去保存（或直接拖进浏览器）；
3. 打开 https://pokesurvivor.com —— 界面与局内文字即为中文。

两份脚本都会写一次 `localStorage['ps.lang']` 来锁定游戏语言，这是必要的（否则中文浏览器下游戏默认走英文，词表就对不上了）。

### 目录

```
pokesurvivor-zh-es.user.js      西语源版（推荐）
pokesurvivor-zh-en.user.js      英语源版
pokesurvivor-minimap.user.js    小地图（只读）
tools/                          维护工具（只在改词表时用，游戏运行不需要 Node）
  audit.js                        一键审计：找出还没翻译的游戏文案
  build-es.js                     从英文版自动生成西语版（翻译只维护一份）
  lib.js                          公共库
```

### 维护流程

**改词表只改英文版**，然后：

```bash
node tools/build-es.js     # 从英文版重新生成西语版（会自动保留西语独有条目）
node tools/audit.js        # 两个版本一起体检
```

`build-es.js` 靠 `js/data/lang-en.js` 反推，所以新增条目不需要重译：

```
英文版   "Defeat 25 bosses."      : "击败 25 个 BOSS。"
对照     'Derrota a 25 jefes.'  →  'Defeat 25 bosses.'
西语版   "Derrota a 25 jefes."    : "击败 25 个 BOSS。"
```

也可以只体检一份：`node tools/audit.js --script pokesurvivor-zh-en.user.js`。
游戏更新后建议跑一次 `audit.js`（它会列出新出现、还没译的条目，以及"疑似拼接文案"候选）。

工具默认到 `../../../pokesurvivor` 找游戏源码，用 `--game <目录>` 可以指定别处。
更细的说明（输出怎么看、怎么加词条）见 [`tools/README.md`](tools/README.md)。

### 覆盖率

**游戏本体（DOM + canvas）已全覆盖**：`tools/audit.js` 的四项检查（`lang-en.js` 全部 1153 条、更新内容 87 条、图鉴 966 个名字、51 条运行时拼接句）都是 0 遗漏；全量源码字面量审计剩下的只有 CSS 类名、图标/音符数据、`console.*` 日志，以及"只在另一种语言模式下才会走的分支"。

刻意保留拉丁字母的只有品牌与专有名词：`HP`、`Lv.`、`Pokémon`、`BOSS`、`Google`、`Wi-Fi`、`iPhone`、`Firebase`、`Pixelify Sans` 等。

**已知未覆盖**（都不在游戏界面上）：

- 站点里的 11 个**静态内容页**（`guia/`、`pokedex/`、`movimientos/`、`objetos/`、`logros/`、`tipos/`、`shinies/`、`legendarios/`、`novedades/`、`apoyar/`、`contacto/`）。它们不加载游戏脚本、也不走 `lang-en.js`。由 `tools/make_seo_pages.py` 生成，要做得从那边系统提取文案。
- `index.html` 的 **SEO 文案**（`<meta name="description">`、`og:*`、JSON-LD）：只在分享链接 / 搜索引擎抓取时可见。脚本只改了 `<title>`。
- `console.*` 里的**调试日志**：不是界面文案，保持原样。
- 管理员面板里的**玩家昵称**：按设计跳过（`<b translate="no">`），避免把叫 `Time`、`Shadow` 的玩家名字译掉。

### 说明

- 词表与逻辑都是离线字典匹配：先整串精确匹配，再 `{x}` 模板，最后长句内嵌替换；命不中一律原样返回，**不改动未预期的文字**。
- 译名（宝可梦 / 招式 / 道具）以官方简体中文为准，西语异名也保留兜底。少数几处刻意保留的口语选择见 `docs/补漏报告.md` 的"建议但未改动"。
- 游戏代码自 2026-10-14 起是 PolyForm Noncommercial 许可；本项目只是对它做界面翻译，不含游戏资源。

---

## 小地图

`pokesurvivor-minimap.user.js` —— 在左上角（默认让开血条那一块）画一个半透明小地图，以你为中心。**纯只读**：不改游戏数据、不改游戏行为，也就不影响排名判定。

### 装法

和汉化一样：装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）→ 新建脚本贴进去保存 → 打开 https://pokesurvivor.com。
油猴脚本头里的 `@downloadURL` / `@updateURL` 指向本仓库 `master` 分支，装好后会自动跟更新。

### 操作

| 操作 | 作用 |
| :--- | :--- |
| `M` | 显示 / 隐藏 |
| `Alt` + 左键拖动 | 挪位置（松手记住） |
| `Alt` + 拖右下角 | 缩放，96–640px |
| 油猴菜单 → **小地图：设置面板…** | 开关、地形 / 物件点、大小（滑块或直接输数字）、范围、透明度、位置、恢复默认 |

设置存在 `GM_setValue`（没有 GM 权限时退回 `localStorage`），键名 `psmm.cfg.v1`。

### 图例

- **白色五角星** = 你（倒下变粉）；**彩色圆点** = 联机队友
- **小红点** = 敌人；**大金圆点（呼吸）** = Boss；**青点带圈** = 闪光（Shiny）
- **金色小方块** = 小宝箱；**金色大方块 + 锁孔 + 光晕** = 大宝箱
- **彩色菱形** = 祭坛（加成柱子，用过的画成空心）；**薄荷绿空心圈** = 泉眼
- **紫色圆点** = 裂缝（竞技场画一圈虚线）；**金色 / 紫色小点** = 掉落物 / 票
- **彩色叉号** = 陷阱（中毒紫 · 黏液绿 · 爆炸橙）
- Boss 和裂缝出了范围会**贴在小地图边框上指方向**

地形按「走没走过」记账：**亮色 = 能走**，蓝色 = 水 / 岩浆，**暗到发黑 = 过不去**（石墙、树、石头）；没探索过的地方是偏蓝的深灰，不会和黑墙看混。

### 怎么拿到游戏状态（只读）

发布版把整个游戏关在闭包里做了混淆（`index.html` + `js/app.min.js`），`window.G` 不存在、控制台也摸不到游戏对象。小地图只需要「看」，所以用了只读的办法：在 `Object.prototype` 上给 `G` 的属性名（`U`、`World`、`Game`、`EnemyMgr`……）装 setter，谁给对象赋这些属性，`this` 就是那个 `G`；认出 `G` 后 setter 立即自毁并把值原样写回对象自身的属性，游戏那边感觉不到区别（几十毫秒内其余陷阱全部撤掉）。抓不到就什么都不做 —— 不报错、不刷屏、不影响游戏。

### 已知边界

- 游戏更换压缩方式后可能抓不到 `G`，此时脚本静默不工作（游戏本身不受影响）；
- `@match` 只覆盖 `pokesurvivor.com` / `www.pokesurvivor.com` / `pokesurvivor.games`，要在本地 `localhost` 调试得自己加一行 `@match`；
- 显示与否跟游戏状态走：`G.Game.state` 是 `ui` / `over` 时自动隐藏（主菜单、结算界面不画）。
