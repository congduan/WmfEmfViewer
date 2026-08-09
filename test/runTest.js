#!/usr/bin/env node

// WMF/EMF/EMF+ 冒烟测试
// 通过加载浏览器 bundle（out/metafileParser.browser.js），
// 对实际样例文件执行「解析 -> 绘制到 SvgContext -> 序列化 SVG」全流程，
// 验证解析器与绘制器不会抛错且能产出 SVG。
// 运行前需先执行 npm run build:bundle。

const fs = require('fs');
const path = require('path');

// 模拟浏览器环境加载打包产物
global.window = {};
require('../out/metafileParser.browser.js');
const MetafileParser = window.MetafileParser;
const SvgContext = window.SvgContext;
const WmfDrawer = window.WmfDrawer;
const EmfDrawer = window.EmfDrawer;
const EmfPlusDrawer = window.EmfPlusDrawer;

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`✓ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function createDrawer(fileType, ctx) {
  if (fileType === 'wmf' || fileType === 'placeable-wmf') return new WmfDrawer(ctx);
  if (fileType === 'emf') return new EmfDrawer(ctx);
  if (fileType === 'emf+') return new EmfPlusDrawer(ctx);
  return null;
}

// 对单个文件执行 解析 + 渲染 冒烟测试
function smokeTest(fileName, expectedType, minRecords) {
  const filePath = path.join(__dirname, '..', 'test_files', fileName);
  if (!fs.existsSync(filePath)) {
    check(`文件存在: ${fileName}`, false, '文件不存在');
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // 解析
  const parser = new MetafileParser(data);
  const result = parser.parse();
  check(`${fileName} 文件类型检测`, parser.fileType === expectedType,
    `期望 ${expectedType}, 实际 ${parser.fileType}`);
  check(`${fileName} 头部解析`, !!result.header, result.error || '');
  check(`${fileName} 记录数 >= ${minRecords}`, result.records.length >= minRecords,
    `实际 ${result.records.length}`);
  check(`${fileName} 解析无错误`, !result.error, result.error || '');

  // 渲染到 SVG
  if (!result.error && result.records.length > 0) {
    try {
      const svgCtx = new SvgContext();
      const drawer = createDrawer(parser.fileType, svgCtx);
      check(`${fileName} 找到绘制器`, !!drawer, parser.fileType);
      if (drawer) {
        drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
        const svg = svgCtx.getSvg();
        check(`${fileName} SVG 生成`, svg.includes('<svg') && svg.length > 200,
          `${svg.length} 字节, ${svgCtx._nodes.length} 个元素`);
      }
    } catch (error) {
      check(`${fileName} 渲染不抛错`, false, error.message);
    }
  }
}

console.log('='.repeat(70));
console.log('WMF/EMF/EMF+ 冒烟测试');
console.log('='.repeat(70));

// 1. 基础环境检查
check('浏览器 bundle 已构建', !!MetafileParser, '需先 npm run build:bundle');
check('SvgContext 存在', !!SvgContext);
check('WmfDrawer 存在', !!WmfDrawer);
check('EmfDrawer 存在', !!EmfDrawer);

// 2. 格式冒烟测试
smokeTest('sample.wmf', 'placeable-wmf', 200);
smokeTest('media/image1.wmf', 'placeable-wmf', 5);
smokeTest('example.emf', 'emf', 100);

console.log('\n' + '='.repeat(70));
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(70));

process.exit(failed > 0 ? 1 : 0);
