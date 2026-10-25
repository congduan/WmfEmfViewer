// WMF 文本度量影响面检查。
//
// 背景（一次探索的结论，避免后人重复走弯路）：
//   META_EXTTEXTOUT 自带 Dx 数组时，WmfDrawer **直接按 Dx 累加**推进当前笔位置
//   （processExtTextOut 的 dxList 分支），此时完全不调用 measureText。
//   measureText 只影响两类场景：
//     1) 无 Dx 的文本 + TA_UPDATECP：Windows 用真实字形前进量推进，
//        而 WMF 记录里没有这个值 → 没有"记录自带真值"可用；
//     2) SVG/PDF 文本宽度（锚点/对齐）。
//   所以 WMF 侧的推进保真度无法用 Dx 直接做门禁，本脚本改为做**影响面**检查：
//   打开真实字体度量后，逐文件比对 SVG，确认
//     - 有多少文件发生变化；
//     - 变化是否**只落在 <text> 元素**上（把 <text> 全部剔除后，两份 SVG 必须完全相同）。
//   后者是"改动没有污染非文本几何"的硬保障。
//
// 用法：
//   node bench/wmf-advance.js
//   node bench/wmf-advance.js --dir test_files/wmf-corpus --limit 40
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MetafileParser = require(path.join(ROOT, 'src/utils/metafileParser.js'));
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));
const WmfDrawer = require(path.join(ROOT, 'src/modules/drawers/wmfDrawer.js'));
const fontFileMetrics = require(path.join(ROOT, 'src/utils/fontFileMetrics.js'));

function parseArgs(argv) {
    const args = { dirs: [], limit: 0, json: null, verbose: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dir') args.dirs.push(argv[++i]);
        else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
        else if (a === '--json') args.json = argv[++i];
        else if (a === '-v' || a === '--verbose') args.verbose = true;
        else if (!a.startsWith('-')) args.dirs.push(a);
    }
    if (!args.dirs.length) args.dirs.push('test_files');
    return args;
}

function collectFiles(dirs) {
    const out = [];
    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const ent of entries) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (/\.wmf$/i.test(ent.name)) out.push(p);
        }
    };
    for (const d of dirs) walk(path.resolve(d));
    return out;
}

/** 渲染一个 WMF 到 SVG；metrics = 'estimate' | 'system' */
function render(file, metrics) {
    SvgContext.setMeasureProvider(metrics === 'system' ? fontFileMetrics.createMeasureProvider() : null);
    const data = new Uint8Array(fs.readFileSync(file));
    const parsed = new MetafileParser(data).parse();
    if (!parsed || !parsed.records || !parsed.records.length) return null;
    const ctx = new SvgContext();
    new WmfDrawer(ctx).draw(parsed, { viewWidth: 800, viewHeight: 600 });
    return ctx.getSvg();
}

/** 去掉所有 <text>…</text> 后的骨架（用于判断改动是否只影响文本） */
function skeleton(svg) {
    return svg.replace(/<text[\s\S]*?<\/text>/g, '<text/>');
}

function main() {
    const args = parseArgs(process.argv);
    const files = collectFiles(args.dirs);
    const selected = args.limit > 0 ? files.slice(0, args.limit) : files;

    const realLog = console.log;
    const realWarn = console.warn;
    const realErr = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    /** @type {Array<{file:string, changed:boolean, skeletonEqual:boolean, textCount:number}>} */
    const rows = [];
    try {
        for (const file of selected) {
            let a = null;
            let b = null;
            try {
                a = render(file, 'estimate');
                b = render(file, 'system');
            } catch (e) {
                continue;
            } finally {
                SvgContext.setMeasureProvider(null);
            }
            if (a === null || b === null) continue;
            rows.push({
                file,
                changed: a !== b,
                skeletonEqual: skeleton(a) === skeleton(b),
                textCount: (a.match(/<text/g) || []).length,
            });
        }
    } finally {
        SvgContext.setMeasureProvider(null);
        console.log = realLog;
        console.warn = realWarn;
        console.error = realErr;
    }

    const changed = rows.filter((r) => r.changed);
    const polluted = changed.filter((r) => !r.skeletonEqual);
    const out = (s) => process.stdout.write(s + '\n');
    out('\n=== WMF 文本度量影响面 ===');
    out(`文件: ${rows.length} 个 WMF（${args.dirs.join(', ')}）`);
    out(`SVG 变化: ${changed.length} 个（${(100 * changed.length / Math.max(rows.length, 1)).toFixed(1)}%）` +
        `｜其中非文本几何也变化: ${polluted.length} 个`);
    if (changed.length) {
        out(`变化文件的文本元素数: 中位 ${median(changed.map((r) => r.textCount))}`);
    }
    if (polluted.length) {
        out('⚠️ 以下文件的非文本内容也变了，说明度量改动影响了非文本几何：');
        for (const r of polluted.slice(0, 8)) out('  ' + path.relative(ROOT, r.file));
    }
    if (args.verbose) {
        for (const r of changed.slice(0, 20)) out(`  ${path.relative(ROOT, r.file)} text=${r.textCount}`);
    }

    if (args.json) {
        const outPath = path.resolve(args.json);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            files: rows.length,
            changed: changed.length,
            geometryPolluted: polluted.length,
            changedFiles: changed.map((r) => path.relative(ROOT, r.file)),
        }, null, 2));
        out(`\nJSON 已写入 ${path.relative(ROOT, outPath)}`);
    }
}

function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

main();
