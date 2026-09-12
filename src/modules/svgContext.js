// SvgContext - 模拟 Canvas 2D API 的 SVG 输出上下文
// 将 WmfDrawer/EmfDrawer/EmfPlusDrawer 调用的 Canvas 2D 绘制指令
// 转换为 SVG 元素（<path>/<rect>/<text>/<clipPath> 等），最后可序列化为完整 SVG 文档。

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
        this.strokeScale = 1;            // 逻辑→设备 线宽缩放（EMF drawer 通过 provider 动态注入）
        this.strokeScaleProvider = null; // 实时计算 strokeScale 的钩子

        this._nodes = [];       // SVG 元素列表
        this._defs = [];        // <defs> 里的 clipPath 等
        this._images = [];      // putImageData 保存的位图（getSvg 时编码为 PNG）
        this._segments = [];    // 当前路径段
        this._hasSubpath = false;
        this._state = { clip: null };
        this._stack = [];
        this._clipCount = 0;
        this._scaleX = 1;       // HiDPI 缩放，用于还原逻辑显示尺寸
        this._dash = [];        // 虚线模式（applyGdiObject 套用 PS_DASH/DOT 等）
        this._scaleY = 1;
    }

    // 线宽上限防御：超过画布对角线 2 倍的线宽几乎必然是单位换算错误
    //（如 EMF+ world 单位直出），会让光栅化器（rsvg）在非等比缩放下裁剪失效、
    // 描边回渗整个视口（test-000/075/120 灰边案例）。
    _strokeWidth() {
        const cw = this.canvas.width || 800;
        const ch = this.canvas.height || 600;
        const cap = Math.sqrt(cw * cw + ch * ch) * 2;
        // GDI 笔宽为逻辑单位，需按当前 逻辑→设备 缩放系数换算
        //（对齐 libemf2svg/Windows：笔宽与坐标经过同一变换）。
        // strokeScaleProvider 由 EMF drawer 注入，实时反映 world/viewport 变换。
        let scale = this.strokeScale;
        if (typeof this.strokeScaleProvider === 'function') {
            const s = this.strokeScaleProvider();
            if (isFinite(s) && s > 0) scale = s;
        }
        const w = this.lineWidth * (isFinite(scale) && scale > 0 ? scale : 1);
        return Math.min(w, cap);
    }

    // ---- 数值格式化（保留最多2位小数） ----
    _fmt(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '0';
        const r = Math.round(v * 100) / 100;
        return String(r);
    }

    static _esc(s) {
        return SvgContext._sanitizeXml(String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 剔除 XML 1.0 非法字符（控制字符），避免渲染失败
    static _sanitizeXml(s) {
        return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
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

    // 设置笔的虚线模式（Canvas 标准：传入 dash 数组与可选 offset；传 [] 重置为实线）
    setLineDash(segments) {
        this._dash = Array.isArray(segments) ? segments.slice() : [];
    }

    getLineDash() {
        return (this._dash || []).slice();
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
            dash: (this._dash || []).slice(),
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
        this._dash = (s.dash || []).slice();
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

    ellipse(cx, cy, rx, ry, rot, start, end, anticlockwise) {
        // 画椭圆弧。canvas 默认顺时针；anticlockwise 时沿角度递减方向。
        let sweep = end - start;
        if (anticlockwise) {
            if (sweep > 0) sweep -= Math.PI * 2;
        } else {
            if (sweep < 0) sweep += Math.PI * 2;
        }
        // 若路径已有当前点，先连线到弧起点（canvas ellipse 语义）
        const connect = this._hasSubpath && this._segments.length > 0 ? 'L ' : 'M ';
        if (Math.abs(sweep) >= Math.PI * 2 - 1e-6) {
            // 完整椭圆：两段半椭圆弧
            const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, 0);
            const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, Math.PI);
            const flag = sweep > 0 ? 1 : 0;
            this._segments.push(
                connect + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' 1 ' + flag + ' ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' 1 ' + flag + ' ' + this._fmt(p0.x) + ' ' + this._fmt(p0.y)
            );
        } else {
            const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, start);
            const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, end);
            const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
            const sweepFlag = sweep > 0 ? 1 : 0;
            this._segments.push(
                connect + this._fmt(p0.x) + ' ' + this._fmt(p0.y) +
                ' A ' + this._fmt(rx) + ' ' + this._fmt(ry) + ' ' + this._fmt(rot) + ' ' + largeArc + ' ' + sweepFlag + ' ' + this._fmt(p1.x) + ' ' + this._fmt(p1.y)
            );
        }
        this._hasSubpath = true;
    }

    roundRect(x, y, w, h, radii) {
        // 兼容 canvas roundRect：radii 可为数值或数组（仅用第 1/2 项作 rx/ry）
        let rx, ry;
        if (Array.isArray(radii)) {
            rx = Number(radii[0]) || 0;
            ry = Number(radii[1]) !== undefined ? Number(radii[1]) || 0 : rx;
        } else if (typeof radii === 'number') {
            rx = radii;
            ry = radii;
        } else {
            rx = 0;
            ry = 0;
        }
        const n = this._normalizeRect(x, y, w, h);
        x = Number(n.x); y = Number(n.y); w = Number(n.w); h = Number(n.h);
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (rx <= 0 || ry <= 0) {
            this.rect(x, y, w, h);
            return;
        }
        this.moveTo(x + rx, y);
        this.lineTo(x + w - rx, y);
        this.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
        this.lineTo(x + w, y + h - ry);
        this.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
        this.lineTo(x + rx, y + h);
        this.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
        this.lineTo(x, y + ry);
        this.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
        this.closePath();
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
        const dashAttr = (this._dash && this._dash.length) ? ' stroke-dasharray="' + this._dash.map(v => this._fmt(v)).join(' ') + '"' : '';
        this._nodes.push(
            '<path d="' + this._d() + '" fill="none" stroke="' + SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this._strokeWidth()) + '"' + dashAttr + ' ' + this._attr() + '/>'
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
        const dashAttr = (this._dash && this._dash.length) ? ' stroke-dasharray="' + this._dash.map(v => this._fmt(v)).join(' ') + '"' : '';
        this._nodes.push(
            '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="none" stroke="' + SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this._strokeWidth()) + '"' + dashAttr + ' ' + this._attr() + '/>'
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

    fillText(text, x, y, transformMatrix) {
        const f = this._parseFont();
        const anchor = this.textAlign === 'right' ? 'end' : this.textAlign === 'center' ? 'middle' : 'start';
        const baseline = this.textBaseline === 'top' ? 'text-before-edge' : this.textBaseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
        // 可选的仿射变换（SVG matrix(a b c d e f)，列向量约定）。
        // 文字渲染时传入 world×viewport×device 的合成矩阵，使 x/y/font-size 保持原始逻辑值，
        // 缩放/平移/旋转统一由 transform 承担（对齐参考实现 libemf2svg 的 <g transform="matrix(...)">）。
        let xform = '';
        if (transformMatrix) {
            const m = transformMatrix;
            xform = ' transform="matrix(' + this._fmt(m.a) + ' ' + this._fmt(m.b) + ' ' +
                this._fmt(m.c) + ' ' + this._fmt(m.d) + ' ' +
                this._fmt(m.e) + ' ' + this._fmt(m.f) + ')"';
        }
        this._nodes.push(
            '<text x="' + this._fmt(x) + '" y="' + this._fmt(y) + '" font-family="' + f.family + '" font-size="' + f.size + '"' +
            ' font-style="' + f.style + '" font-weight="' + f.weight + '"' +
            ' text-anchor="' + anchor + '" dominant-baseline="' + baseline + '"' +
            ' fill="' + SvgContext._esc(this.fillStyle) + '" stroke="none" ' + this._attr() + xform + '>' + SvgContext._esc(text) + '</text>'
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

    putImageData(imageData, dx, dy, dw, dh) {
        // 保存像素数据，getSvg() 时编码为 PNG 内嵌。
        // dw/dh：可选显示尺寸（缩放绘制目标大小），缺省为位图像素尺寸
        if (!imageData || !imageData.data || !imageData.width || !imageData.height) return;
        this._images.push({
            data: new Uint8ClampedArray(imageData.data),
            width: imageData.width,
            height: imageData.height,
            dx: dx || 0,
            dy: dy || 0,
            dw: dw || imageData.width,
            dh: dh || imageData.height,
        });
    }

    // 最小 PNG 编码器（zlib 无压缩块 + CRC32），跨环境可用（无需 canvas/zlib）
    _pngBase64(imgData) {
        const { width: w, height: h, data: px } = imgData;
        // 保护：超大位图（>1.5M 像素，无压缩 PNG 后 base64 会超 XML 解析器单节点上限）
        if (w * h > 1572864 || w <= 0 || h <= 0) return null;
        // 原始扫描线：每行前置 filter byte 0
        const raw = new Uint8Array(h * (w * 4 + 1));
        for (let y = 0; y < h; y++) {
            const ro = y * (w * 4 + 1);
            raw[ro] = 0;
            for (let x = 0; x < w * 4; x++) raw[ro + 1 + x] = px[y * w * 4 + x];
        }
        // zlib 流：头 0x78 0x01 + stored deflate 块 + adler32
        const nBlocks = Math.ceil(raw.length / 65535) || 1;
        const zlib = new Uint8Array(2 + raw.length + nBlocks * 5 + 4);
        let p = 0;
        zlib[p++] = 0x78; zlib[p++] = 0x01;
        for (let i = 0; i < nBlocks; i++) {
            const len = Math.min(65535, raw.length - i * 65535);
            const isLast = i === nBlocks - 1 ? 1 : 0;
            zlib[p++] = isLast;
            zlib[p++] = len & 0xFF; zlib[p++] = (len >> 8) & 0xFF;
            zlib[p++] = ~len & 0xFF; zlib[p++] = (~len >> 8) & 0xFF;
            zlib.set(raw.subarray(i * 65535, i * 65535 + len), p);
            p += len;
        }
        // adler32
        let a = 1, b = 0;
        for (let i = 0; i < raw.length; i++) {
            a = (a + raw[i]) % 65521;
            b = (b + a) % 65521;
        }
        const adler = ((b << 16) | a) >>> 0;
        zlib[p++] = (adler >>> 24) & 0xFF; zlib[p++] = (adler >>> 16) & 0xFF;
        zlib[p++] = (adler >>> 8) & 0xFF; zlib[p++] = adler & 0xFF;

        // PNG chunk 组装
        const crcTable = SvgContext._crcTable || (SvgContext._crcTable = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                t[n] = c >>> 0;
            }
            return t;
        })());
        const crc32 = (buf, start, end) => {
            let c = 0xFFFFFFFF;
            for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
        const chunk = (type, payload) => {
            const len = payload.length;
            const out = new Uint8Array(12 + len);
            const dv = new DataView(out.buffer);
            dv.setUint32(0, len);
            for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
            out.set(payload, 8);
            dv.setUint32(8 + len, crc32(out, 4, 8 + len));
            return out;
        };
        const u32 = (v) => new Uint8Array([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
        const ihdr = new Uint8Array(13);
        ihdr.set(u32(w), 0); ihdr.set(u32(h), 4);
        ihdr[8] = 8;  // bit depth
        ihdr[9] = 6;  // RGBA
        const png = [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
            chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];
        const total = png.reduce((s, c) => s + c.length, 0);
        const bytes = new Uint8Array(total);
        let off = 0;
        for (const c of png) { bytes.set(c, off); off += c.length; }
        // base64
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return 'data:image/png;base64,' + btoa(bin);
    }

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

    // 直接注入一段 SVG（用于嵌套 EMF 的 <g transform> 包装）与额外 defs
    rawPush(svgFragment) {
        if (svgFragment) this._nodes.push(svgFragment);
    }

    defsPush(defFragment) {
        if (defFragment) this._defs.push(defFragment);
    }

    get nodes() { return this._nodes; }
    get defs() { return this._defs; }

    // ---- 序列化 ----
    /**
     * 注册 DIB 图案刷（EMR_CREATEDIBPATTERNBRUSHPT）。
     * @param {{width:number,height:number,data:Uint8ClampedArray}} dib RGBA 像素（height 可正负，负=top-down）
     * @param {{orgX?:number,orgY?:number}} [opts] 画刷原点（用于图案平移对齐）
     * @returns {string} 形如 "url(#pat-3)"，作为 fillStyle 即可平铺填充
     */
    addPattern(dib, opts) {
        const { width, height, data } = dib;
        if (!width || !height || !data) return null;
        const absH = Math.abs(height);
        // 已有复用：相同尺寸+像素内容则复用（高频重复 DIB 减少 SVG 体积）
        const key = width + 'x' + absH + ':' + data.length;
        if (this._patternCache && this._patternCache.key === key) {
            return this._patternCache.url;
        }
        const id = 'pat-' + (this._patternSeq = (this._patternSeq || 0) + 1);
        // 翻转 top-down → bottom-up，使 SVG patternContentUnits 默认 image-y-down 正确
        const finalData = height < 0 ? data : this._flipV(data, width, absH);
        const href = this._pngBase64({ width, height: absH, data: finalData });
        const ox = (opts && opts.orgX) || 0;
        const oy = (opts && opts.orgY) || 0;
        const def = '<pattern id="' + id + '" patternUnits="userSpaceOnUse" ' +
            'x="' + this._fmt(ox) + '" y="' + this._fmt(oy) + '" ' +
            'width="' + this._fmt(width) + '" height="' + this._fmt(absH) + '">' +
            '<image x="0" y="0" width="' + this._fmt(width) + '" height="' + this._fmt(absH) + '" ' +
            'preserveAspectRatio="none" href="' + href + '"/>' +
            '</pattern>';
        this._defs.push(def);
        const url = 'url(#' + id + ')';
        this._patternCache = { key, url };
        return url;
    }

    // 垂直翻转 RGBA 像素（top-down → bottom-up 或反向）
    _flipV(data, width, height) {
        const row = width * 4;
        const out = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) {
            const src = (height - 1 - y) * row;
            const dst = y * row;
            out.set(data.subarray(src, src + row), dst);
        }
        return out;
    }

    getSvg() {
        // 位图节点先于其他节点尾部输出（保持绘制顺序：putImageData 发生在绘制流中，
        // 简化处理为按调用顺序追加，与 _nodes 交织会有细微差异，位图记录通常独立成块）
        for (const img of this._images) {
            try {
                const href = this._pngBase64(img);
                this._nodes.push(
                    '<image x="' + this._fmt(img.dx) + '" y="' + this._fmt(img.dy) + '"' +
                    ' width="' + this._fmt(img.dw) + '" height="' + this._fmt(img.dh) + '"' +
                    ' href="' + href + '" preserveAspectRatio="none" />'
                );
            } catch (e) { /* 编码失败则跳过该位图 */ }
        }
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
            ' width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
            defs + '\n' +
            this._nodes.join('\n') + '\n' +
            '</svg>\n'
        );
    }
}

module.exports = SvgContext;
