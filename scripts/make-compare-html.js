// 生成静态 HTML 对比页：把 diff-emf.js / 渲染对照产出的图片按样本并排展示，方便人工比对。
//
// 扫描 <diffDir> 下形如 <base>.ours.png|svg + <base>.ref.png|svg 的文件组（flat 布局），
// 读取同目录 report.json（可选，提供 RMSE 与备注），输出自包含 HTML。
// 页面使用相对路径引用图片，HTML 建议就放在 <diffDir> 内，浏览器直接打开即可显示。
//
// 用法：
//   node scripts/make-compare-html.js <diffDir> [--out <htmlPath>] [--title <t>] [--src <源文件相对路径>]
// 示例：
//   node scripts/make-compare-html.js out/emf-diff-valid \
//     --title "EMF 渲染对比(186) 本项目 vs LibreOffice" \
//     --src ../../test_files/ref-emf-corpus/emf-valid
//
// 约定（与 scripts/diff-emf.js 一致）：ours=本项目渲染，ref=参考实现渲染；
// 参考光栅化均为同尺寸(800x600)白底 PNG，几何可对齐 → 页面提供 并排/滑块/叠差 三种视图。
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { diffDir: argv[0], out: null, title: null, src: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--title') a.title = argv[++i];
    else if (argv[i] === '--src') a.src = argv[++i];
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.diffDir) {
  console.error('用法: node scripts/make-compare-html.js <diffDir> [--out <htmlPath>] [--title <t>] [--src <relSrcDir>]');
  process.exit(1);
}
const diffDir = path.resolve(args.diffDir);

// ---- 收集样本 ----
const files = fs.readdirSync(diffDir);
const baseSet = new Set();
for (const f of files) {
  const m = f.match(/^(.+?)\.(ours|ref)\.(png|svg)$/);
  if (m) baseSet.add(m[1]);
}
const bases = [...baseSet].sort();

function pick(b, side) {
  for (const ext of ['png', 'svg']) if (fs.existsSync(path.join(diffDir, `${b}.${side}.${ext}`))) return `${b}.${side}.${ext}`;
  return null;
}
// PNG 为光栅基准(800x600 几何对齐)；只有双 PNG 齐全才允许 滑块/叠差 视图
function hasPng(b) {
  return fs.existsSync(path.join(diffDir, `${b}.ours.png`)) && fs.existsSync(path.join(diffDir, `${b}.ref.png`));
}

// ---- report.json（可选）----
const reportPath = path.join(diffDir, 'report.json');
let report = {};
let reportMtime = null;
if (fs.existsSync(reportPath)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(reportPath, 'utf8'))) report[r.base] = r;
    reportMtime = fs.statSync(reportPath).mtime;
  } catch (e) { console.warn('report.json 解析失败:', e.message); }
}

// ---- 源文件链接（--src 提供语料目录，相对 HTML 文件所在 diffDir）----
function srcHref(base) {
  if (!args.src) return null;
  for (const ext of ['.emf', '.wmf']) {
    const p = path.join(diffDir, args.src, base + ext);
    if (fs.existsSync(p)) return path.posix.join(args.src, base + ext).split(path.sep).join('/');
  }
  return null;
}

const SRC_EXTS = ['.emf', '.wmf'];

// ---- 汇总统计 ----
const num = x => (typeof x === 'string' && x !== 'N/A' && isFinite(parseFloat(x))) ? parseFloat(x) : NaN;
const entries = bases.map(b => {
  const r = report[b] || {};
  const rmse = num(r.rmse);
  const failed = !isFinite(rmse);
  const ours = pick(b, 'ours');
  const ref = pick(b, 'ref');
  const src = srcHref(b);
  return {
    base: b,
    rmse: failed ? null : rmse,
    note: r.note || '',
    failed: failed || !ours || !ref,
    failNote: failed ? (r.note || '渲染失败') : '',
    ours, ref, src,
    exact: hasPng(b),
  };
}).filter(e => e.ours && e.ref);

