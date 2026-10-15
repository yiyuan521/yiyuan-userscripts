<div align="center">

# yiyuan-userscripts

**很奇怪的脚本库 —— 但这里每个脚本都是能用的。**

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-required-00b0ff?style=flat-square)](https://www.tampermonkey.net/)
![made for fun](https://img.shields.io/badge/made%20for%20fun-%E2%9C%A8-ff69b4?style=flat-square)

</div>

---

## 脚本一览

| 脚本 | 作用 | 一键安装 |
| :--- | :--- | :---: |
| **PokéSurvivor 中文化**（西语源 · 推荐） | [PokéSurvivor](https://pokesurvivor.com) 的界面 / 任务 / 道具 / 招式 / 局内文字汉化。以游戏**原生西语**为源 | [**安装**](https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-zh-es.user.js) |
| **PokéSurvivor 中文化**（英语源） | 同上，但以游戏自带的**英文**文本为源（作者英文层比较完整时用） | [**安装**](https://raw.githubusercontent.com/yiyuan521/yiyuan-userscripts/master/pokesurvivor/pokesurvivor-zh-en.user.js) |

> 点「安装」会直接打开 Tampermonkey 的安装页。还没装扩展的话，先装
> [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
> 词表是**离线**的，脚本不联网、不发任何请求。
> **如果一键安装失败，请复制对应脚本代码，手动进行添加。**

---

## PokéSurvivor 中文化

把一个宝可梦同人生存游戏（[JPTER78/pokesurvivor](https://github.com/JPTER78/pokesurvivor)，966 只宝可梦 · 9 个世代 · 支持 4 人联机）整个翻成简体中文：菜单、任务、成就、道具说明、招式名与描述、人格测试、更新日志、局内 HUD 与提示、排行榜文案、确认弹窗……**游戏本体（DOM + canvas）已 100% 覆盖**。

### 为什么有两个版本

游戏的原生语言是**西班牙语**，英文只是它自带的一层翻译（`js/data/lang-en.js`）。所以：

- **西语源**（推荐）：按原文翻译，少一层中转，也不依赖作者英文层是否完整 —— 实测 `lang-en.js` 里有漏项（`€12.00 / mes`、管理员面板、部分局内事件句子），还有 7 处把西语区别抹平的合并（`Guardar` 和 `Partida` 在英文里都是 `Save`，中文因此分成「保存 / 存档」）。
- **英语源**：保留给想对照英文的场合。两份词表内容等价（西语源 2523 条 / 英语源 2564 条），引擎代码完全相同。

### 已知未覆盖

都不在游戏界面上，所以不影响游玩：

- 站点的 **11 个静态内容页**（指南、图鉴、招式表、道具表、成就、属性、异色、传说、更新、支持、联系）——它们不加载游戏脚本，由游戏仓库的 `tools/make_seo_pages.py` 生成；
- `index.html` 的 **SEO 文案**（`<meta description>`、`og:*`、JSON-LD），只在分享链接和搜索引擎抓取时可见；
- 管理员面板里的**玩家昵称**：按设计跳过，免得把叫 `Time`、`Shadow` 的玩家名字也给译了。

刻意保留拉丁字母的只有 `HP`、`Lv.`、`Pokémon`、`BOSS`、`Google`、`Wi-Fi` 这类品牌与缩写。

### 漏翻了 / 译错了？

欢迎开 [Issue](https://github.com/yiyuan521/yiyuan-userscripts/issues)，附上**截图**和**那句话**，再标一下用的是哪一份脚本就行。宝可梦、招式、道具名一律以官方简体中文为准；如果某处你更习惯别的叫法（比如道具 `Leftovers` 要「剩饭」还是「吃剩的东西」），也直接说。


---

## 目录结构

```
yiyuan-userscripts/
└── pokesurvivor/
    ├── README.md                      项目说明：装哪个、覆盖率、已知边界
    ├── pokesurvivor-zh-es.user.js     西语源（推荐）
    ├── pokesurvivor-zh-en.user.js     英语源
    └── tools/                         维护工具（玩游戏不需要 Node）
        ├── README.md
        ├── audit.js                     一键审计：找出还没翻译的游戏文案
        ├── build-es.js                  从英文版自动生成西语版
        └── lib.js                       公共库
```

---

## 计划

- [x] PokéSurvivor 汉化：西语源 + 英语源，游戏本体全覆盖
- [ ] 更多脚本？（欢迎来点单）

---

## 许可与致谢

- 游戏本体：[JPTER78/pokesurvivor](https://github.com/JPTER78/pokesurvivor)，代码自 2026-10-14 起为 PolyForm Noncommercial 1.0.0。
- 精灵图：[PMD SpriteCollab](https://sprites.pmdcollab.org/)（CC BY-NC 4.0）。
- Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.；本项目与上述公司无关联，只是爱好者做的汉化，不含任何游戏资源，也不用于盈利。
- 本仓库里的脚本可以随意使用、修改、分发；如果能注明出处就更好。
