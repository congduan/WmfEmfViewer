// PDF export context: converts the drawer's Canvas 2D calls into a PDF content stream
// Extracted from the VSCode webview version; logic kept identical
(function () {
  'use strict';

  function PdfContext() {
    // The style object lets the drawer (baseDrawer.initCanvas) set CSS size without throwing
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
    this._ctm = [1, 0, 0, 1, 0, 0]; // PDF transform matrix [a, b, c, d, e, f]
    this._images = []; // embedded bitmap XObjects
  }

  PdfContext.prototype._formatNumber = function (value) {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  PdfContext.prototype._convertY = function (y) {
    return this.canvas.height - y;
  };

  // Transform logical coordinates through the CTM and flip to the PDF coordinate system (origin at bottom-left)
  PdfContext.prototype._pt = function (x, y) {
    const [a, b, c, d, e, f] = this._ctm;
    return {
      x: a * x + c * y + e,
      y: b * x + d * y + f
    };
  };

  // Transform + flip + format, ready for path/text operators
  PdfContext.prototype._emitPt = function (x, y) {
    const p = this._pt(x, y);
    return {
      x: this._formatNumber(p.x),
      y: this._formatNumber(this.canvas.height - p.y)
    };
  };

  PdfContext.prototype.scale = function (sx, sy) {
    const [a, b, c, d, e, f] = this._ctm;
    this._ctm = [a * sx, b * sx, c * sy, d * sy, e, f];
  };

  PdfContext.prototype.translate = function (tx, ty) {
    const [a, b, c, d, e, f] = this._ctm;
    this._ctm = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
  };

  PdfContext.prototype.rotate = function (angle) {
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
  };

  PdfContext.prototype._parseColor = function (style) {
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
    const rgbMatch = style.match(
      /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
    );
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10)
      };
    }
    return { r: 0, g: 0, b: 0 };
  };

  PdfContext.prototype._emitStrokeStyle = function () {
    const color = this._parseColor(this.strokeStyle);
    const r = this._formatNumber(color.r / 255);
    const g = this._formatNumber(color.g / 255);
    const b = this._formatNumber(color.b / 255);
    this._commands.push(`${r} ${g} ${b} RG`);
    this._commands.push(`${this._formatNumber(this.lineWidth)} w`);
  };

  PdfContext.prototype._emitFillStyle = function () {
    const color = this._parseColor(this.fillStyle);
    const r = this._formatNumber(color.r / 255);
    const g = this._formatNumber(color.g / 255);
    const b = this._formatNumber(color.b / 255);
    this._commands.push(`${r} ${g} ${b} rg`);
  };

  PdfContext.prototype._emitPath = function () {
    if (this._path.length > 0) {
      this._commands.push(this._path.join('\n'));
    }
  };

  PdfContext.prototype._resetPath = function () {
    this._path = [];
    this._currentPoint = null;
  };

  PdfContext.prototype.beginPath = function () {
    this._resetPath();
  };

  PdfContext.prototype.closePath = function () {
    this._path.push('h');
  };

  PdfContext.prototype.moveTo = function (x, y) {
    const p = this._emitPt(x, y);
    this._path.push(`${p.x} ${p.y} m`);
    this._currentPoint = { x, y };
  };

  PdfContext.prototype.lineTo = function (x, y) {
    const p = this._emitPt(x, y);
    this._path.push(`${p.x} ${p.y} l`);
    this._currentPoint = { x, y };
  };

  PdfContext.prototype.rect = function (x, y, w, h) {
    const p1 = this._emitPt(x, y + h);
    const p2 = this._emitPt(x + w, y);
    this._path.push(
      `${p1.x} ${p1.y} ${this._formatNumber(p2.x - p1.x)} ${this._formatNumber(p2.y - p1.y)} re`
    );
    this._currentPoint = { x: x + w, y: y + h };
  };

  PdfContext.prototype._bezierTo = function (cp1x, cp1y, cp2x, cp2y, x, y) {
    const p1 = this._emitPt(cp1x, cp1y);
    const p2 = this._emitPt(cp2x, cp2y);
    const p = this._emitPt(x, y);
    this._path.push(`${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p.x} ${p.y} c`);
    this._currentPoint = { x, y };
  };

  PdfContext.prototype.bezierCurveTo = function (
    cp1x,
    cp1y,
    cp2x,
    cp2y,
    x,
    y
  ) {
    this._bezierTo(cp1x, cp1y, cp2x, cp2y, x, y);
  };

  PdfContext.prototype.quadraticCurveTo = function (cpx, cpy, x, y) {
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
  };

  PdfContext.prototype.arc = function (
    cx,
    cy,
    r,
    startAngle,
    endAngle,
    anticlockwise
  ) {
    this._arcToBezier(cx, cy, r, r, 0, startAngle, endAngle, anticlockwise);
  };

  PdfContext.prototype.ellipse = function (
    cx,
    cy,
    rx,
    ry,
    rotation,
    startAngle,
    endAngle,
    anticlockwise
  ) {
    this._arcToBezier(
      cx,
      cy,
      rx,
      ry,
      rotation,
      startAngle,
      endAngle,
      anticlockwise
    );
  };

  PdfContext.prototype._arcToBezier = function (
    cx,
    cy,
    rx,
    ry,
    rotation,
    startAngle,
    endAngle,
    anticlockwise
  ) {
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
        cx,
        cy,
        rotation,
        x1,
        y1,
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        x2,
        y2
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
        rotated.cp1x,
        rotated.cp1y,
        rotated.cp2x,
        rotated.cp2y,
        rotated.x2,
        rotated.y2
      );
      angle = angle2;
    }
  };

  PdfContext.prototype._applyRotation = function (
    cx,
    cy,
    rotation,
    x1,
    y1,
    cp1x,
    cp1y,
    cp2x,
    cp2y,
    x2,
    y2
  ) {
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
    return {
      x1: p1.x,
      y1: p1.y,
      cp1x: c1.x,
      cp1y: c1.y,
      cp2x: c2.x,
      cp2y: c2.y,
      x2: p2.x,
      y2: p2.y
    };
  };

  PdfContext.prototype.fill = function () {
    this._emitPath();
    this._emitFillStyle();
    this._commands.push(this.fillRule === 'evenodd' ? 'f*' : 'f');
    this._resetPath();
  };

  PdfContext.prototype.stroke = function () {
    this._emitPath();
    this._emitStrokeStyle();
    this._commands.push('S');
    this._resetPath();
  };

  PdfContext.prototype.clip = function () {
    this._emitPath();
    this._commands.push(this.fillRule === 'evenodd' ? 'W*' : 'W');
    this._commands.push('n');
    this._resetPath();
  };

  PdfContext.prototype.fillRect = function (x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  };

  PdfContext.prototype.strokeRect = function (x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
  };

  PdfContext.prototype.save = function () {
    this._commands.push('q');
    this._stateStack.push({
      strokeStyle: this.strokeStyle,
      fillStyle: this.fillStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      fillRule: this.fillRule,
      ctm: this._ctm.slice()
    });
  };

  PdfContext.prototype.restore = function () {
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
  };

  PdfContext.prototype.measureText = function (text) {
    const size = this._getFontSize();
    return { width: size * 0.6 * text.length };
  };

  PdfContext.prototype._getFontSize = function () {
    const match = this.font.match(/(\d+(?:\.\d+)?)px/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return 12;
  };

  PdfContext.prototype.fillText = function (text, x, y) {
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
  };

  // Bitmap output: supports a real canvas or an {width, height, data} ImageData,
  // converted to RGB and embedded as a PDF image XObject (alpha composited on white)
  PdfContext.prototype.drawImage = function (img, dx, dy, dw, dh) {
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
      // Fall back to a gray placeholder when pixels can't be read, so export doesn't crash
      const prev = this.fillStyle;
      this.fillStyle = '#cccccc';
      this.fillRect(dx, dy, dw || width, dh || height);
      this.fillStyle = prev;
      return;
    }

    // RGBA → RGB (composited on white)
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      const a = data[i + 3] / 255;
      rgb[j] = Math.round(data[i] * a + 255 * (1 - a));
      rgb[j + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
      rgb[j + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    }
    this._images.push({ width, height, data: rgb });
    const index = this._images.length;

    // Destination rectangle placed in PDF coordinates via the CTM
    const tl = this._pt(dx, dy);
    const br = this._pt(dx + (dw || width), dy + (dh || height));
    const llx = this._formatNumber(Math.min(tl.x, br.x));
    const lly = this._formatNumber(
      this.canvas.height - Math.max(tl.y, br.y)
    );
    const w = this._formatNumber(Math.abs(br.x - tl.x));
    const h = this._formatNumber(Math.abs(br.y - tl.y));
    this._commands.push(
      `q ${llx} ${lly} ${w} 0 0 ${h} cm /Im${index} Do Q`
    );
  };

  PdfContext.prototype.buildPdf = function () {
    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;
    const contentStream = this._commands.join('\n') + '\n';
    return buildPdfFromContent(contentStream, width, height, this._images);
  };

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

    // Image objects contain binary streams — write raw bytes (TextEncoder would corrupt bytes > 127)
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
    addObject(
      2,
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    );

    const imageObjStart = 6;
    const xobjectDict =
      imageList.length > 0
        ? ' /XObject << ' +
          imageList
            .map((_, i) => `/Im${i + 1} ${imageObjStart + i} 0 R`)
            .join(' ') +
          ' >>'
        : '';
    const pageDict = `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >>${xobjectDict} >> /MediaBox [0 0 ${width} ${height}] /Contents 5 0 R >>`;
    addObject(3, encoder.encode(pageDict));

    const fontDict =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    addObject(4, encoder.encode(fontDict));

    const contentHeader = `<< /Length ${contentStream.length} >>\nstream\n`;
    const contentFooter = '\nendstream';
    addObject(
      5,
      encoder.encode(contentHeader + contentStream + contentFooter)
    );

    imageList.forEach((img, i) => addImageObject(imageObjStart + i, img));

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

  // Export as a global variable (consistent with metafileParser.browser.js style)
  window.PdfContext = PdfContext;
  window.buildPdfFromContent = buildPdfFromContent;
})();