const rmses = entries.map(e => e.rmse).filter(x => x != null);
const stat = {
  total: entries.length,
  failed: entries.filter(e => e.failed).length,
  avgRmse: rmses.length ? rmses.reduce((a, b) => a + b, 0) / rmses.length : null,
  maxRmse: rmses.length ? Math.max(...rmses) : null,
  generatedAt: reportMtime ? reportMtime.toISOString() : new Date().toISOString(),
};

const title = args.title || `渲染对比 ${stat.total} 样本 — 本项目 vs 参考实现`;

// ---- 组装页面 ----
const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root{
    --bg:#0e1116; --panel:#151a22; --panel2:#1b2230; --line:#262e3d;
    --tx:#d7dde8; --tx2:#8b95a7; --accent:#4d9fff;
    --red:#e5484d; --orange:#f76808; --yellow:#ffb224; --green:#46a758; --gray:#8a8f98;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    background:var(--bg);color:var(--tx)}
  /* ---- 顶栏 ---- */
  header{position:sticky;top:0;z-index:20;background:rgba(14,17,22,.92);backdrop-filter:blur(8px);
    border-bottom:1px solid var(--line);padding:10px 16px}
  .hd-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px}
  h1{font-size:16px;margin:0;font-weight:600}
  .stat{color:var(--tx2);font-size:12px}
  .stat b{color:var(--tx)}
  .bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:10px}
  .grp{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2)}
  .grp input[type=search]{background:var(--panel2);border:1px solid var(--line);color:var(--tx);
    border-radius:6px;padding:4px 8px;font-size:12px;width:190px;outline:none}
  .grp input[type=search]:focus{border-color:var(--accent)}
  .grp input[type=range]{width:150px;accent-color:var(--accent)}
  .grp select{background:var(--panel2);border:1px solid var(--line);color:var(--tx);
    border-radius:6px;padding:3px 6px;font-size:12px;outline:none}
  .seg{display:flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
  .seg button{background:transparent;border:0;color:var(--tx2);padding:4px 10px;font-size:12px;cursor:pointer}
  .seg button.on{background:var(--accent);color:#fff}
  .count-hint{font-size:12px;color:var(--tx2);margin-left:auto}
  /* ---- 卡片 ---- */
  main{padding:16px;display:flex;flex-direction:column;gap:16px;max-width:1500px;margin:0 auto}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .card.failed{outline:1px solid var(--red)}
  .c-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);
    font-size:13px;flex-wrap:wrap}
  .badge{display:inline-block;min-width:52px;text-align:center;padding:2px 7px;border-radius:5px;
    color:#fff;font-size:12px;font-weight:600;cursor:help}
  .b-red{background:var(--red)}.b-orange{background:var(--orange)}
  .b-yellow{background:var(--yellow);color:#111}.b-green{background:var(--green)}.b-gray{background:var(--gray)}
  .c-name{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
  .c-note{color:var(--tx2);font-size:11px}
  .c-head a{color:var(--tx2);font-size:11px;text-decoration:none;border-bottom:1px dotted var(--line)}
  .c-head a:hover{color:var(--accent)}
  .act{margin-left:auto;display:flex;gap:6px}
  .act button{background:var(--panel2);border:1px solid var(--line);color:var(--tx2);border-radius:6px;
    font-size:11px;padding:2px 8px;cursor:pointer}
  .act button:hover{color:var(--accent);border-color:var(--accent)}
  /* ---- 三种视图容器 ---- */
  .cmp{position:relative;background:#000;aspect-ratio:4/3;overflow:hidden}
  .cmp img{display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain;cursor:zoom-in}
  /* 并排 */
  .side{position:absolute;inset:0;display:flex;width:100%}
  .side .half{flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-width:0}
  .side .half + .half{border-left:2px solid rgba(255,255,255,.25)}
  .side .half img{width:100%;height:100%}
  .side .tag{position:absolute;top:6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);
    padding:1px 8px;border-radius:4px;pointer-events:none}
  .side .tag.ours{left:8px}.side .tag.ref{right:8px}
  /* 滑块 */
  .slide{position:absolute;inset:0;display:none}
  .slide .lay{position:absolute;inset:0}
  .slide .lay img{width:100%;height:100%;object-fit:contain}
  .slide .top{clip-path:var(--cp,'inset(0 50% 0 0)')}        /* 裁剪值由滑块 JS 写入 --cp */
  .slide input[type=range]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
  .slide .divider{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.85);
    box-shadow:0 0 4px rgba(0,0,0,.6);pointer-events:none;left:var(--x,50%)}
  .slide .lbl{position:absolute;top:6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);
    padding:1px 8px;border-radius:4px;pointer-events:none}
  /* 叠差 (ref 以 difference 叠加在 ours 上，白=相同) */
  .blend{position:absolute;inset:0;display:none}
  .blend .lay{position:absolute;inset:0}
  .blend .lay img{width:100%;height:100%;object-fit:contain}
  .blend .up{mix-blend-mode:difference}
  .blend .tag{position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:11px;color:#fff;
    background:rgba(0,0,0,.55);padding:1px 8px;border-radius:4px;pointer-events:none}
  body[data-view=side] .cmp .slide,body[data-view=side] .cmp .blend{display:none}
  body[data-view=slide] .cmp .side,body[data-view=slide] .cmp .blend{display:none}
  body[data-view=slide] .cmp .slide{display:block}
  body[data-view=slide] .cmp .slide .top{clip-path:var(--cp,'inset(0 50% 0 0)')}
  body[data-view=diff] .cmp .side,body[data-view=diff] .cmp .slide{display:none}
  body[data-view=diff] .cmp .blend{display:block}
  body[data-view=slide] .cmp .slide input, body[data-view=diff] .cmp{pointer-events:auto}
  .cmp .slide input{pointer-events:auto}
  .hide{display:none!important}
  /* ---- 大图 lightbox ---- */
  #lb{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:50;display:none;
    flex-direction:column;align-items:center;padding:10px}
  #lb.on{display:flex}
  #lb .lb-stage{flex:1;width:100%;min-height:0;display:flex;gap:4px;align-items:stretch;justify-content:center}
  #lb .lb-stage figure{margin:0;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px}
  #lb .lb-stage img{max-width:100%;max-height:100%;object-fit:contain;background:repeating-conic-gradient(#1b2230 0 25%,#10141b 0 50%) 0 0/20px 20px}
  #lb figcaption{color:var(--tx2);font-size:12px}
  #lb .lb-bar{display:flex;align-items:center;gap:14px;padding:10px;font-size:13px;color:var(--tx)}
  #lb .lb-bar b{color:#fff;font-family:ui-monospace,Menlo,monospace}
  #lb .lb-bar button{background:var(--panel2);border:1px solid var(--line);color:var(--tx);border-radius:6px;
    padding:4px 12px;cursor:pointer;font-size:13px}
  #lb .lb-bar button:hover{border-color:var(--accent);color:var(--accent)}
  .empty{color:var(--tx2);text-align:center;padding:60px 0;font-size:14px}
  footer{color:var(--tx2);font-size:11px;text-align:center;padding:18px}
