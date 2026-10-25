// PDF 导出上下文：把绘制器的 Canvas 2D 调用翻译成 PDF 内容流。
//
// 历史上这份实现存在两份副本（src/resources/webview.html 内联 + website/pdfContext.js），
// 分别服务 webview 与静态网站。副本无法被 lint/typecheck/测试覆盖，改动容易失联，
// 因此收拢为**唯一定义**，由 src/browser.js 挂到 window.PdfContext（与 SvgContext 同构）。
//
// 坐标系：PDF 原点在左下角、y 轴向上，Canvas 原点在左上角、y 轴向下，
// 因此所有点经 CTM 变换后还要做一次 y 翻转（见 _emitPt）。

const textMetrics = require('../utils/textMetrics');

class PdfContext {
    constructor() {
        // style 对象允许绘制器（baseDrawer.initCanvas）设置 CSS 尺寸而不抛错
        this.canvas = { width: 0, height: 0, style: {} };
        this.strokeStyle = '#000000';
        this.fillStyle = '#000000';
        this.lineWidth = 1;
        this.font = '12px Helvetica';
        this.fillRule = 'nonzero';
        this._commands = [];
        this._path = [];
        this._stateStack = [];
        this._currentPoint = null;
        this._ctm = [1, 0, 0, 1, 0, 0]; // PDF 变换矩阵 [a, b, c, d, e, f]
        this._images = []; // 嵌入的位图 XObject
    }

    _formatNumber(value) {
        return String(Math.round(value * 100) / 100);
    }

    _convertY(y) {
        return this.canvas.height - y;
    }

    // 逻辑坐标经 CTM 变换（尚未翻转）
    _pt(x, y) {
        const [a, b, c, d, e, f] = this._ctm;
        return {
            x: a * x + c * y + e,
            y: b * x + d * y + f
        };
    }

    // 变换 + 翻转 + 格式化，供路径/文本操作符直接使用
    _emitPt(x, y) {
        const p = this._pt(x, y);
        return {
            x: this._formatNumber(p.x),
            y: this._formatNumber(this.canvas.height - p.y)
        };
    }

    scale(sx, sy) {
        const [a, b, c, d, e, f] = this._ctm;
        this._ctm = [a * sx, b * sx, c * sy, d * sy, e, f];
    }

    translate(tx, ty) {
        const [a, b, c, d, e, f] = this._ctm;
        this._ctm = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
    }

    rotate(angle) {
        const [a, b, c, d, e, f] = this._ctm;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this._ctm = [
            a * cos + c * sin,
            b * cos + d * sin,
            -a * sin + c * cos,
            -b * sin + d * cos,
            e,
            f
        ];
    }

