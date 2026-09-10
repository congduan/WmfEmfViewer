// EMF 差异对照工具（differential testing）
//
// 用项目自身的渲染器把 EMF 渲染成 SVG，再用外部参考实现渲染同一文件，
// 两者都光栅化成 PNG 后计算 RMSE 差异，从而定位渲染不一致的文件。
//
// 前置条件：
//   npm run build:bundle
//   参考实现转换器：通过环境变量 EMF2SVG 指定可执行文件路径
//   光栅化：rsvg-convert、magick（ImageMagick）
//
// 用法：node scripts/diff-emf.js <emf文件或目录> [输出目录]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

global.window = {};
require('../out/metafileParser.browser.js');
const MetafileParser = window.MetafileParser;
const EmfDrawer = window.EmfDrawer;
const EmfPlusDrawer = window.EmfPlusDrawer;
const WmfDrawer = window.WmfDrawer;
const SvgContext = require('../src/modules/svgContext.js');

const EMF2SVG = process.env.EMF2SVG || '/tmp/metafile_corpus/libemf2svg-master/build/emf2svg-conv'; // 外部参考实现转换器
const W = 800, H = 600;

// 关掉 drawers 的逐条日志
const noop = () => {};
const realLog = console.log;

function renderOurs(file) {
  const buffer = fs.readFileSync(file);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  console.log = noop;
  try {
    const parser = new MetafileParser(data);
    const result = parser.parse();
    if (result.error) return null;
    const ctx = new SvgContext();
    let drawer;
    if (parser.fileType === 'wmf' || parser.fileType === 'placeable-wmf') drawer = new WmfDrawer(ctx);
    else if (parser.fileType === 'emf') drawer = new EmfDrawer(ctx);
    else if (parser.fileType === 'emf+') drawer = new EmfPlusDrawer(ctx);
    else return null;
    drawer.draw(result, { viewWidth: W, viewHeight: H });
    return { svg: ctx.getSvg(), fileType: parser.fileType, records: result.records.length };
  } catch (e) {
    return { error: e.message };
  } finally {
    console.log = realLog;
  }
}

function rasterize(svgPath, pngPath) {
  try {
    execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-b', 'white', '-o', pngPath, svgPath],
      { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch (e) { return false; }
}

function compare(a, b) {
  try {
    const out = execFileSync('magick', ['compare', '-metric', 'RMSE', a, b, 'null:'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    const s = out.trim();
    const m = s.match(/([\d.]+)\s*\(([\d.eE+-]+)\)/);
    return m ? m[2] : (isFinite(parseFloat(s)) ? s : '0');
  } catch (e) {
    const s = (e.stderr || '') + (e.stdout || '');
    const m = s.match(/\(([\d.eE+-]+)\)/);
    return m ? m[1] : (s.match(/^[\d.eE+-]+/) ? s.match(/^[\d.eE+-]+/)[0] : '0');
  }
}

const input = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', 'out', 'emf-diff');
fs.mkdirSync(outDir, { recursive: true });

// 参考实现（libemf2svg）已知缺陷样本：其 ref 渲染本身错误（如整幅全黑/全白），
// 用它做基准会得出负面的假 RMSE。这些样本仍渲染/对比（便于人工复核），
// 但在汇总统计中排除，不拉低平均分。新增项须经人工目检确认 ref 确为缺陷。
const REF_DEFECTS = new Set([
  'test-065', // ref 输出整幅纯黑（矩形填充溢出），ours 的"方框+对角线"才是正确的
  'test-038', // ref 输出整幅空白（libUEMF 测试文件，ref 未渲染任何内容）；ours 能画出完整图形
]);

let files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter(f => /\.(emf|wmf)$/i.test(f)).map(f => path.join(input, f))
  : [input];

const results = [];
for (const f of files) {
  const base = path.basename(f, path.extname(f));
  const excluded = REF_DEFECTS.has(base);
  const oursSvg = path.join(outDir, base + '.ours.svg');
  const refSvg = path.join(outDir, base + '.ref.svg');
  const oursPng = path.join(outDir, base + '.ours.png');
  const refPng = path.join(outDir, base + '.ref.png');

  const ours = renderOurs(f);
  if (!ours || ours.error) { results.push({ base, rmse: 'N/A', note: 'ours-fail: ' + (ours && ours.error), excluded }); continue; }
  fs.writeFileSync(oursSvg, ours.svg);

  let refOk = true;
  try {
    execFileSync(EMF2SVG, ['-i', f, '-o', refSvg], { stdio: 'ignore', timeout: 30000 });
  } catch (e) { refOk = false; }
  if (!refOk || !fs.existsSync(refSvg)) { results.push({ base, rmse: 'N/A', note: 'ref-fail', excluded }); continue; }

  if (!rasterize(oursSvg, oursPng) || !rasterize(refSvg, refPng)) {
    results.push({ base, rmse: 'N/A', note: 'raster-fail', excluded }); continue;
  }
  const rmse = compare(oursPng, refPng);
  results.push({ base, rmse, note: ours.fileType + '/' + ours.records + 'rec' + (excluded ? ' [ref缺陷,排除]' : ''), excluded });
  // 保留中间 SVG 便于人工比对
}

results.sort((a, b) => {
  const na = parseFloat(a.rmse), nb = parseFloat(b.rmse);
  if (isNaN(na)) return 1;
  if (isNaN(nb)) return -1;
  return nb - na;
});

console.log('\n文件\tRMSE(0=完全一致)\t备注');
for (const r of results) console.log(`${r.base}\t${r.rmse}\t${r.note}`);

// 汇总统计（排除 ref 缺陷样本）
const valid = results.filter(r => !r.excluded && !isNaN(parseFloat(r.rmse))).map(r => parseFloat(r.rmse));
if (valid.length) {
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  const cnt = t => valid.filter(v => v > t).length;
  console.log('\n===== 汇总（排除 ref 缺陷样本 ' + results.filter(r => r.excluded).length + ' 个）=====');
  console.log(`有效样本: ${valid.length}`);
  console.log(`平均 RMSE: ${avg.toFixed(4)}`);
  console.log(`>0.3: ${cnt(0.3)}   >0.2: ${cnt(0.2)}   >0.1: ${cnt(0.1)}   >0.05: ${cnt(0.05)}`);
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
console.log('\n输出目录:', outDir);
