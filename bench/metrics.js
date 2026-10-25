// 字体度量基准：验证 src/utils/fontFileMetrics（零依赖解析系统字体）的正确性。
//
// 做法：先用 SvgContext 跑一遍 EMF 语料，收集渲染器实际调用过的 (font, text) 对；
// 再分别用两种度量源量同一批文本：
//   - system: src/utils/fontFileMetrics（解析 head/hhea/hmtx/cmap，纯 JS）
//   - napi  : @napi-rs/canvas（宿主字体引擎，作为参照）
// 只有「请求的字体在系统里真的存在」时两者才应当一致；命中别名回退
// （如 Segoe UI → Helvetica Neue）时差异来自字体不同，不算解析误差。
//
// 用法：
//   node bench/metrics.js                       # 默认扫描 test_files 下全部 EMF
//   node bench/metrics.js --dir test_files/emf-corpus/emf-valid --limit 40
//   node bench/metrics.js --json out/bench/metrics.json
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));
const fontFileMetrics = require(path.join(ROOT, 'src/utils/fontFileMetrics.js'));
const bounds = require('./bounds.js');

function parseArgs(argv) {
    const args = { dirs: [], json: null, limit: 0 };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dir') args.dirs.push(argv[++i]);
        else if (a === '--json') args.json = argv[++i];
        else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
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
            else if (/\.emf$/i.test(ent.name)) out.push(p);
        }
    };
    for (const d of dirs) walk(path.resolve(d));
    return out;
}

function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(arr, p) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

function main() {
    const args = parseArgs(process.argv);
    const files = collectFiles(args.dirs);
    const selected = args.limit > 0 ? files.slice(0, args.limit) : files;

    // 收集渲染器实际度量过的 (font, text)
    const pairs = new Map();
    const original = SvgContext.prototype.measureText;
    SvgContext.prototype.measureText = function (text) {
        const font = this.font || '12px sans-serif';
        const value = String(text == null ? '' : text);
        if (value) pairs.set(font + '\u0000' + value, { font, text: value });
        return original.call(this, text);
    };

    const realLog = console.log;
    const realWarn = console.warn;
    const realErr = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    try {
        for (const file of selected) {
            try { bounds.runFile(file, { backend: 'svg' }); } catch (e) { /* 单个文件失败不影响基准 */ }
        }
    } finally {
        SvgContext.prototype.measureText = original;
        console.log = realLog;
        console.warn = realWarn;
        console.error = realErr;
    }

    const napi = require('@napi-rs/canvas');
    const measureCtx = napi.createCanvas(1, 1).getContext('2d');

    /** @type {Array<{font:string, text:string, family:string, native:boolean, system:number|null, napi:number, rel:number|null, estimate:number}>} */
    const rows = [];
    for (const { font, text } of pairs.values()) {
        const parsed = fontFileMetrics.parseFontShorthand(font);
        const native = fontFileMetrics.hasFamily(parsed.family);
        const system = fontFileMetrics.measureWidth(font, text);
        measureCtx.font = font;
        const napiWidth = measureCtx.measureText(text).width;
        rows.push({
            font,
            text,
            family: parsed.family,
            native,
            system,
            napi: napiWidth,
            rel: system === null || napiWidth <= 0 ? null : Math.abs(system - napiWidth) / napiWidth,
            estimate: parsed.sizePx * 0.6 * text.length,
        });
    }

    const nativeRows = rows.filter((r) => r.native && r.rel !== null);
    const fallbackRows = rows.filter((r) => !r.native);
    const missing = rows.filter((r) => r.system === null);
    const nativeRel = nativeRows.map((r) => r.rel);
    const estimateRel = rows.filter((r) => r.rel !== null).map((r) => Math.abs(r.estimate - r.napi) / Math.max(r.napi, 1e-6));

    const out = (s) => process.stdout.write(s + '\n');
    out('\n=== 字体度量基准（system 解析 vs 宿主引擎） ===');
    out(`文本样本: ${rows.length} 对（来自 ${selected.length} 个 EMF）｜系统字体家族: ${fontFileMetrics.familyCount()}`);
    out(`字体在系统内存在: ${nativeRows.length} 对｜走别名回退: ${fallbackRows.length} 对｜完全解析失败: ${missing.length} 对`);
    if (nativeRel.length) {
        out('\n--- 同名真字体（可直接判定解析精度） ---');
        out(`相对误差: 中位 ${(median(nativeRel) * 100).toFixed(2)}% | p90 ${(pct(nativeRel, 0.9) * 100).toFixed(2)}%` +
            ` | ≤0.5%: ${(100 * nativeRel.filter((v) => v <= 0.005).length / nativeRel.length).toFixed(1)}%` +
            ` | >2%: ${(100 * nativeRel.filter((v) => v > 0.02).length / nativeRel.length).toFixed(1)}%`);
        out(`对照：同一批样本用 0.6em 估算的相对误差 中位 ${(median(estimateRel) * 100).toFixed(1)}%`);
    }
    if (fallbackRows.length) {
        const byFamily = new Map();
        for (const r of fallbackRows) byFamily.set(r.family, (byFamily.get(r.family) || 0) + 1);
        const top = [...byFamily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        out('\n--- 走别名回退的字体（差异来自字体本身，不是解析误差） ---');
        out('  ' + top.map(([f, n]) => `${f}(${n})`).join('  '));
    }

    if (args.json) {
        const outPath = path.resolve(args.json);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            files: selected.length,
            pairs: rows.length,
            nativePairs: nativeRows.length,
            fallbackPairs: fallbackRows.length,
            nativeRelMedian: median(nativeRel),
            nativeRelP90: pct(nativeRel, 0.9),
            estimateRelMedian: median(estimateRel),
            fallbackFamilies: [...new Set(fallbackRows.map((r) => r.family))],
            rows: rows.slice(0, 200).map((r) => ({
                font: r.font, text: r.text.slice(0, 40), native: r.native,
                system: r.system, napi: r.napi, rel: r.rel,
            })),
        }, null, 2));
        out(`\nJSON 已写入 ${path.relative(ROOT, outPath)}`);
    }
}

main();
