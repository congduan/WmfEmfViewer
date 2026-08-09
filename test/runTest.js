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

// ---- 合成包含多个 MathType 公式的 WMF ----
// MathType 公式以 AppsMFCC/MTEF 注释块（META_ESCAPE/MFCOMMENT 0x000F）嵌入 WMF，
// 每个公式对应一个注释块 + 一组按 MTEF 字符流编码的 META_TEXTOUT 记录。
// 用例：公式 1（Symbol 'a'->α + 正文 'b'），公式 2（Symbol 'G'->Γ + 正文 'd'）
function u16(v) {
  return [v & 0xFF, (v >> 8) & 0xFF];
}
function u32(v) {
  return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
}
function i16(v) {
  return u16(v < 0 ? v + 0x10000 : v);
}

// 构造 MTEF 字节（真实 MathType 5/6 格式）：
// 头部 = version+platform+product+productVersion+productSubVersion + applicationKey("DSMT6\0") + inline(1)
// CHAR = type(2) + options(0) + typeface(6=Symbol / 1=Text) + MTCode(1)
function buildMtef(chars) {
  const bytes = [5, 1, 0, 6, 8];
  'DSMT6\0'.split('').forEach(c => bytes.push(c.charCodeAt(0)));
  bytes.push(1); // inline
  for (const c of chars) {
    bytes.push(0x02); // CHAR record
    bytes.push(0x00); // options（无 nudge、单字节 MTCode）
    bytes.push(c.symbol ? 6 : 1); // typeface: 6=Symbol, 1=Text
    bytes.push(c.code & 0xFF); // MTCode（1 字节）
  }
  bytes.push(0x00); // END record
  return bytes;
}

// 构造 AppsMFCC 注释块：AppsMFCC + version(2) + totalLen(4) + dataLen(4) + "MTEF5\0" + MTEF 数据
function buildAppsMfcc(mtefBytes) {
  const head = [];
  'AppsMFCC'.split('').forEach(c => head.push(c.charCodeAt(0)));
  head.push(...u16(0x0003));          // version
  head.push(...u32(mtefBytes.length + 6)); // totalLen
  head.push(...u32(mtefBytes.length));     // dataLen
  'MTEF5\0'.split('').forEach(c => head.push(c.charCodeAt(0)));
  return head.concat(mtefBytes);
}

// META_ESCAPE 记录 data：escapeFunction(2) + byteCount(2) + commentData
function buildMathTypeEscape(commentData) {
  return u16(0x000F).concat(u16(commentData.length), commentData);
}

// META_TEXTOUT 记录 data：textLength(2) + text + y(2) + x(2)
function buildTextOut(text) {
  const t = text.split('').map(c => c.charCodeAt(0));
  return u16(t.length).concat(t, i16(50), i16(50));
}

// 封装 WMF 记录：Size(DWORD, words) + Function(WORD) + data
function buildWmfRecord(funcId, dataBytes) {
  while (dataBytes.length % 2 !== 0) dataBytes.push(0);
  return u32(3 + dataBytes.length / 2).concat(u16(funcId), dataBytes);
}

// 构建含 2 个 MathType 公式的标准 WMF。
// 与真实 MathType 一致：Symbol 字符用 Symbol 字体绘制、正文用 Times 字体绘制，
// 每个公式 = AppsMFCC 注释块 + 各字符的（选字体 + TEXTOUT）记录。
function buildMathTypeWmf() {
  const header = u16(0x0001).concat(u16(0x0009), u16(0x0300), u32(0), u16(0), u32(0), u16(0));

  // CREATEFONTINDIRECT：height=20，faceName="Symbol"（对象 0）/ "Times New Roman"（对象 1）
  function makeFont(name) {
    const d = i16(20).concat(u16(0), u16(0), u16(0), u16(400), [0, 0, 0, 2, 0, 0, 0, 0]);
    (name + '\0').split('').forEach(c => d.push(c.charCodeAt(0)));
    return d;
  }

  // 公式记录：选字体 + 逐字符 TEXTOUT
  function equationRecords(mtefChars) {
    const recs = [buildWmfRecord(0x0626, buildMathTypeEscape(buildAppsMfcc(buildMtef(mtefChars))))];
    for (const c of mtefChars) {
      recs.push(buildWmfRecord(0x012D, u16(c.symbol ? 0 : 1))); // SELECTOBJECT：0=Symbol, 1=Times
      recs.push(buildWmfRecord(0x0521, buildTextOut(String.fromCharCode(c.code))));
    }
    return recs;
  }

  const records = [
    buildWmfRecord(0x020B, i16(0).concat(i16(0))),     // SETWINDOWORG: y, x
    buildWmfRecord(0x020C, i16(100).concat(i16(500))), // SETWINDOWEXT: y=100, x=500
    buildWmfRecord(0x02FB, makeFont('Symbol')),        // CREATEFONTINDIRECT 0: Symbol
    buildWmfRecord(0x02FB, makeFont('Times New Roman')), // CREATEFONTINDIRECT 1: Times
    ...equationRecords([
      { symbol: true, code: 0x61 },  // 'a' -> 'α'
      { symbol: false, code: 0x62 }, // 'b'
    ]),
    ...equationRecords([
      { symbol: true, code: 0x47 },  // 'G' -> 'Γ'
      { symbol: false, code: 0x64 }, // 'd'
    ]),
    buildWmfRecord(0x0000, []),                          // EOF
  ];

  const bytes = header.concat(...records);
  const sizeWords = bytes.length / 2;
  bytes[6] = sizeWords & 0xFF;
  bytes[7] = (sizeWords >> 8) & 0xFF;
  return new Uint8Array(bytes);
}

