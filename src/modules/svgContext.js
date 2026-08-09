// SvgContext - 模拟 Canvas 2D API 的 SVG 输出上下文
// 将 WmfDrawer/EmfDrawer/EmfPlusDrawer 调用的 Canvas 2D 绘制指令
// 转换为 SVG 元素（<path>/<rect>/<text>/<clipPath> 等），最后可序列化为完整 SVG 文档。
// 与 webview.html 中的 PdfContext 思路一致（drawio 的 mxEmfCanvas 也是同理）。

class SvgContext {
    constructor() {
        this.canvas = { width: 0, height: 0, style: {} };
        this.strokeStyle = '#000000';
        this.fillStyle = '#000000';
        this.lineWidth = 1;
        this.font = '12px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
        this.fillRule = 'nonzero';
        this.globalAlpha = 1;

        this._nodes = [];       // SVG 元素列表
        this._defs = [];        // <defs> 里的 clipPath 等
        this._segments = [];    // 当前路径段
        this._hasSubpath = false;
        this._state = { clip: null };
        this._stack = [];
        this._clipCount = 0;
        this._scaleX = 1;       // HiDPI 缩放，用于还原逻辑显示尺寸
        this._scaleY = 1;
    }

    // ---- 数值格式化（保留最多2位小数） ----
    _fmt(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '0';
        const r = Math.round(v * 100) / 100;
        return String(r);
    }

    static _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _attr(extra) {
        const a = [];
        if (this._state.clip) a.push('clip-path="' + this._state.clip + '"');
        return (extra || []).concat(a).join(' ');
    }

    // ---- 变换 ----
    scale(sx, sy) {
        // 记录 dpr 缩放（baseDrawer 初始化时调用 scale(dpr, dpr)），
        // 坐标本身已在 canvas 像素空间，无需写入 SVG；仅用于换算显示尺寸。
        this._scaleX = sx || 1;
        this._scaleY = sy || 1;
    }

    save() {
        this._stack.push({
            strokeStyle: this.strokeStyle,
            fillStyle: this.fillStyle,
            lineWidth: this.lineWidth,
            font: this.font,
            textAlign: this.textAlign,
            textBaseline: this.textBaseline,
            fillRule: this.fillRule,
            globalAlpha: this.globalAlpha,
            clip: this._state.clip,
        });
    }

    restore() {
        const s = this._stack.pop();
        if (!s) return;
        this.strokeStyle = s.strokeStyle;
        this.fillStyle = s.fillStyle;
        this.lineWidth = s.lineWidth;
        this.font = s.font;
        this.textAlign = s.textAlign;
        this.textBaseline = s.textBaseline;
        this.fillRule = s.fillRule;
        this.globalAlpha = s.globalAlpha;
        this._state.clip = s.clip;
    }

    // ---- 路径 ----
    beginPath() {
        this._segments = [];
        this._hasSubpath = false;
    }

    moveTo(x, y) {
        this._segments.push('M ' + this._fmt(x) + ' ' + this._fmt(y));
        this._hasSubpath = true;
    }

