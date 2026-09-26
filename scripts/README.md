# scripts/

本目录混放了两类脚本，用途与可靠性完全不同，请勿混用。

## 1. 构建/维护脚本（CI 依赖，必须可用）

| 脚本 | 入口 | 说明 |
|---|---|---|
| `build-bundles.js` | `npm run build:bundle` / `build:lib` | **唯一的构建脚本**（esbuild）：产出浏览器 IIFE bundle 与 npm 包 CommonJS 产物 |
| `clean.js` | `npm run clean` / `clean:render` | 清理 `out/`（全清或只清本地渲染产物） |
| `install.sh` | — | 环境准备辅助脚本 |

改动这三个脚本时务必跑一遍 `npm test` 与 `npm run test:lib`。

## 2. 一次性调试/分析脚本（不保证可用）

其余文件（`analyze-*`、`dbg-*`、`debug-*`、`dump-*`、`scan-*`、`diff-emf.js`、
`make-compare-html.js`、`make-docx.js`、`regress-render.js`、`render-one.js`、
`svg-feasibility.js`、`validate-corpus.js`、`count-ep.js`）是渲染调优过程中写下的
临时工具：

- **不在任何 CI / npm script 中**，不会随发布产物分发；
- 多数依赖本机才有的目录：`out/<批次名>/` 渲染产物、`test_files/emf-corpus/`
  等被 gitignore 的大语料——干净 checkout 上通常会直接失败；
- 使用 `__dirname` 拼 `..` 指向仓库根（`../out`、`../test_files`），因此**移动这些
  文件必须同步修正路径**；
- 其中 `analyze-wmf.js` 的 require 路径本就指向不存在的 `./src/...`，移动/修复前
  请勿依赖它。

新增临时脚本时请沿用现有命名前缀（`dbg-` / `scan-` / `dump-`），便于与第 1 类区分。