// MathType 多公式测试：验证 bundle 修复（无崩溃）+ 多 MTEF 流按序映射
function mathTypeTest() {
  check('MathTypeMtefParser 已打入 bundle', !!window.MathTypeMtefParser,
    '缺少则 webview 渲染 MathType WMF 会 ReferenceError');

  const wmfBytes = buildMathTypeWmf();
  const parser = new MetafileParser(wmfBytes);
  const result = parser.parse();
  check('MathType WMF 文件类型检测', parser.fileType === 'wmf', parser.fileType);
  check('MathType WMF 解析无错误', !result.error, result.error || '');
  check('MathType WMF 记录数', result.records.length >= 9, `实际 ${result.records.length}`);

  if (!result.error) {
    try {
      const svgCtx = new SvgContext();
      const drawer = new WmfDrawer(svgCtx);
      drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
      const svg = svgCtx.getSvg();
      const textNodes = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || []).join(' | ');
      check('MathType 公式 1 渲染 α', svg.includes('>α<'), textNodes);
      check('MathType 公式 1 渲染 b', svg.includes('>b<'), textNodes);
      check('MathType 公式 2 渲染 Γ', svg.includes('>Γ<'), textNodes);
      check('MathType 公式 2 渲染 d', svg.includes('>d<'), textNodes);
      check('MathType 未出现未映射的原始文本', !svg.includes('>ab<') && !svg.includes('>Gd<'), textNodes);
    } catch (error) {
      check('MathType WMF 渲染不抛错', false, error.message);
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

// 3. MathType 多公式测试
mathTypeTest();

// 4. 真实 MathType WMF 测试（下载自 mathtype_wmf_appsmfcc_extractor 示例）
function realMathTypeTest() {
  const filePath = path.join(__dirname, '..', 'test_files', 'mathtype', 'example.wmf');
  if (!fs.existsSync(filePath)) {
    check('真实 MathType 示例文件存在', false, 'test_files/mathtype/example.wmf 缺失');
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new MetafileParser(data);
  const result = parser.parse();
  check('真实 MathType WMF 解析无错误', !result.error, result.error || '');
  check('真实 MathType WMF 文件类型', parser.fileType === 'placeable-wmf', parser.fileType);
  if (result.error) return;

  try {
    const svgCtx = new SvgContext();
    const drawer = new WmfDrawer(svgCtx);
    drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
    check('真实 MathType WMF 渲染不抛错', true);
    check('真实 MathType WMF 识别为 MathType', drawer.isMathType === true);
    check('真实 MathType WMF 提取到 MTEF 流', drawer.mathTypeMtefStreams.length > 0,
      `流数 ${drawer.mathTypeMtefStreams.length}`);
    const stream = drawer.mathTypeMtefStreams[0] || [];
    check('真实 MathType MTEF 流含字符', stream.length > 0,
      `字符数 ${stream.length}`);
    const svg = svgCtx.getSvg();
    check('真实 MathType SVG 生成', svg.includes('<svg') && svg.length > 200,
      `${svg.length} 字节`);
  } catch (error) {
    check('真实 MathType WMF 渲染不抛错', false, error.message);
  }
}
realMathTypeTest();

// 5. 回归测试：image213.wmf（MathType 6 混排旧式 "MathType" 注释 + AppsMFCC）
// 回归背景：MTEF 流曾错误替换 WMF 文本，导致对数表渲染成 "g2\".8451"。
function image213Test() {
  const filePath = path.join(__dirname, '..', 'test_files', 'media', 'image213.wmf');
  if (!fs.existsSync(filePath)) {
    check('image213.wmf 存在', false, '文件缺失');
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new MetafileParser(data);
  const result = parser.parse();
  check('image213.wmf 解析无错误', !result.error, result.error || '');
  check('image213.wmf 文件类型', parser.fileType === 'placeable-wmf', parser.fileType);
  if (result.error) return;

  try {
    const svgCtx = new SvgContext();
    const drawer = new WmfDrawer(svgCtx);
    drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
    const svg = svgCtx.getSvg();
    const texts = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || [])
      .map(t => { const m = />([^<]*)</.exec(t); return m ? m[1] : ''; })
      .join('');
    check('image213.wmf 渲染不抛错', true);
    check('image213.wmf 文本未被 MTEF 流替换', texts.includes('log20.3010'),
      `文本: ${texts.slice(0, 80)}`);
    check('image213.wmf 对数表完整', texts.includes('log30.4771') &&
      texts.includes('log50.6990') && texts.includes('log70.8451'),
      `文本: ${texts.slice(0, 80)}`);
    // 不应残留 Latin-1 乱码（如 æ ç ò ö）或 MTEF 替换产生的非法字符
    const mojibake = texts.match(/[æçèéêëìíîïòóôõöùúûüåø]/g) || [];
    check('image213.wmf 无 Latin-1 乱码', mojibake.length === 0, `乱码: ${mojibake.join('')}`);
    check('image213.wmf SVG 生成', svg.includes('<svg') && svg.length > 200,
      `${svg.length} 字节`);
  } catch (error) {
    check('image213.wmf 渲染不抛错', false, error.message);
  }
}
image213Test();

console.log('\n' + '='.repeat(70));
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(70));

process.exit(failed > 0 ? 1 : 0);