    lineTo(x, y) {
        this._segments.push('L ' + this._fmt(x) + ' ' + this._fmt(y));
    }

    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this._segments.push(
            'C ' + this._fmt(cp1x) + ' ' + this._fmt(cp1y) + ' ' +
            this._fmt(cp2x) + ' ' + this._fmt(cp2y) + ' ' + this._fmt(x) + ' ' + this._fmt(y)
        );
    }

    closePath() {
        this._segments.push('Z');
    }

    rect(x, y, w, h) {
        this.moveTo(x, y);
        this.lineTo(x + w, y);
        this.lineTo(x + w, y + h);
        this.lineTo(x, y + h);
        this.closePath();
    }

    _ellipsePoint(cx, cy, rx, ry, rot, angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        return {
            x: cx + rx * c * cr - ry * s * sr,
            y: cy + rx * c * sr + ry * s * cr,
        };
    }

    ellipse(cx, cy, rx, ry, rot, start, end) {
        // 画椭圆弧（canvas 默认顺时针）
        const sweep = end - start;
        if (Math.abs(sweep) >= Math.PI * 2 - 1e-6) {
            // 完整椭圆：两段半椭圆弧
            const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, 0);
            const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, Math.PI);
            this._segments.push(
                'M ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' 1 1 ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' 1 1 ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y)
            );
        } else {
            const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, start);
            const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, end);
            const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
            this._segments.push(
                'M ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' ' + largeArc + ' 1 ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y)
            );
        }
        this._hasSubpath = true;
    }

    arc(x, y, r, start, end, anticlockwise) {
        let sweep = end - start;
        if (anticlockwise) {
            if (sweep > 0) sweep -= Math.PI * 2;
        } else {
            if (sweep < 0) sweep += Math.PI * 2;
        }
        if (Math.abs(sweep) >= Math.PI * 2 - 1e-6) {
            // 完整圆：两段半圆弧
            const p0 = { x: x + r * Math.cos(start), y: y + r * Math.sin(start) };
            const p1 = { x: x - r * Math.cos(start), y: y - r * Math.sin(start) };
            const flag = sweep > 0 ? 1 : 0;
            this._segments.push(
                'M ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(r) + ' ' + this._fmt(r) + ' 0 1 ' + flag + ' ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y) +
                ' A ' + this._fmt(r) + ' ' + this._fmt(r) + ' 0 1 ' + flag + ' ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y)
            );
        } else {
            const p0 = { x: x + r * Math.cos(start), y: y + r * Math.sin(start) };
            const p1 = { x: x + r * Math.cos(end), y: y + r * Math.sin(end) };
            const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
            const sweepFlag = sweep > 0 ? 1 : 0;
            this._segments.push(
                'M ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(r) + ' ' + this._fmt(r) + ' 0 ' + largeArc + ' ' + sweepFlag + ' ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y)
            );
        }
        this._hasSubpath = true;
    }

    _d() {
        return this._segments.join(' ');
    }

    // ---- 填充 / 描边 ----
    fill() {
        if (!this._hasSubpath) return;
        const rule = this.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
        this._nodes.push(
            '<path d="' + this._d() + '" fill="' + SvgContext._esc(this.fillStyle) + '" fill-rule="' + rule + '" stroke="none" ' + this._attr() + '/>'
        );
    }

    stroke() {
        if (!this._hasSubpath) return;
        this._nodes.push(
            '<path d="' + this._d() + '" fill="none" stroke="' + SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this.lineWidth) + '" ' + this._attr() + '/>'
        );
    }

    _normalizeRect(x, y, w, h) {
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        return { x: this._fmt(x), y: this._fmt(y), w: this._fmt(w), h: this._fmt(h) };
    }

    fillRect(x, y, w, h) {
        const r = this._normalizeRect(x, y, w, h);
        this._nodes.push(
            '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="' + SvgContext._esc(this.fillStyle) + '" stroke="none" ' + this._attr() + '/>'
        );
    }

    strokeRect(x, y, w, h) {
        const r = this._normalizeRect(x, y, w, h);
        this._nodes.push(
            '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="none" stroke="' + SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this.lineWidth) + '" ' + this._attr() + '/>'
        );
    }

    // ---- 文本 ----
    _parseFont() {
        // 格式："italic bold 12px Arial" 之类
        const m = /([\d.]+)\s*px\s*(.+)/.exec(this.font || '');
        const size = m ? parseFloat(m[1]) : 12;
        const family = m ? m[2] : 'sans-serif';
        const style = /italic/.test(this.font) ? 'italic' : 'normal';
        const weight = /bold/.test(this.font) ? 'bold' : 'normal';
        return { size: this._fmt(size), family: SvgContext._esc(family), style, weight };
    }

    measureText(text) {
        // 粗测文本宽度（0.6 × 字号 × 字符数），用于对齐计算
        const m = /([\d.]+)\s*px/.exec(this.font || '');
        const size = m ? parseFloat(m[1]) : 12;
        return { width: size * 0.6 * String(text).length };
    }

    fillText(text, x, y) {
        const f = this._parseFont();
        const anchor = this.textAlign === 'right' ? 'end' : this.textAlign === 'center' ? 'middle' : 'start';
        const baseline = this.textBaseline === 'top' ? 'text-before-edge' : this.textBaseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
        this._nodes.push(
            '<text x="' + this._fmt(x) + '" y="' + this._fmt(y) + '" font-family="' + f.family + '" font-size="' + f.size + '"' +
            ' font-style="' + f.style + '" font-weight="' + f.weight + '"' +
            ' text-anchor="' + anchor + '" dominant-baseline="' + baseline + '"' +
            ' fill="' + SvgContext._esc(this.fillStyle) + '" stroke="none" ' + this._attr() + '>' + SvgContext._esc(text) + '</text>'
        );
    }

    // ---- 裁剪 ----
    clip() {
        if (!this._hasSubpath) return;
        this._clipCount++;
        const id = 'clip' + this._clipCount;
        this._defs.push('<clipPath id="' + id + '"><path d="' + this._d() + '"/></clipPath>');
        this._state.clip = 'url(#' + id + ')';
    }

    // ---- 位图 ----
    createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }

    putImageData() { /* 像素级输出暂不支持，drawImage 直接使用 canvas.toDataURL */ }

    drawImage(img, dx, dy, dw, dh) {
        // 浏览器环境：img 为真实 canvas，可序列化为 base64 PNG 内嵌到 SVG
        if (img && typeof img.toDataURL === 'function') {
            try {
                this._nodes.push(
                    '<image x="' + this._fmt(dx) + '" y="' + this._fmt(dy) + '" width="' + this._fmt(dw) + '" height="' + this._fmt(dh) + '"' +
                    ' href="' + img.toDataURL('image/png') + '" preserveAspectRatio="none" ' + this._attr() + '/>'
                );
                return;
            } catch (e) { /* fallthrough */ }
        }
        // 无法序列化时用灰色占位
        this._nodes.push(
            '<rect x="' + this._fmt(dx) + '" y="' + this._fmt(dy) + '" width="' + this._fmt(dw) + '" height="' + this._fmt(dh) + '" fill="#cccccc" ' + this._attr() + '/>'
        );
    }

    // ---- 序列化 ----
    getSvg() {
        const cw = this.canvas.width || 800;
        const ch = this.canvas.height || 600;
        // 还原逻辑显示尺寸（除以 dpr），viewBox 保持坐标空间不变
        const w = Math.round(cw / (this._scaleX || 1));
        const h = Math.round(ch / (this._scaleY || 1));
        const defs = this._defs.length
            ? '<defs>' + this._defs.join('') + '</defs>'
            : '';
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
            ' width="' + w + '" height="' + h + '" viewBox="0 0 ' + cw + ' ' + ch + '">\n' +
            defs + '\n' +
            this._nodes.join('\n') + '\n' +
            '</svg>\n'
        );
    }
}

module.exports = SvgContext;