</style>
</head>
<body data-view="side">
<header>
  <div class="hd-top">
    <h1>${title}</h1>
    <span class="stat">共 <b id="st-total">${stat.total}</b> 个样本
      ${stat.failed ? `，渲染失败 <b style="color:var(--red)">${stat.failed}</b>` : ''}
      ${stat.maxRmse != null ? `，RMSE 均值 <b>${(stat.avgRmse * 100).toFixed(1)}%</b> / 最大 <b style="color:var(--red)">${(stat.maxRmse * 100).toFixed(1)}%</b>` : ''}
      · 生成于 ${stat.generatedAt.replace('T', ' ').slice(0, 19)}</span>
  </div>
  <div class="bar">
    <div class="grp"><input id="q" type="search" placeholder="过滤文件名…"></div>
    <div class="grp"><input id="th" type="range" min="0" max="50" value="0"><span>RMSE ≥ <b id="th-v">0%</b></span></div>
    <div class="grp"><select id="sort">
      <option value="rmse-desc">按差异 ↓（最差在前）</option>
      <option value="rmse-asc">按差异 ↑</option>
      <option value="name">按文件名</option>
    </select></div>
    <div class="seg" id="view">
      <button data-v="side" class="on">并排</button>
      <button data-v="slide">滑块</button>
      <button data-v="diff">叠差</button>
    </div>
    <div class="grp"><label><input id="only-bad" type="checkbox"> 只看 RMSE≥10%</label></div>
    <div class="count-hint" id="cnt">显示 ${stat.total} / ${stat.total}</div>
  </div>
