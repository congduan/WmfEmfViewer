const fs = require('fs');
const WmfParser = require('../src/modules/parsers/wmfParser');
const FileTypeDetector = require('../src/utils/fileTypeDetector');

const filePath = process.argv[2] || 'test_files/media/image212.wmf';
const data = fs.readFileSync(filePath);
const type = new FileTypeDetector(data).detect();
const parsed = new WmfParser(data).parse(type);

function readWord(d, o) { return d[o] | (d[o + 1] << 8); }
function readShort(d, o) { const v = readWord(d, o); return (v & 0x8000) ? v - 0x10000 : v; }

const textRecs = parsed.records.filter(r => r.functionId === 0x0521 || r.functionId === 0x0A32);
console.log('file', filePath, 'type', type, 'textRecords', textRecs.length);

textRecs.forEach((r, idx) => {
  if (r.functionId === 0x0521) {
    const len = readWord(r.data, 0);
    const text = String.fromCharCode(...r.data.slice(2, 2 + len));
    console.log(`#${idx} TEXTOUT len=${len} text="${text}"`);
    return;
  }

  const d = r.data;
  const y = readShort(d, 0);
  const x = readShort(d, 2);
  const len = readWord(d, 4);
  const fwOpts = readWord(d, 6);
  let offset = 8;
  if ((fwOpts & (0x0002 | 0x0004)) !== 0) {
    offset += 8;
  }
  const text = String.fromCharCode(...d.slice(offset, offset + len));
  let dxStart = offset + len;
  if (len % 2 !== 0) {
    dxStart += 1; // pad to 16-bit boundary per MS-WMF 2.3.3.5
  }

  const hasDx = d.length >= dxStart + len * 2;
  let dxSigned = [];
  let dxWords = [];
  if (hasDx) {
    for (let i = 0; i < len; i++) {
      dxSigned.push(readShort(d, dxStart + i * 2));
      dxWords.push(readWord(d, dxStart + i * 2));
    }
  }

  const hasNegative = dxSigned.some(v => v < 0);
  const allAligned = dxWords.every(w => (w & 0xFF) === 0);
  const maxAbsSigned = dxSigned.length ? Math.max(...dxSigned.map(v => Math.abs(v))) : 0;
  const maxAbsScaled = dxWords.length ? Math.max(...dxWords.map(w => w / 256)) : 0;
  const looksLikeFixed88 = maxAbsSigned > 2048 && maxAbsScaled < 1024;

  console.log(`#${idx} EXTTEXTOUT x=${x} y=${y} len=${len} fwOpts=${fwOpts} text="${text}"`);
  if (!hasDx) {
    console.log('  dx: none');
    return;
  }

  console.log('  dxSigned sample:', dxSigned.slice(0, 10));
  console.log('  dxWords  sample:', dxWords.slice(0, 10));
  console.log('  stats:', { hasNegative, allAligned, maxAbsSigned, maxAbsScaled, looksLikeFixed88 });
  console.log('  sumSigned:', dxSigned.reduce((s, v) => s + v, 0));
  console.log('  sumFixed88:', dxWords.reduce((s, v) => s + v / 256, 0));
});
