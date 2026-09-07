// 渲染回归脚本：对指定语料目录逐文件 parse+draw 生成 SVG，统计成败
const fs = require('fs');
global.window = {};
require('../out/metafileParser.browser.js');
const P = window.MetafileParser, E = window.EmfDrawer, EP = window.EmfPlusDrawer, W = window.WmfDrawer;
const SvgContext = require('../src/modules/svgContext.js');

const dirs = process.argv.slice(2).length ? process.argv.slice(2)
  : ['test_files/ref-emf-corpus/emf-ea', 'test_files/lo-wmf-corpus', 'test_files/sample-wmf'];
const realErr = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};

for (const d of dirs) {
  let ok = 0, fail = 0; const errs = [];
  for (const f of fs.readdirSync(d)) {
    if (!/\.(emf|wmf)$/i.test(f)) continue;
    try {
      const buf = fs.readFileSync(d + '/' + f);
      const p = new P(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      const r = p.parse();
      const ctx = new SvgContext();
      const dr = p.fileType === 'emf' ? new E(ctx) : p.fileType === 'emf+' ? new EP(ctx) : new W(ctx);
      dr.draw(r, { viewWidth: 800, viewHeight: 600 });
      const svg = ctx.getSvg();
      if (!svg || svg.length < 100) throw new Error('tiny svg');
      ok++;
    } catch (e) { fail++; errs.push(f + ': ' + e.message.slice(0, 70)); }
  }
  realErr(d, 'ok=' + ok, 'fail=' + fail);
  errs.slice(0, 4).forEach(x => realErr('  ' + x));
}