    _parseColor(style) {
        if (!style) return { r: 0, g: 0, b: 0 };
        if (style.startsWith('#')) {
            const hex = style.slice(1);
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16)
                };
            }
            if (hex.length === 6) {
                return {
                    r: parseInt(hex.slice(0, 2), 16),
                    g: parseInt(hex.slice(2, 4), 16),
                    b: parseInt(hex.slice(4, 6), 16)
                };
            }
        }
        const rgbMatch = style.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbMatch) {
            return {
                r: parseInt(rgbMatch[1], 10),
                g: parseInt(rgbMatch[2], 10),
                b: parseInt(rgbMatch[3], 10)
            };
        }
        return { r: 0, g: 0, b: 0 };
    }

    _emitStrokeStyle() {
        const color = this._parseColor(this.strokeStyle);
        const r = this._formatNumber(color.r / 255);
        const g = this._formatNumber(color.g / 255);
        const b = this._formatNumber(color.b / 255);
        this._commands.push(`${r} ${g} ${b} RG`);
        this._commands.push(`${this._formatNumber(this.lineWidth)} w`);
    }

    _emitFillStyle() {
        const color = this._parseColor(this.fillStyle);
        const r = this._formatNumber(color.r / 255);
        const g = this._formatNumber(color.g / 255);
        const b = this._formatNumber(color.b / 255);
        this._commands.push(`${r} ${g} ${b} rg`);
    }

    _emitPath() {
        if (this._path.length > 0) {
            this._commands.push(this._path.join('\n'));
        }
    }

    _resetPath() {
        this._path = [];
        this._currentPoint = null;
    }

    beginPath() {
        this._resetPath();
    }

    closePath() {
        this._path.push('h');
    }

    moveTo(x, y) {
        const p = this._emitPt(x, y);
        this._path.push(`${p.x} ${p.y} m`);
        this._currentPoint = { x, y };
    }

    lineTo(x, y) {
        const p = this._emitPt(x, y);
        this._path.push(`${p.x} ${p.y} l`);
        this._currentPoint = { x, y };
    }

    rect(x, y, w, h) {
        // _emitPt 返回已格式化的字符串，做差前显式转数值：
        // 保留「先各自取两位小数、再相减」的既有输出，避免 PDF 内容流出现无谓变化
        const p1 = this._emitPt(x, y + h);
        const p2 = this._emitPt(x + w, y);
        const dx = this._formatNumber(Number(p2.x) - Number(p1.x));
        const dy = this._formatNumber(Number(p2.y) - Number(p1.y));
        this._path.push(`${p1.x} ${p1.y} ${dx} ${dy} re`);
        this._currentPoint = { x: x + w, y: y + h };
    }

    _bezierTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        const p1 = this._emitPt(cp1x, cp1y);
        const p2 = this._emitPt(cp2x, cp2y);
        const p = this._emitPt(x, y);
        this._path.push(`${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p.x} ${p.y} c`);
        this._currentPoint = { x, y };
    }

    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this._bezierTo(cp1x, cp1y, cp2x, cp2y, x, y);
    }

    quadraticCurveTo(cpx, cpy, x, y) {
        if (!this._currentPoint) {
            this.moveTo(x, y);
            return;
        }
        const x0 = this._currentPoint.x;
        const y0 = this._currentPoint.y;
        const cp1x = x0 + (2 / 3) * (cpx - x0);
        const cp1y = y0 + (2 / 3) * (cpy - y0);
        const cp2x = x + (2 / 3) * (cpx - x);
        const cp2y = y + (2 / 3) * (cpy - y);
        this._bezierTo(cp1x, cp1y, cp2x, cp2y, x, y);
    }

    arc(cx, cy, r, startAngle, endAngle, anticlockwise) {
        this._arcToBezier(cx, cy, r, r, 0, startAngle, endAngle, anticlockwise);
    }

    ellipse(cx, cy, rx, ry, rotation, startAngle, endAngle, anticlockwise) {
        this._arcToBezier(cx, cy, rx, ry, rotation, startAngle, endAngle, anticlockwise);
    }

    _arcToBezier(cx, cy, rx, ry, rotation, startAngle, endAngle, anticlockwise) {
        let delta = endAngle - startAngle;
        if (!anticlockwise && delta < 0) {
            delta += Math.PI * 2;
        } else if (anticlockwise && delta > 0) {
            delta -= Math.PI * 2;
        }

        const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2));
        const segmentDelta = delta / segments;
        let angle = startAngle;

        for (let i = 0; i < segments; i++) {
            const angle2 = angle + segmentDelta;
            const k = (4 / 3) * Math.tan((angle2 - angle) / 4);

            const cos1 = Math.cos(angle);
            const sin1 = Math.sin(angle);
            const cos2 = Math.cos(angle2);
            const sin2 = Math.sin(angle2);

            const x1 = cx + rx * cos1;
            const y1 = cy + ry * sin1;
            const x2 = cx + rx * cos2;
            const y2 = cy + ry * sin2;

            const cp1x = x1 - k * rx * sin1;
            const cp1y = y1 + k * ry * cos1;
            const cp2x = x2 + k * rx * sin2;
            const cp2y = y2 - k * ry * cos2;

            const rotated = this._applyRotation(
                cx, cy, rotation,
                x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2
            );

            if (i === 0) {
                if (!this._currentPoint) {
                    this.moveTo(rotated.x1, rotated.y1);
                } else {
                    const dx = Math.abs(this._currentPoint.x - rotated.x1);
                    const dy = Math.abs(this._currentPoint.y - rotated.y1);
                    if (dx > 0.01 || dy > 0.01) {
                        this.lineTo(rotated.x1, rotated.y1);
                    }
                }
            }

            this._bezierTo(
                rotated.cp1x, rotated.cp1y,
                rotated.cp2x, rotated.cp2y,
                rotated.x2, rotated.y2
            );
            angle = angle2;
        }
    }

    _applyRotation(cx, cy, rotation, x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2) {
        if (!rotation) {
            return { x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2 };
        }
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const rotatePoint = (x, y) => {
            const dx = x - cx;
            const dy = y - cy;
            return {
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos
            };
        };
        const p1 = rotatePoint(x1, y1);
        const p2 = rotatePoint(x2, y2);
        const c1 = rotatePoint(cp1x, cp1y);
        const c2 = rotatePoint(cp2x, cp2y);
        return {
            x1: p1.x, y1: p1.y,
            cp1x: c1.x, cp1y: c1.y,
            cp2x: c2.x, cp2y: c2.y,
            x2: p2.x, y2: p2.y
        };
    }

    fill() {
        this._emitPath();
        this._emitFillStyle();
        this._commands.push(this.fillRule === 'evenodd' ? 'f*' : 'f');
        this._resetPath();
    }

    stroke() {
        this._emitPath();
        this._emitStrokeStyle();
        this._commands.push('S');
        this._resetPath();
    }

    clip() {
        this._emitPath();
        this._commands.push(this.fillRule === 'evenodd' ? 'W*' : 'W');
        this._commands.push('n');
        this._resetPath();
    }

    fillRect(x, y, w, h) {
        this.beginPath();
        this.rect(x, y, w, h);
        this.fill();
    }

    strokeRect(x, y, w, h) {
        this.beginPath();
        this.rect(x, y, w, h);
        this.stroke();
    }

    save() {
        this._commands.push('q');
        this._stateStack.push({
            strokeStyle: this.strokeStyle,
            fillStyle: this.fillStyle,
            lineWidth: this.lineWidth,
            font: this.font,
            fillRule: this.fillRule,
            ctm: this._ctm.slice()
        });
    }

    restore() {
        this._commands.push('Q');
        const state = this._stateStack.pop();
        if (state) {
            this.strokeStyle = state.strokeStyle;
            this.fillStyle = state.fillStyle;
            this.lineWidth = state.lineWidth;
            this.font = state.font;
            this.fillRule = state.fillRule;
            this._ctm = state.ctm;
        }
    }

    measureText(text) {
        const value = String(text == null ? '' : text);
        // 与 SvgContext 共用度量源：PDF 文本推进同样依赖真实宽度
        const measured = textMetrics.measureWidth(this.font || '12px sans-serif', value);
        if (measured !== null) return { width: measured };
        return { width: this._getFontSize() * 0.6 * value.length };
    }

    _getFontSize() {
        const match = this.font.match(/(\d+(?:\.\d+)?)px/i);
        return match ? parseFloat(match[1]) : 12;
    }

    fillText(text, x, y) {
        if (text === undefined || text === null) return;
        const size = this._getFontSize();
        const color = this._parseColor(this.fillStyle);
        const r = this._formatNumber(color.r / 255);
        const g = this._formatNumber(color.g / 255);
        const b = this._formatNumber(color.b / 255);
        const p = this._emitPt(x, y);
        const escaped = String(text)
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
        this._commands.push(
            `BT /F1 ${this._formatNumber(size)} Tf ${r} ${g} ${b} rg 1 0 0 1 ${p.x} ${p.y} Tm (${escaped}) Tj ET`
        );
    }

    // 位图输出：支持真实的 canvas 与 {width, height, data} 形式的 ImageData，
    // 统一转 RGB 后作为 PDF 图像 XObject 嵌入（alpha 与白色背景合成）
    drawImage(img, dx, dy, dw, dh) {
        if (!img) return;
        let width = img.width;
        let height = img.height;
        let data = null;

        if (typeof img.getContext === 'function') {
            const ctx2d = img.getContext('2d');
            if (ctx2d && typeof ctx2d.getImageData === 'function') {
                const imageData = ctx2d.getImageData(0, 0, img.width, img.height);
                width = imageData.width;
                height = imageData.height;
                data = imageData.data;
            }
        } else if (img.data) {
            data = img.data;
        }

        if (!data) {
            // 读不到像素时用灰色占位，避免导出崩溃
            const prev = this.fillStyle;
            this.fillStyle = '#cccccc';
            this.fillRect(dx, dy, dw || width, dh || height);
            this.fillStyle = prev;
            return;
        }

        // RGBA → RGB（与白色背景合成）
        const rgb = new Uint8Array(width * height * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
            const a = data[i + 3] / 255;
            rgb[j] = Math.round(data[i] * a + 255 * (1 - a));
            rgb[j + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
            rgb[j + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
        }
        this._images.push({ width, height, data: rgb });
        const index = this._images.length;

        // 目标矩形经 CTM 变换后放入 PDF 坐标系
        const tl = this._pt(dx, dy);
        const br = this._pt(dx + (dw || width), dy + (dh || height));
        const llx = this._formatNumber(Math.min(tl.x, br.x));
        const lly = this._formatNumber(this.canvas.height - Math.max(tl.y, br.y));
        const w = this._formatNumber(Math.abs(br.x - tl.x));
        const h = this._formatNumber(Math.abs(br.y - tl.y));
        this._commands.push(`q ${llx} ${lly} ${w} 0 0 ${h} cm /Im${index} Do Q`);
    }

    buildPdf() {
        const width = this.canvas.width || 800;
        const height = this.canvas.height || 600;
        const contentStream = this._commands.join('\n') + '\n';
        return buildPdfFromContent(contentStream, width, height, this._images);
    }
}

/**
 * 由内容流拼装单页 PDF 字节流。
 * @param {string} contentStream
 * @param {number} width
 * @param {number} height
 * @param {Array<{width: number, height: number, data: Uint8Array}>} [images]
 * @returns {Uint8Array}
 */
function buildPdfFromContent(contentStream, width, height, images) {
    const encoder = new TextEncoder();
    const parts = [];
    let position = 0;
    const offsets = [0];
    const imageList = images || [];

    function pushString(str) {
        const bytes = encoder.encode(str);
        parts.push(bytes);
        position += bytes.length;
    }

    function pushBytes(bytes) {
        parts.push(bytes);
        position += bytes.length;
    }

    function addObject(objNumber, contentBytes) {
        offsets[objNumber] = position;
        pushString(objNumber + ' 0 obj\n');
        pushBytes(contentBytes);
        pushString('\nendobj\n');
    }

    // 图像对象内含二进制流，必须按字节写入（TextEncoder 会破坏 >127 的字节）
    function addImageObject(objNumber, img) {
        offsets[objNumber] = position;
        pushString(`${objNumber} 0 obj\n`);
        pushString(
            `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${img.data.length} >>\nstream\n`
        );
        pushBytes(img.data);
        pushString('\nendstream\nendobj\n');
    }

    pushString('%PDF-1.4\n');

    addObject(1, encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
    addObject(2, encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));

    const imageObjStart = 6;
    const xobjectDict =
        imageList.length > 0
            ? ' /XObject << ' +
              imageList.map((_, i) => `/Im${i + 1} ${imageObjStart + i} 0 R`).join(' ') +
              ' >>'
            : '';
    const pageDict = `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >>${xobjectDict} >> /MediaBox [0 0 ${width} ${height}] /Contents 5 0 R >>`;
    addObject(3, encoder.encode(pageDict));

    addObject(4, encoder.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));

    const contentHeader = `<< /Length ${contentStream.length} >>\nstream\n`;
    const contentFooter = '\nendstream';
    addObject(5, encoder.encode(contentHeader + contentStream + contentFooter));

    imageList.forEach((img, i) => addImageObject(imageObjStart + i, img));

    const xrefPosition = position;
    pushString('xref\n');
    pushString(`0 ${offsets.length}\n`);
    pushString('0000000000 65535 f \n');
    for (let i = 1; i < offsets.length; i++) {
        pushString(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
    }

    pushString('trailer\n');
    pushString(`<< /Size ${offsets.length} /Root 1 0 R >>\n`);
    pushString('startxref\n');
    pushString(`${xrefPosition}\n`);
    pushString('%%EOF\n');

    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        pdfBytes.set(part, offset);
        offset += part.length;
    }
    return pdfBytes;
}

// 与 SvgContext.setMeasureProvider 同一个开关（两者共享 src/utils/textMetrics）。
PdfContext.setMeasureProvider = (fn) => textMetrics.setMeasureProvider(fn);

module.exports = { PdfContext, buildPdfFromContent };
