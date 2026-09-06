#!/usr/bin/env node
/**
 * make-docx.js - 将 WMF/EMF 文件打包成 .docx，用 Word/WPS 查看其原生渲染效果，
 *                用于与 WmfEmfViewer 的 Canvas 渲染结果做对比。
 *
 * 用法:
 *   node scripts/make-docx.js [-o output.docx] <file1.wmf|file1.emf> [file2 ...]
 *
 * 示例:
 *   node scripts/make-docx.js -o preview.docx test_files/media/image10.wmf test_files/media/image207.wmf
 *   node scripts/make-docx.js test_files/media/*.wmf   (shell 通配)
 *
 * 说明:
 *   - 零依赖：自行生成 stored(不压缩) zip 包 + CRC32。
 *   - 图片尺寸优先从文件头解析物理尺寸:
 *       Placeable WMF -> placeable 头的 bbox + inch (twips)
 *       EMF           -> 头记录 rclFrame (0.01mm)
 *       标准 WMF      -> 扫描记录流找 SetWindowExt, 按 96 DPI 估算
 *     并限制显示宽度不超过 6 英寸(A4 版心内), 等比缩放。
 *   - 每张图独占一页, 图上方以文本标注文件名, 方便逐页截图对比。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const EMU_PER_INCH = 914400;
const EMU_PER_TWIP = 635; // 914400 / 1440
const EMU_PER_MM = 36000;
const MAX_WIDTH_EMU = Math.floor(6 * EMU_PER_INCH); // A4 版心宽约 6.27"
const DEFAULT_SIZE = { w: Math.floor(3 * EMU_PER_INCH), h: Math.floor(2.25 * EMU_PER_INCH) };

/* ---------------- 尺寸解析 ---------------- */

function readPlaceableWmfSize(buf) {
    if (buf.length < 22) return null;
    if (buf.readUInt32LE(0) !== 0x9ac6cdd7) return null;
    const left = buf.readInt16LE(6), top = buf.readInt16LE(8);
    const right = buf.readInt16LE(10), bottom = buf.readInt16LE(12);
    const inch = buf.readUInt16LE(14) || 1440;
    const wTwips = Math.round(((right - left) * 1440) / inch);
    const hTwips = Math.round(((bottom - top) * 1440) / inch);
    if (wTwips <= 0 || hTwips <= 0) return null;
    return { w: wTwips * EMU_PER_TWIP, h: hTwips * EMU_PER_TWIP };
}

function readStdWmfSize(buf) {
    // 18 字节头: type(2) headerSize(words,2) ... 记录流从 headerSize*2 开始
    if (buf.length < 18) return null;
    let offset = buf.readUInt16LE(2) * 2;
    let ext = null, org = null;
    while (offset + 6 <= buf.length) {
        const sizeWords = buf.readUInt32LE(offset);
        const func = buf.readUInt16LE(offset + 4);
        if (sizeWords < 3 || offset + sizeWords * 2 > buf.length) break;
        if (func === 0x020c /* META_SETWINDOWEXT */ && offset + 10 <= buf.length) {
            ext = { y: buf.readInt16LE(offset + 6), x: buf.readInt16LE(offset + 8) };
        } else if (func === 0x020b /* META_SETWINDOWORG */ && offset + 10 <= buf.length) {
            org = { y: buf.readInt16LE(offset + 6), x: buf.readInt16LE(offset + 8) };
        }
        if (func === 0x0000 /* META_EOF */) break;
        offset += sizeWords * 2;
    }
    if (!ext || ext.x <= 0 || ext.y <= 0) return null;
    let wPx = ext.x, hPx = ext.y;
    if (org) { // 用 org 修正右/下边界 (常见写法: ext = (org+size) 当 org 非 0)
        if (org.x + ext.x > wPx) wPx = org.x + ext.x;
        if (org.y + ext.y > hPx) hPx = org.y + ext.y;
    }
    const dpi = 96;
    return { w: Math.round((wPx / dpi) * EMU_PER_INCH), h: Math.round((hPx / dpi) * EMU_PER_INCH) };
}

function readEmfSize(buf) {
    if (buf.length < 88) return null;
    if (buf.readUInt32LE(0) !== 1) return null; // EMR_HEADER
    if (buf.readUInt32LE(40) !== 0x464d4520) return null; // " EMF" 签名 (跳过 bounds)
    // offset: iType(4) nSize(4) rclBounds(16) -> rclFrame 从 24 开始, 单位 0.01mm
    const left = buf.readInt32LE(24), top = buf.readInt32LE(28);
    const right = buf.readInt32LE(32), bottom = buf.readInt32LE(36);
    const wEmu = (right - left) * 360; // 0.01mm * 360 = EMU
    const hEmu = (bottom - top) * 360;
    if (wEmu <= 0 || hEmu <= 0) return null;
    return { w: wEmu, h: hEmu };
}

function resolveDisplaySize(buf, fileName) {
    let size = null;
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.emf')) size = readEmfSize(buf);
    if (!size) size = readPlaceableWmfSize(buf);
    if (!size && !lower.endsWith('.emf')) size = readStdWmfSize(buf);
    if (!size) {
        console.warn(`[warn] 无法解析尺寸, 使用默认值: ${fileName}`);
        size = { ...DEFAULT_SIZE };
    }
    // 过滤异常值并限制最大宽度
    if (!isFinite(size.w) || !isFinite(size.h) || size.w <= 0 || size.h <= 0 || size.w > 100 * EMU_PER_INCH || size.h > 100 * EMU_PER_INCH) {
        size = { ...DEFAULT_SIZE };
    } else if (size.w > MAX_WIDTH_EMU) {
        const k = MAX_WIDTH_EMU / size.w;
        size = { w: MAX_WIDTH_EMU, h: Math.round(size.h * k) };
    }
    return size;
}