</header>
<main id="list"></main>
<footer>ours = 本项目渲染（白色光栅图） · ref = 参考实现 · RMSE 为 800×600 白色底光栅化后的归一化差异；滑块 / 叠差模式要求双图同尺寸几何对齐（本项目输出满足）。</footer>

<div id="lb"><div class="lb-stage"></div><div class="lb-bar">
  <button id="lb-prev">← 上一</button>
  <span id="lb-name"></span>
  <button id="lb-next">下一 →</button>
  <button id="lb-close">关闭 Esc</button>
</div></div>

<script>
const DATA = ${JSON.stringify({ title, stat, entries })};
/* ---------- 渲染卡片 ---------- */
const $ = s => document.querySelector(s);
const list = $('#list');
let order = [];       // 当前可见条目的 DATA 索引
let cur = -1;         // lightbox 当前条目

function rmseBadge(e){
  if (e.failed) return '<span class="badge b-gray" title="' + (e.failNote || '') + '">失败</span>';
  const r = e.rmse, p = r * 100;
  const cls = r >= .3 ? 'b-red' : r >= .1 ? 'b-orange' : r >= .03 ? 'b-yellow' : 'b-green';
  return '<span class="badge ' + cls + '" title="RMSE=' + r + '">' + p.toFixed(1) + '%</span>';
}
function esc(s){return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function renderCards(){
  const q = $('#q').value.trim().toLowerCase();
  const th = parseFloat($('#th').value) / 100;
  const onlyBad = $('#only-bad').checked;
  const sort = $('#sort').value;
  let idx = [];
  DATA.entries.forEach((e, i) => {
    if (q && !e.base.toLowerCase().includes(q)) return;
    if (e.rmse == null && !e.failed) return;
    if (e.rmse != null && e.rmse < th) return;
    if (onlyBad && (e.rmse == null || e.rmse < .1)) return;
    idx.push(i);
  });
  if (sort === 'rmse-asc') idx.sort((a, b) => (DATA.entries[a].rmse ?? 9) - (DATA.entries[b].rmse ?? 9));
  else if (sort === 'name') idx.sort((a, b) => DATA.entries[a].base.localeCompare(DATA.entries[b].base));
  else idx.sort((a, b) => (DATA.entries[b].rmse ?? -1) - (DATA.entries[a].rmse ?? -1));
  order = idx;
  $('#cnt').textContent = '显示 ' + idx.length + ' / ' + DATA.entries.length;
  list.innerHTML = idx.map((_, k) => {
    const e = DATA.entries[idx[k]];
    const svg = e.ours.replace(/\.png$/, '.svg');
    const exact = e.exact;
    return '<article class="card' + (e.failed ? ' failed' : '') + '" data-i="' + idx[k] + '">' +
      '<div class="c-head">' + rmseBadge(e) +
      '<span class="c-name">' + esc(e.base) + '</span>' +
      (e.note ? '<span class="c-note">' + esc(e.note) + '</span>' : '') +
      (e.src ? '<a href="' + e.src + '" target="_blank" rel="noopener">源文件 ↗</a>' : '') +
      '<div class="act"><button class="zoom">放大</button></div></div>' +
      '<div class="cmp' + (exact ? '' : ' noexact') + '">' +
        '<div class="side">' +
          '<div class="half"><img loading="lazy" src="' + esc(e.ours) + '" data-k="' + idx[k] + '" alt="ours"><span class="tag ours">本项目</span></div>' +
          '<div class="half"><img loading="lazy" src="' + esc(e.ref) + '" data-k="' + idx[k] + '" alt="ref"><span class="tag ref">参考实现</span></div>' +
        '</div>' +
        '<div class="slide" data-base="' + esc(e.base) + '">' +
          '<div class="lay"><img loading="lazy" src="' + esc(e.ref) + '" alt="ref"></div>' +
          '<div class="lay top"><img loading="lazy" src="' + esc(e.ours) + '" alt="ours"></div>' +
          '<input type="range" min="0" max="1000" value="500">' +
          '<div class="divider"></div>' +
          '<span class="lbl" style="left:8px">← 本项目</span><span class="lbl" style="right:8px">参考实现 →</span>' +
        '</div>' +
        '<div class="blend">' +
          '<div class="lay"><img loading="lazy" src="' + esc(e.ours) + '" alt="ours"></div>' +
          '<div class="lay up"><img loading="lazy" src="' + esc(e.ref) + '" alt="ref diff"></div>' +
          '<span class="tag">叠差合成（白色 = 两图相同）</span>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');
  if (!idx.length) list.innerHTML = '<div class="empty">没有匹配的样本，放宽过滤条件试试。</div>';
}

/* ---------- 交互 ---------- */
$('#q').addEventListener('input', renderCards);
$('#sort').addEventListener('change', renderCards);
$('#th').addEventListener('input', () => { $('#th-v').textContent = $('#th').value + '%'; renderCards(); });
$('#only-bad').addEventListener('change', renderCards);
$('#view').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  document.body.dataset.view = b.dataset.v;
  $('#view').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
});

