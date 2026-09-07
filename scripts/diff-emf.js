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
    return out.trim();
  } catch (e) {
    const s = (e.stderr || '') + (e.stdout || '');
    const m = s.match(/\(([\d.eE+-]+)\)/);
    return m ? m[1] : 'ERR';
  }
}

const input = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', 'out', 'emf-diff');
fs.mkdirSync(outDir, { recursive: true });

let files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter(f => /\.(emf|wmf)$/i.test(f)).map(f => path.join(input, f))
  : [input];

const results = [];
for (const f of files) {
  const base = path.basename(f, path.extname(f));
  const oursSvg = path.join(outDir, base + '.ours.svg');
  const refSvg = path.join(outDir, base + '.ref.svg');
  const oursPng = path.join(outDir, base + '.ours.png');
  const refPng = path.join(outDir, base + '.ref.png');

  const ours = renderOurs(f);
  if (!ours || ours.error) { results.push({ base, rmse: 'N/A', note: 'ours-fail: ' + (ours && ours.error) }); continue; }
  fs.writeFileSync(oursSvg, ours.svg);

  let refOk = true;
  try {
    execFileSync(EMF2SVG, ['-i', f, '-o', refSvg], { stdio: 'ignore', timeout: 30000 });
  } catch (e) { refOk = false; }
  if (!refOk || !fs.existsSync(refSvg)) { results.push({ base, rmse: 'N/A', note: 'ref-fail' }); continue; }

  if (!rasterize(oursSvg, oursPng) || !rasterize(refSvg, refPng)) {
    results.push({ base, rmse: 'N/A', note: 'raster-fail' }); continue;
  }
  const rmse = compare(oursPng, refPng);
  results.push({ base, rmse, note: ours.fileType + '/' + ours.records + 'rec' });
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
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
console.log('\n输出目录:', outDir);
