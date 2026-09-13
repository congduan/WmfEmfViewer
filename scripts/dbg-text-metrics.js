// 打印 EMF 的映射模式/窗口视口范围/头部度量，以及前若干条文本记录的字号信息。
// 目的：核对我们的 SVG matrix 与 ref font-size 的换算来源。
// 用法：node scripts/dbg-text-metrics.js <file.emf> [最多打印条数]
const fs = require('fs');
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'out', 'metafileParser.browser.js'));
const MetafileParser = window.MetafileParser;

const fn = process.argv[2];
const limit = parseInt(process.argv[3] || '6', 10);
const buf = fs.readFileSync(fn);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const p = new MetafileParser(data);
const noop = () => {};
const rl = console.log;
console.log = noop;
const r = p.parse();
console.log = rl;

const h = r.emfHeader || r.header || {};
const hh = p.emfHeader || p.header || {};
const pick = (o) => ({
    rclBounds: o.rclBounds,
    rclFrame: o.rclFrame,
    szlDevice: o.szlDevice,
    szlMillimeters: o.szlMillimeters,
    szlMicrometers: o.szlMicrometers
});
console.log('file:', path.basename(fn), '| fileType:', p.fileType, '| records:', r.records.length);
console.log('header(r):', JSON.stringify(pick(h)));
console.log('header(p):', JSON.stringify(pick(hh)));

const NAMES = {
    1: 'HEADER', 9: 'SETWINDOWEXTEX', 10: 'SETWINDOWORGEX', 11: 'SETVIEWPORTEXTEX',
    12: 'SETVIEWPORTORGEX', 17: 'SETMAPMODE', 18: 'SETBKMODE', 24: 'SETTEXTALIGN',
    8: 'POLYLINE', 4: 'COMMENT', 82: 'EXTTEXTOUTW', 83: 'EXTTEXTOUTA',
    84: 'POLYBEZIER16', 85: 'POLYGON16', 86: 'POLYLINE16', 87: 'POLYBEZIERTO16',
    88: 'POLYLINETO16', 89: 'POLYPOLYLINE16', 90: 'POLYPOLYGON16',
    55: 'CREATEPEN', 27: 'CREATEPENINDIRECT', 39: 'CREATEBRUSHINDIRECT',
    92: 'EXTCREATEFONTINDIRECTW', 99: 'SELECTCLIPPATH', 93: 'EXTCREATEPEN'
};

let n = 0;
for (let i = 0; i < r.records.length; i++) {
    const rec = r.records[i];
    const t = rec.type || rec.recordType;
    if (t === 17) { console.log(`#${i} SETMAPMODE err=${rec.mapMode !== undefined ? rec.mapMode : '?'} ${JSON.stringify(rec).slice(0, 160)}`); }
    else if (t === 9) { console.log(`#${i} SETWINDOWEXTEX ${JSON.stringify(rec).slice(0, 160)}`); }
    else if (t === 10) { console.log(`#${i} SETWINDOWORGEX ${JSON.stringify(rec).slice(0, 160)}`); }
    else if (t === 11) { console.log(`#${i} SETVIEWPORTEXTEX ${JSON.stringify(rec).slice(0, 160)}`); }
    else if (t === 12) { console.log(`#${i} SETVIEWPORTORGEX ${JSON.stringify(rec).slice(0, 160)}`); }
    else if (t === 82 || t === 83) {
        if (n < limit) {
            const o = {};
            for (const k of Object.keys(rec)) {
                if (k === 'text' || k === 'string') o[k] = JSON.stringify(rec[k]).slice(0, 40);
                else if (typeof rec[k] !== 'object') o[k] = rec[k];
            }
            console.log(`#${i} ${NAMES[t]} ${JSON.stringify(o)}`);
        }
        n++;
    }
}
console.log('total text records:', n);
