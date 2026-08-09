// PDF 导出模块

class PdfContext {
    constructor() {
        this.canvas = { width: 0, height: 0 };
        this.strokeStyle = '#000000';
        this.fillStyle = '#000000';
        this.lineWidth = 1;
        this.font = '12px Helvetica';
        this.fillRule = 'nonzero';
        this._commands = [];
        this._path = [];
        this._stateStack = [];
        this._currentPoint = null;
    }

    _formatNumber(value) {
        const rounded = Math.round(value * 100) / 100;
        return Number.isInteger(rounded) ? String(rounded) : String(rounded);
    }

    _convertY(y) {
        return this.canvas.height - y;
    }

    _parseColor(style) {
        if (!style) return { r: 0, g: 0, b: 0 };
        if (style.startsWith('#')) {
            const hex = style.slice(1);
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                return { r, g, b };
            }
            if (hex.length === 6) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return { r, g, b };
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
        const px = this._formatNumber(x);
        const py = this._formatNumber(this._convertY(y));
        this._path.push(`${px} ${py} m`);
        this._currentPoint = { x, y };
    }

    lineTo(x, y) {
        const px = this._formatNumber(x);
        const py = this._formatNumber(this._convertY(y));
        this._path.push(`${px} ${py} l`);
        this._currentPoint = { x, y };
    }

    rect(x, y, w, h) {
        const px = this._formatNumber(x);
        const py = this._formatNumber(this._convertY(y + h));
        const pw = this._formatNumber(w);
        const ph = this._formatNumber(h);
        this._path.push(`${px} ${py} ${pw} ${ph} re`);
        this._currentPoint = { x: x + w, y: y + h };
    }

    _bezierTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        const p1x = this._formatNumber(cp1x);
        const p1y = this._formatNumber(this._convertY(cp1y));
        const p2x = this._formatNumber(cp2x);
        const p2y = this._formatNumber(this._convertY(cp2y));
        const px = this._formatNumber(x);
        const py = this._formatNumber(this._convertY(y));
        this._path.push(`${p1x} ${p1y} ${p2x} ${p2y} ${px} ${py} c`);
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

            const rotated = this._applyRotation(cx, cy, rotation, x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2);

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

            this._bezierTo(rotated.cp1x, rotated.cp1y, rotated.cp2x, rotated.cp2y, rotated.x2, rotated.y2);
            angle = angle2;
        }
    }

    _applyRotation(cx, cy, rotation, x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2) {
        if (!rotation) {
            return { x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2 };
        }
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        function rotatePoint(x, y) {
            const dx = x - cx;
            const dy = y - cy;
            return {
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos
            };
        }
        const p1 = rotatePoint(x1, y1);
        const p2 = rotatePoint(x2, y2);
        const c1 = rotatePoint(cp1x, cp1y);
        const c2 = rotatePoint(cp2x, cp2y);
        return { x1: p1.x, y1: p1.y, cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y, x2: p2.x, y2: p2.y };
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
            fillRule: this.fillRule
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
        }
    }

    measureText(text) {
        const size = this._getFontSize();
        return { width: size * 0.6 * text.length };
    }

    _getFontSize() {
        const match = this.font.match(/(\d+(?:\.\d+)?)px/i);
        if (match) {
            return parseFloat(match[1]);
        }
        return 12;
    }

    fillText(text, x, y) {
        if (text === undefined || text === null) return;
        const size = this._getFontSize();
        const color = this._parseColor(this.fillStyle);
        const r = this._formatNumber(color.r / 255);
        const g = this._formatNumber(color.g / 255);
        const b = this._formatNumber(color.b / 255);
        const px = this._formatNumber(x);
        const py = this._formatNumber(this._convertY(y));
        const escaped = String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        this._commands.push(`BT /F1 ${this._formatNumber(size)} Tf ${r} ${g} ${b} rg 1 0 0 1 ${px} ${py} Tm (${escaped}) Tj ET`);
    }

    buildPdf() {
        const width = this.canvas.width || 800;
        const height = this.canvas.height || 600;
        const contentStream = this._commands.join('\n') + '\n';
        return buildPdfFromContent(contentStream, width, height);
    }
}

function buildPdfFromContent(contentStream, width, height) {
    const encoder = new TextEncoder();
    const parts = [];
    let position = 0;
    const offsets = [0];

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

    pushString('%PDF-1.4\n');

    addObject(1, encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
    addObject(2, encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));

    const pageDict = `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 ${width} ${height}] /Contents 5 0 R >>`;
    addObject(3, encoder.encode(pageDict));

    const fontDict = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    addObject(4, encoder.encode(fontDict));

    const contentHeader = `<< /Length ${contentStream.length} >>\nstream\n`;
    const contentFooter = '\nendstream';
    addObject(5, encoder.encode(contentHeader + contentStream + contentFooter));

    const xrefPosition = position;
    pushString('xref\n');
    pushString(`0 ${offsets.length}\n`);
    pushString('0000000000 65535 f \n');
    for (let i = 1; i < offsets.length; i++) {
        const offset = offsets[i].toString().padStart(10, '0');
        pushString(`${offset} 00000 n \n`);
    }

    pushString('trailer\n');
    pushString(`<< /Size ${offsets.length} /Root 1 0 R >>\n`);
    pushString('startxref\n');
    pushString(`${xrefPosition}\n`);
    pushString('%%EOF\n');

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        pdfBytes.set(part, offset);
        offset += part.length;
    }
    return pdfBytes;
}

// 导出为PDF（矢量，使用绘制指令生成）
function exportToPDF(base64Data, showDebug) {
    try {
        if (!base64Data) {
            throw new Error('没有可用的源数据，无法导出PDF');
        }

        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        if (typeof MetafileParser === 'undefined') {
            throw new Error('MetafileParser is not defined. The browser bundle may not have loaded correctly.');
        }

        const parser = new MetafileParser(bytes);
        const result = parser.parse();
        if (result.error) {
            throw new Error(result.error);
        }

        const pdfCtx = new PdfContext();
        let drawer;
        if (parser.fileType === 'wmf' || parser.fileType === 'placeable-wmf') {
            drawer = new WmfDrawer(pdfCtx);
        } else if (parser.fileType === 'emf') {
            drawer = new EmfDrawer(pdfCtx);
        } else if (parser.fileType === 'emf+') {
            drawer = new EmfPlusDrawer(pdfCtx);
        } else {
            throw new Error('Unknown file type: ' + parser.fileType);
        }

        drawer.draw(result);

        const pdfBytes = pdfCtx.buildPdf();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.download = 'metafile-export.pdf';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('Error exporting PDF:', error);
        if (showDebug) {
            showDebug('导出PDF时出错: ' + error.message);
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PdfContext,
        buildPdfFromContent,
        exportToPDF
    };
} else if (typeof window !== 'undefined') {
    window.PdfExporter = {
        PdfContext,
        buildPdfFromContent,
        exportToPDF
    };
}