/* 滑块联动（事件委托：卡片可能被重渲） */
list.addEventListener('input', ev => {
  const r = ev.target.closest('.slide input'); if (!r) return;
  const s = r.closest('.slide');
  const x = r.value / 10;
  s.style.setProperty('--x', x + '%');
  s.style.setProperty('--cp', 'inset(0 ' + (100 - x) + '% 0 0)');
});

/* ---------- lightbox ---------- */
const lb = $('#lb'), stage = lb.querySelector('.lb-stage');
function openLb(k){
  if (k < 0 || k >= order.length) return;
  cur = k;
  const e = DATA.entries[order[k]];
  stage.innerHTML =
    '<figure><img src="' + esc(e.ours) + '"><figcaption>本项目 — ' + esc(e.base) + '</figcaption></figure>' +
    '<figure><img src="' + esc(e.ref) + '"><figcaption>参考实现 — ' + esc(e.base) + '</figcaption></figure>';
  $('#lb-name').innerHTML = (order.length - k) + ' / ' + order.length +
    ' <b>' + esc(e.base) + '</b> ' + rmseBadge(e);
  lb.classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeLb(){ lb.classList.remove('on'); document.body.style.overflow = ''; }
$('#lb-close').addEventListener('click', closeLb);
$('#lb-prev').addEventListener('click', () => openLb(cur - 1));
$('#lb-next').addEventListener('click', () => openLb(cur + 1));
list.addEventListener('click', ev => {
  const z = ev.target.closest('.zoom');
  const img = ev.target.closest('.cmp img');
  if (z || img) { const card = (z || img).closest('.card'); openLb(order.findIndex(v => v === Number(card.dataset.i))); }
});
document.addEventListener('keydown', ev => {
  if (!lb.classList.contains('on')) return;
  if (ev.key === 'Escape') closeLb();
  else if (ev.key === 'ArrowLeft') openLb(cur - 1);
  else if (ev.key === 'ArrowRight') openLb(cur + 1);
});
renderCards();
</script>
</body>
</html>
`;

// ---- 写出 ----
const outPath = path.resolve(args.out || path.join(diffDir, 'comparison.html'));
fs.writeFileSync(outPath, html);
console.log('对比页已生成: ' + outPath);
console.log('样本 %d（失败 %d） 平均 RMSE=%s', stat.total, stat.failed,
  stat.avgRmse != null ? (stat.avgRmse * 100).toFixed(2) + '%' : 'N/A');