/* ---------------- zip (stored, 零依赖) ---------------- */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
    // entries: [{ name: string, data: Buffer }]
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const DOS_TIME = 0; // 00:00:00
    const DOS_DATE = 0x21; // 1980-01-01

    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, 'utf8');
        const crc = crc32(e.data);
        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);
        lfh.writeUInt16LE(20, 4); // version needed
        lfh.writeUInt16LE(0, 6); // flags
        lfh.writeUInt16LE(0, 8); // stored
        lfh.writeUInt16LE(DOS_TIME, 10);
        lfh.writeUInt16LE(DOS_DATE, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(e.data.length, 18);
        lfh.writeUInt32LE(e.data.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);
        localParts.push(lfh, nameBuf, e.data);

        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0);
        cdh.writeUInt16LE(20, 4); // version made by
        cdh.writeUInt16LE(20, 6); // version needed
        cdh.writeUInt16LE(0, 8);
        cdh.writeUInt16LE(0, 10);
        cdh.writeUInt16LE(DOS_TIME, 12);
        cdh.writeUInt16LE(DOS_DATE, 14);
        cdh.writeUInt32LE(crc, 16);
        cdh.writeUInt32LE(e.data.length, 20);
        cdh.writeUInt32LE(e.data.length, 24);
        cdh.writeUInt16LE(nameBuf.length, 28);
        // extra/comment/attrs = 0
        cdh.writeUInt32LE(offset, 42);
        centralParts.push(cdh, nameBuf);

        offset += 30 + nameBuf.length + e.data.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralBuf, eocd]);
}

/* ---------------- OOXML 组装 ---------------- */

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildContentTypes(hasWmf, hasEmf) {
    const defaults = [
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
    ];
    if (hasWmf) defaults.push('<Default Extension="wmf" ContentType="image/x-wmf"/>');
    if (hasEmf) defaults.push('<Default Extension="emf" ContentType="image/x-emf"/>');
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        defaults.join('') +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>'
    );
}

function buildRootRels() {
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    );
}

function buildDocumentRels(items) {
    const rels = items
        .map((it, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${it.mediaName}"/>`)
        .join('');
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels +
        '</Relationships>'
    );
}

function pictureParagraph(item, index) {
    const name = esc(path.basename(item.srcName));
    return (
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><b/>` +
        `<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">[${index + 1}] ${name}</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
        `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
        `<wp:extent cx="${item.size.w}" cy="${item.size.h}"/>` +
        `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
        `<wp:docPr id="${index + 1}" name="Picture ${index + 1}"/>` +
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${item.size.w}" cy="${item.size.h}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    );
}

function buildDocument(items) {
    const body = items
        .map((it, i) => pictureParagraph(it, i) + (i < items.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''))
        .join('');
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
        `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
        '</w:body></w:document>'
    );
}

/* ---------------- 主流程 ---------------- */

function main() {
    const args = process.argv.slice(2);
    let output = 'preview.docx';
    const inputs = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-o' || args[i] === '--output') {
            output = args[++i];
            if (!output) {
                console.error('错误: -o 需要跟输出文件名');
                process.exit(1);
            }
        } else if (args[i] === '-h' || args[i] === '--help') {
            console.log('用法: node scripts/make-docx.js [-o output.docx] <file.wmf|file.emf> [...]');
            process.exit(0);
        } else {
            inputs.push(args[i]);
        }
    }
    if (inputs.length === 0) {
        console.error('用法: node scripts/make-docx.js [-o output.docx] <file.wmf|file.emf> [...]');
        process.exit(1);
    }

    const items = [];
    let hasWmf = false, hasEmf = false;
    for (const src of inputs) {
        if (!fs.existsSync(src)) {
            console.error(`错误: 文件不存在 ${src}`);
            process.exit(1);
        }
        const buf = fs.readFileSync(src);
        const lower = src.toLowerCase();
        const ext = lower.endsWith('.emf') ? 'emf' : 'wmf';
        if (ext === 'emf') hasEmf = true;
        else hasWmf = true;
        const size = resolveDisplaySize(buf, src);
        items.push({ srcName: src, mediaName: `image${items.length + 1}.${ext}`, data: buf, size });
        const wIn = (size.w / EMU_PER_INCH).toFixed(2), hIn = (size.h / EMU_PER_INCH).toFixed(2);
        console.log(`  + ${src} -> media/image${items.length}.${ext}  (${wIn}" x ${hIn}")`);
    }

    const entries = [
        { name: '[Content_Types].xml', data: Buffer.from(buildContentTypes(hasWmf, hasEmf), 'utf8') },
        { name: '_rels/.rels', data: Buffer.from(buildRootRels(), 'utf8') },
        { name: 'word/document.xml', data: Buffer.from(buildDocument(items), 'utf8') },
        { name: 'word/_rels/document.xml.rels', data: Buffer.from(buildDocumentRels(items), 'utf8') },
        ...items.map((it) => ({ name: `word/media/${it.mediaName}`, data: it.data })),
    ];

    const zipBuf = makeZip(entries);
    fs.writeFileSync(output, zipBuf);
    console.log(`完成: ${output} (${items.length} 张图片, ${(zipBuf.length / 1024).toFixed(1)} KB)`);
    console.log('用 Word / WPS / Pages 打开即可查看原生渲染效果 (LibreOffice 亦可, 渲染略有差异)。');
}

main();
