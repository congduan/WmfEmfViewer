// SVG 渲染 CLI 验证工具
// 思路：将 SvgContext（模拟 Canvas 2D API 子集，位于 src/modules/svgContext.js）
// 传给现有 WmfDrawer/EmfDrawer/EmfPlusDrawer，把绘制指令直接转为 SVG。
// 与 webview.html 中 PdfContext 的做法一致。
//
// 用法：node scripts/svg-feasibility.js [文件路径] [输出路径]
// 默认：test_files/sample.wmf -> out/svg-feasibility/sample.wmf.svg
// 注意：需先 npm run build:bundle 生成 out/metafileParser.browser.js

const fs = require('fs');
const path = require('path');

// 源模块之间的相对 require 路径不完整，无法在 Node 中直接引用解析器/绘制器；
// 因此像浏览器一样加载打包产物 out/metafileParser.browser.js。
// SvgContext 无内部依赖，可直接 require。
global.window = {};
require('../out/metafileParser.browser.js');
const MetafileParser = window.MetafileParser;
const WmfDrawer = window.WmfDrawer;
const EmfDrawer = window.EmfDrawer;
const EmfPlusDrawer = window.EmfPlusDrawer;
const SvgContext = require('../src/modules/svgContext.js');

// ---------------------------------------------------------------------------
// 主流程：解析 -> 绘制到 SvgContext -> 写出 SVG
// ---------------------------------------------------------------------------
function run(inputFile, outputFile) {
  const buffer = fs.readFileSync(inputFile);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const parser = new MetafileParser(data);
  const result = parser.parse();
  if (result.error) {
    console.error('解析失败:', result.error);
    process.exit(1);
  }

  const ctx = new SvgContext();
  let drawer;
  if (parser.fileType === 'wmf' || parser.fileType === 'placeable-wmf') {
    drawer = new WmfDrawer(ctx);
  } else if (parser.fileType === 'emf') {
    drawer = new EmfDrawer(ctx);
  } else if (parser.fileType === 'emf+') {
    drawer = new EmfPlusDrawer(ctx);
  } else {
    console.error('未知文件类型:', parser.fileType);
    process.exit(1);
  }

  drawer.draw(result, { viewWidth: 1200, viewHeight: 900 });

  const svg = ctx.getSvg();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, svg, 'utf8');

  console.log('文件类型:', parser.fileType);
  console.log('记录数:', result.records.length);
  console.log('SVG 尺寸:', ctx.canvas.width, 'x', ctx.canvas.height);
  console.log('SVG 元素数:', ctx._nodes.length, '(clipPath:', ctx._clipCount + ')');
  console.log('SVG 文件大小:', (svg.length / 1024).toFixed(2), 'KB');
  console.log('输出:', outputFile);
}

const inputFile = process.argv[2] || path.join(__dirname, '..', 'test_files', 'sample.wmf');
const baseName = path.basename(inputFile) + '.svg';
const outputFile = process.argv[3] || path.join(__dirname, '..', 'out', 'svg-feasibility', baseName);
run(inputFile, outputFile);
