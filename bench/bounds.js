// Stage 0 基准线之一：EMF「记录自带真值」几何一致性基准。
//
// 原理：每条 EMR 记录头里都有 rclBounds（记录头偏移 0..16，设备单位），它是生成该
// 元文件的 Windows DC 播放这条记录时的输出包围盒。因此**不需要任何外部参考图**，
// 元文件本身就给出了"Windows 画出来的框"，可以直接和我们的绘制结果比较。
//
// 坐标：emfDrawer 把画布定义为设备空间 1:1（device - header.rclBounds 原点），
// 所以 设备坐标 → 画布坐标 只需平移 (-bounds.left, -bounds.top)。
//
// 度量：
//   miss      —— 记录有 rclBounds，我们一个像素都没画（覆盖缺口）
//   IoU       —— 我们的包围盒与 rclBounds 的交并比
//   dCx/dCy   —— 包围盒中心偏移（px）
//   dTop/fs   —— 文本记录专用：rclBounds.top 与"我们假设的字形顶"之差 / 字号，
//                用于暴露基线语义（GDI 参考点是字符格顶部）的系统性偏差
//
// 用法：
//   node bench/bounds.js                       # 默认扫描 test_files 下全部 EMF
//   node bench/bounds.js --dir test_files/emf-corpus/emf-ea
//   node bench/bounds.js --file test_files/example.emf --verbose
//   node bench/bounds.js --json out/bench/bounds.json
//
// 注意：本基准比较的是**几何**，不解码像素，也不替代像素级真值（见 bench/README 说明）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MetafileParser = require(path.join(ROOT, 'src/utils/metafileParser.js'));
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));
const EmfDrawer = require(path.join(ROOT, 'src/modules/drawers/emfDrawer.js'));

// ---- 会产生输出的记录类型（其余记录（状态/对象/裁剪）即使带 rclBounds 也不参与统计）
const DRAW_TYPES = new Set([
  0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, // POLYBEZIER / POLYGON / POLYLINE / *TO / POLYPOLY*
  0x0F,                                     // SETPIXELV
  0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E, 0x2F, // ANGLEARC / ELLIPSE / RECTANGLE / ROUNDRECT / ARC / CHORD / PIE
  0x35, 0x36, 0x37, 0x38,                   // EXTFLOODFILL / LINETO / ARCTO / POLYDRAW
  0x3E, 0x3F, 0x40,                         // FILLPATH / STROKEANDFILLPATH / STROKEPATH
  0x47, 0x48, 0x49, 0x4A,                   // FILLRGN / FRAMERGN / INVERTRGN / PAINTRGN
  0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51,       // BITBLT / STRETCHBLT / MASKBLT / PLGBLT / SETDIBITSTODEVICE / STRETCHDIBITS
  0x53, 0x54, 0x60, 0x61, 0x6C,             // EXTTEXTOUTA/W / POLYTEXTOUTA/W / SMALLTEXTOUT
  0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, // 16 位点数组变体
  0x72, 0x74, 0x75, 0x76,                   // ALPHABLEND / TRANSPARENTBLT / TRANSPARENTDIB / GRADIENTFILL
]);

const TEXT_TYPES = new Set([0x53, 0x54, 0x60, 0x61, 0x6C]);

// 位图类记录的 rclBounds **不是**输出的墨迹包围盒：GDI 在这里写的是与源位图/ROP
// 相关的包围盒，实测与最终落点可以差一个图像高度（如 test-031 的 STRETCHBLT：
// ref 高 3px、实际绘制 437px，而项目已用参考渲染验证过该行为是正确的）。
// 因此这类记录只统计「画没画」，不参与 IoU/中心偏移聚合，避免误报。
const LOOSE_BOUNDS_TYPES = new Set([
    0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x72, 0x74, 0x75,
]);

const readLong = (d, o) =>
  (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24));

// ---- 参数 ----
function parseArgs(argv) {
  const args = {
    dirs: [], files: [], json: null, verbose: false, limit: 0, types: null,
    includeSuspects: false, backend: 'svg', svgMetrics: 'estimate',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') args.dirs.push(argv[++i]);
    else if (a === '--file') args.files.push(argv[++i]);
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--type') args.types = new Set(argv[++i].split(',').map((s) => parseInt(s, 16) || parseInt(s, 10)));
    else if (a === '--include-suspects') args.includeSuspects = true;
    else if (a === '--backend') args.backend = argv[++i];
    else if (a === '--svg-metrics') args.svgMetrics = argv[++i];
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (!a.startsWith('-')) args.dirs.push(a);
    else throw new Error('未知参数: ' + a);
  }
  if (!args.dirs.length && !args.files.length) args.dirs.push('test_files');
  return args;
}

function collectFiles(args) {
  const out = args.files.map((f) => path.resolve(f));
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.emf$/i.test(ent.name)) out.push(p);
    }
  };
  for (const d of args.dirs) walk(path.resolve(d));
  return args.limit > 0 ? out.slice(0, args.limit) : out;
}

// ---- 几何记录代理：拦截 Canvas2D 绘制调用，累计本条记录的设备坐标包围盒 ----
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function fontPx(font) {
  const m = /([\d.]+)\s*px/.exec(font || '');
  return m ? parseFloat(m[1]) : 12;
}

class GeometryTracker {
  constructor(ctx) {
    this.raw = ctx;
    this.ctm = { ...IDENTITY };
    this.saved = [];
    this.pathBox = null;
    this.box = null;
    this.lastText = null;
    // 钩子对象的方法需要访问 tracker 实例（它们会被 Proxy 取到并脱离 this 调用）
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const hooks = {
      save() { self.saved.push({ ...self.ctm }); self.raw.save(); },
      restore() { const m = self.saved.pop(); if (m) self.ctm = m; self.raw.restore(); },
      translate(x, y) { self.raw.translate(x, y); self._concat({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }); },
      scale(sx, sy) { self.raw.scale(sx, sy); self._concat({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }); },
      rotate(ang) {
        self.raw.rotate(ang);
        const c = Math.cos(ang), s = Math.sin(ang);
        self._concat({ a: c, b: s, c: -s, d: c, e: 0, f: 0 });
      },
      transform(a, b, c, d, e, f) { self.raw.transform(a, b, c, d, e, f); self._concat({ a, b, c, d, e, f }); },
      setTransform(a, b, c, d, e, f) {
        self.raw.setTransform(a, b, c, d, e, f);
        self.ctm = typeof a === 'object' && a ? { ...IDENTITY, ...a } : { a, b, c, d, e, f };
      },
      resetTransform() { self.raw.resetTransform(); self.ctm = { ...IDENTITY }; },

      beginPath() { self.raw.beginPath(); self.pathBox = null; },
      moveTo(x, y) { self.raw.moveTo(x, y); self._addPoint(x, y); },
      lineTo(x, y) { self.raw.lineTo(x, y); self._addPoint(x, y); },
      bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
        self.raw.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
        // 控制点包围盒 ⊇ 曲线包围盒（保守，不低估）
        self._addPoint(c1x, c1y); self._addPoint(c2x, c2y); self._addPoint(x, y);
      },
      quadraticCurveTo(cx, cy, x, y) {
        self.raw.quadraticCurveTo(cx, cy, x, y);
        self._addPoint(cx, cy); self._addPoint(x, y);
      },
      arcTo(x1, y1, x2, y2, r) { self.raw.arcTo(x1, y1, x2, y2, r); self._addPoint(x1, y1); self._addPoint(x2, y2); },
      // 原生 Canvas2D 的 arc/ellipse 参数是必填的，少传会抛 TypeError → 记录变 miss。
      // 必须原样透传全部实参。
      arc(x, y, r, s, e, ccw) { self.raw.arc(x, y, r, s, e, ccw); self._addRawBox(x - r, y - r, x + r, y + r); },
      ellipse(cx, cy, rx, ry, rot, s, e, ccw) {
        self.raw.ellipse(cx, cy, rx, ry, rot, s, e, ccw);
        self._addRawBox(cx - Math.abs(rx), cy - Math.abs(ry), cx + Math.abs(rx), cy + Math.abs(ry));
      },
      rect(x, y, w, h) { self.raw.rect(x, y, w, h); self._addRectPath(x, y, w, h); },
      roundRect(x, y, w, h, radii) { self.raw.roundRect(x, y, w, h, radii); self._addRectPath(x, y, w, h); },
      closePath() { self.raw.closePath(); },

      fill() {
        self.raw.fill();
        if (self.pathBox) self._addRawBox(self.pathBox.x0, self.pathBox.y0, self.pathBox.x1, self.pathBox.y1);
      },
      stroke() {
        self.raw.stroke();
        if (self.pathBox) {
          // 描边会向外扩 lineWidth/2（GDI 笔宽以路径为中心）
          const lw = Number(self.raw.lineWidth) || 1;
          const h = lw / 2;
          self._addRawBox(self.pathBox.x0 - h, self.pathBox.y0 - h, self.pathBox.x1 + h, self.pathBox.y1 + h);
        }
      },
      fillRect(x, y, w, h) { self.raw.fillRect(x, y, w, h); self._addRectPath(x, y, w, h); },
      strokeRect(x, y, w, h) { self.raw.strokeRect(x, y, w, h); self._addRectPath(x, y, w, h); },
      clearRect(x, y, w, h) { self.raw.clearRect(x, y, w, h); self._addRectPath(x, y, w, h); },

      fillText(text, x, y, transformMatrix) {
        self._addText(text, x, y, transformMatrix);
        self.raw.fillText(text, x, y, transformMatrix);
      },
      strokeText(text, x, y, transformMatrix) {
        self._addText(text, x, y, transformMatrix);
        self.raw.strokeText(text, x, y, transformMatrix);
      },

      drawImage(img, ...rest) {
        self.raw.drawImage(img, ...rest);
        const [dx, dy, dw, dh] = [rest[0] || 0, rest[1] || 0, rest[2], rest[3]];
        const w = dw === undefined ? (img && img.width) || 0 : dw;
        const h = dh === undefined ? (img && img.height) || 0 : dh;
        self._addRawBox(dx, dy, dx + w, dy + h);
      },
      putImageData(imgData, ...rest) {
        self.raw.putImageData(imgData, ...rest);
        const [dx, dy, dw, dh] = [rest[0] || 0, rest[1] || 0, rest[2], rest[3]];
        const w = dw === undefined ? (imgData && imgData.width) || 0 : dw;
        const h = dh === undefined ? (imgData && imgData.height) || 0 : dh;
        self._addRectPath(dx, dy, w, h);
      },
    };

    this.hooks = hooks;
    this.proxy = new Proxy(ctx, {
      get(target, prop) {
        if (Object.prototype.hasOwnProperty.call(hooks, prop)) return hooks[prop];
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value, target); },
      has(target, prop) { return Reflect.has(target, prop); },
    });
  }

  // ---- 变换 ----
  _concat(m) {
    const c = this.ctm;
    this.ctm = {
      a: c.a * m.a + c.c * m.b,
      b: c.b * m.a + c.d * m.b,
      c: c.a * m.c + c.c * m.d,
      d: c.b * m.c + c.d * m.d,
      e: c.a * m.e + c.c * m.f + c.e,
      f: c.b * m.e + c.d * m.f + c.f,
    };
  }

  _apply(x, y) {
    const m = this.ctm;
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  // ---- 累计 ----
  begin() {
    // pathBox **不**按记录重置：GDI 路径跨记录累积（BeginPath … POLYGON16 … FILLPATH），
    // FILLPATH 记录本身只调 fill()，路径点来自前面的记录。按记录重置会把所有
    // FILLPATH/STROKEPATH 误判为「我们没画」。
    this.box = null;
  }

  end() {
    const b = this.box;
    this.box = null;
    return b; // pathBox 保留：见 begin()
  }

  _grow(x0, y0, x1, y1) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
    if (!this.box) this.box = { x0, y0, x1, y1 };
    else {
      if (x0 < this.box.x0) this.box.x0 = x0;
      if (y0 < this.box.y0) this.box.y0 = y0;
      if (x1 > this.box.x1) this.box.x1 = x1;
      if (y1 > this.box.y1) this.box.y1 = y1;
    }
  }

  _addRawBox(x0, y0, x1, y1) {
    const a = this._apply(Math.min(x0, x1), Math.min(y0, y1));
    const b = this._apply(Math.max(x0, x1), Math.max(y0, y1));
    const c = this._apply(Math.min(x0, x1), Math.max(y0, y1));
    const d = this._apply(Math.max(x0, x1), Math.min(y0, y1));
    this._grow(
      Math.min(a.x, b.x, c.x, d.x), Math.min(a.y, b.y, c.y, d.y),
      Math.max(a.x, b.x, c.x, d.x), Math.max(a.y, b.y, c.y, d.y)
    );
  }

  _addLocalBox(x0, y0, x1, y1) {
    this._addRawBox(x0, y0, x1, y1);
  }

  _addPoint(x, y) {
    const p = this._apply(x, y);
    if (!this.pathBox) this.pathBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    else {
      if (p.x < this.pathBox.x0) this.pathBox.x0 = p.x;
      if (p.y < this.pathBox.y0) this.pathBox.y0 = p.y;
      if (p.x > this.pathBox.x1) this.pathBox.x1 = p.x;
      if (p.y > this.pathBox.y1) this.pathBox.y1 = p.y;
    }
  }

  _addRectPath(x, y, w, h) {
    this._addRawBox(x, y, x + w, y + h);
    this._addPoint(x, y);
    this._addPoint(x + w, y + h);
  }

  // 文本包围盒：按当前 font / textAlign / textBaseline 推断（就是我们的渲染假设），
  // 再换算到设备坐标。width 依赖 measureText（SvgContext 为 0.6em 估算），
  // 故宽度类指标仅供参考；dTop 与字号之比与宽度无关，是可靠信号。
  _addText(text, x, y, transformMatrix) {
    const fsPx = fontPx(this.raw.font);
    const align = this.raw.textAlign || 'start';
    const baseline = this.raw.textBaseline || 'alphabetic';
    let w = 0;
    try { w = (this.raw.measureText(String(text)).width) || 0; } catch (_) { w = 0; }
    let x0 = x;
    if (align === 'center') x0 = x - w / 2;
    else if (align === 'right' || align === 'end') x0 = x - w;

    let top, bottom;
    if (baseline === 'top' || baseline === 'hanging' || baseline === 'text-before-edge') { top = y; bottom = y + fsPx; }
    else if (baseline === 'bottom' || baseline === 'text-after-edge') { top = y - fsPx; bottom = y; }
    else if (baseline === 'middle') { top = y - fsPx / 2; bottom = y + fsPx / 2; }
    else { top = y - 0.8 * fsPx; bottom = y + 0.2 * fsPx; } // alphabetic：ascent/descent 近似

    this._addRawBox(x0, top, x0 + w, bottom);
    this.lastText = { fs: fsPx, rotated: !!(transformMatrix && (transformMatrix.rotate || transformMatrix.escapement)) };
  }
}

// ---- 统计工具 ----
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

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

// ---- 绘制后端 ----
// svg   : SvgContext（纯 JS，零依赖；measureText 为 0.6em 估算，文本宽度不可信）
// canvas: @napi-rs/canvas（原生 Canvas2D，真实字体度量与光栅化；devDependency）
// 两条线跑同一份 src/，比对差异即可验证「后端无关性」。
function createContext(backend) {
  if (backend === 'canvas') {
    const napi = require('@napi-rs/canvas');
    if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = napi.ImageData;
    const canvas = napi.createCanvas(1, 1);
    // surface.applyCanvasSize 会写 canvas.style（浏览器语义），原生 canvas 没有
    canvas.style = {};
    const ctx = canvas.getContext('2d');
    // SvgContext 独有的扩展 API：原生后端补 no-op，保证同一份绘制代码可跑
    for (const fn of ['addPattern', 'rawPush', 'defsPush']) {
      if (typeof ctx[fn] !== 'function') ctx[fn] = () => null;
    }
    return ctx;
  }
  if (backend === 'svg') return new SvgContext();
  throw new Error('未知后端: ' + backend + '（支持 svg | canvas）');
}

// ---- 单文件 ----
function runFile(file, args) {
  const buf = fs.readFileSync(file);
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const parser = new MetafileParser(data);
  const parsed = parser.parse();
  if (!parsed || !parsed.header || parser.fileType !== 'emf') {
    return { file, skipped: String(parser.fileType), rows: [] };
  }

  const ctx = createContext(args.backend);
  const tracker = new GeometryTracker(ctx);
  const drawer = new EmfDrawer(tracker.proxy);

  const recs = [];
  const orig = EmfDrawer.prototype.processEmfRecordType.bind(drawer);
  drawer.processEmfRecordType = (type, d) => {
    tracker.begin();
    let error = null;
    try { orig(type, d); } catch (e) { error = /** @type {Error} */(e).message; }
    recs.push({ type: type >>> 0, box: tracker.end(), error, fs: tracker.lastText && tracker.lastText.fs });
  };

  let docError = null;
  try {
    drawer.draw(parsed, { viewWidth: 800, viewHeight: 600 });
  } catch (e) {
    docError = /** @type {Error} */(e).message;
  }

  const b = parsed.header.bounds;
  const ox = b.left | 0;
  const oy = b.top | 0;
  const pageBox = { x0: 0, y0: 0, x1: Math.abs(b.right - b.left), y1: Math.abs(b.bottom - b.top) };
  const rows = [];
  for (let i = 0; i < recs.length && i < parsed.records.length; i++) {
    const rec = parsed.records[i];
    const type = recs[i].type;
    if (!DRAW_TYPES.has(type)) continue;
    if (args.types && !args.types.has(type)) continue;
    const d = rec.data;
    if (!d || d.length < 16) continue;
    const ref = { left: readLong(d, 0), top: readLong(d, 4), right: readLong(d, 8), bottom: readLong(d, 12) };
    if (!(ref.right > ref.left && ref.bottom > ref.top)) continue;

    const refBox = { x0: ref.left - ox, y0: ref.top - oy, x1: ref.right - ox, y1: ref.bottom - oy };
    const looseBounds = LOOSE_BOUNDS_TYPES.has(type);
    // 很多生成器把整页作为 rclBounds（松散上界），这类记录没有定位信息，
    // 不参与 IoU 统计（否则会把所有指标压到 0）。
    const pageSized = iou(refBox, pageBox) > 0.98;
    // 还有一部分记录把 rclBounds 写成了逻辑单位（比页面大 2 倍以上），
    // 与 header 的设备单位不一致 —— 记录自身的真值就不可用，单独剔除。
    const tol = 0.02 * Math.max(pageBox.x1, pageBox.y1, 1);
    const suspectRef = refBox.x0 < pageBox.x0 - tol || refBox.y0 < pageBox.y0 - tol ||
      refBox.x1 > pageBox.x1 + tol || refBox.y1 > pageBox.y1 + tol;
    const ours = recs[i].box;
    const isText = TEXT_TYPES.has(type);
    if (!ours || !(ours.x1 > ours.x0) || !(ours.y1 > ours.y0)) {
      rows.push({
        file, type, typeName: rec.typeName, text: isText,
        miss: true, iou: 0, dCx: null, dCy: null, dTopRatio: null, pageSized, suspectRef, loose: looseBounds,
        ref: refBox, ours: ours || null,
        fs: recs[i].fs || null, error: recs[i].error || null,
      });
      continue;
    }
    const refC = { x: (refBox.x0 + refBox.x1) / 2, y: (refBox.y0 + refBox.y1) / 2 };
    const ourC = { x: (ours.x0 + ours.x1) / 2, y: (ours.y0 + ours.y1) / 2 };
    const fs = recs[i].fs || 0;
    rows.push({
      file, type, typeName: rec.typeName, text: isText,
      miss: false, pageSized, suspectRef, loose: looseBounds,
      iou: iou(ours, refBox),
      dCx: ourC.x - refC.x,
      dCy: ourC.y - refC.y,
      // 文本：rclBounds 顶部（字符格顶）与我们假设字形顶的差，除以字号 → 无量纲
      dTopRatio: isText && fs > 0 ? (refBox.y0 - ours.y0) / fs : null,
      ref: refBox, ours,
      fs: fs || null,
      error: recs[i].error || null,
    });
  }
  return { file, docError, pageBox, records: parsed.records.length, rows };
}

// ---- 汇总 ----
// 先隔离「整文件坐标映射错误」：非文本几何记录（n≥10）的 |dC| 中位 > 20px。
// 这类文件不是「个别记录画错」，而是整份文件的映射与录制 DC 不一致
//（典型：MM_ANISOTROPIC + windowExt=1x1 却不写 viewportExt）。
// 它们会把类型级中位数整体拖到 0，故默认从聚合统计中剔除、单独列出。
// 纯文本文件用另一条规则：|dTop/fs| > 3 只可能来自坐标/字号整体错位。
function detectMappingSuspects(results) {
  const perFile = new Map();
  for (const r of results) {
    for (const row of r.rows) {
      if (!perFile.has(r.file)) perFile.set(r.file, []);
      perFile.get(r.file).push(row);
    }
  }
  const suspects = [];
  const worst = [];
  for (const [file, rows] of perFile) {
    const m = rows.filter((r) => !r.miss && !r.pageSized && !r.suspectRef && !r.loose);
    const t = m.filter((r) => r.text);
    let textDtop = null;
    if (t.length >= 5) {
      textDtop = median(t.map((r) => r.dTopRatio).filter((v) => v !== null));
      worst.push({ file, n: t.length, iou: median(t.map((r) => r.iou)), dtop: textDtop });
    }
    if (t.length >= 5 && textDtop !== null && Math.abs(textDtop) > 3) {
      suspects.push({ file, kind: 'text', n: t.length, dc: Math.abs(textDtop), iou: median(t.map((r) => r.iou)) });
    }
    const g = m.filter((r) => !r.text);
    if (g.length >= 10) {
      const dc = median(g.map((r) => Math.hypot(r.dCx, r.dCy)));
      if (dc > 20) suspects.push({ file, kind: 'geom', n: g.length, dc, iou: median(g.map((r) => r.iou)) });
    }
  }
  // 同一文件可能同时命中几何与文本两条规则，按文件去重（几何判定优先）
  const dedup = new Map();
  for (const s of suspects) {
    const cur = dedup.get(s.file);
    if (!cur || (cur.kind === 'text' && s.kind === 'geom')) dedup.set(s.file, s);
  }
  return { mappingSuspects: [...dedup.values()], worst };
}

function summarize(results, args) {
  const all = [];
  for (const r of results) all.push(...r.rows);

  const { mappingSuspects, worst } = detectMappingSuspects(results);
  const suspectSet = new Set(mappingSuspects.map((x) => x.file));
  const scope = args.includeSuspects ? all : all.filter((r) => !suspectSet.has(r.file));

  const byType = new Map();
  for (const row of scope) {
    const key = row.typeName + (row.text ? ' (text)' : '');
    let a = byType.get(key);
    if (!a) {
      a = { key, n: 0, miss: 0, page: 0, ious: [], dcx: [], dcy: [], dtop: [], type: row.type, text: row.text };
      byType.set(key, a);
    }
    a.n++;
    if (row.miss) { a.miss++; continue; }
    if (row.pageSized || row.suspectRef || row.loose) { a.page++; continue; }
    a.ious.push(row.iou);
    a.dcx.push(Math.abs(row.dCx));
    a.dcy.push(Math.abs(row.dCy));
    if (row.dTopRatio !== null) a.dtop.push(row.dTopRatio);
  }

  const measured = scope.filter((r) => !r.miss && !r.pageSized && !r.suspectRef && !r.loose);
  const okIou = measured.map((r) => r.iou);

  console.log('\n=== 记录级几何一致性（rclBounds 作为真值） ===');
  console.log(`后端: ${args.backend}｜文件: ${results.filter((r) => !r.skipped).length} 个 EMF` +
    `（跳过 ${results.filter((r) => r.skipped).length} 个非 EMF）`);
  console.log(`绘图记录: ${all.length}｜我们没画: ${all.filter((r) => r.miss).length}` +
    `｜整页松散 rclBounds: ${all.filter((r) => r.pageSized).length}` +
    `｜越界 rclBounds（逻辑单位）：${all.filter((r) => r.suspectRef).length}` +
    `｜参与比较: ${measured.length}`);
  if (suspectSet.size && !args.includeSuspects) {
    console.log(`已剔除疑似映射错误文件 ${suspectSet.size} 个（${all.filter((r) => suspectSet.has(r.file)).length} 条记录）` +
      '；加 --include-suspects 可看全量');
  }
  if (okIou.length) {
    // IoU 对亚像素小图形（图表里的 1px 填充格）不敏感：描边外扩 0.5px 就能把
    // 1×1 的框压到 0.25。故同时给出与尺寸无关的中心偏移，两个指标一起看。
    const dcAll = measured.map((r) => Math.hypot(r.dCx, r.dCy));
    console.log(`IoU: 中位 ${median(okIou).toFixed(3)} | p10 ${pct(okIou, 0.1).toFixed(3)} | ≥0.99 ` +
      `${(100 * okIou.filter((v) => v >= 0.99).length / okIou.length).toFixed(1)}%` +
      ` | ≥0.90 ${(100 * okIou.filter((v) => v >= 0.9).length / okIou.length).toFixed(1)}%`);
    console.log(`中心偏移 |dC|: 中位 ${median(dcAll).toFixed(2)}px | p90 ${pct(dcAll, 0.9).toFixed(2)}px`);
  }

  console.log('\n--- 按记录类型（按记录数排序，前 18） ---');
  const header = ['记录类型', 'n', 'miss%', 'IoU中位', '|dCx|中位', '|dCy|中位', 'dTop/fs'];
  const rowsSorted = [...byType.values()].sort((a, b) => b.n - a.n).slice(0, 18);
  const widths = [30, 7, 7, 8, 10, 10, 9];
  const fmtRow = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');
  console.log(fmtRow(header));
  for (const a of rowsSorted) {
    console.log(fmtRow([
      a.key.slice(0, 29),
      a.n,
      ((100 * a.miss) / a.n).toFixed(1),
      median(a.ious) !== null ? median(a.ious).toFixed(3) : '-',
      median(a.dcx) !== null ? median(a.dcx).toFixed(2) : '-',
      median(a.dcy) !== null ? median(a.dcy).toFixed(2) : '-',
      a.dtop.length ? median(a.dtop).toFixed(3) : '-',
    ]));
  }

  const textRows = measured.filter((r) => r.text);
  const textDtop = textRows.map((r) => r.dTopRatio).filter((v) => v !== null);
  if (textDtop.length) {
    console.log('\n--- 文本专项 ---');
    console.log(`文本记录: ${textRows.length}（另有 ${all.filter((r) => r.text && r.miss).length} 条我们没画）`);
    console.log(`dTop/fs: 中位 ${median(textDtop).toFixed(3)} | p10 ${pct(textDtop, 0.1).toFixed(3)} | p90 ${pct(textDtop, 0.9).toFixed(3)}`);
    console.log('  含义: ≈1 → 我们把 GDI 的字符格顶当成了基线（字形整体高出约 1 个字号）；≈0 → 基线语义正确');
    console.log(`文本 IoU 中位: ${median(textRows.map((r) => r.iou)).toFixed(3)}`);
  }

  // 文本最差文件只统计「映射正常」的文件：映射坏掉的文件文字必然全错，
  // 单独列在下面的映射错误一节，混在一起会掩盖真正的文本缺陷。
  const worstKept = worst.filter((w) => !suspectSet.has(w.file));
  if (worstKept.length) {
    worstKept.sort((a, b) => a.iou - b.iou);
    console.log('\n--- 文本最差文件（前 10，按文本 IoU 中位，已剔除映射错误文件） ---');
    for (const w of worstKept.slice(0, 10)) {
      console.log(`  ${w.iou.toFixed(3)}  dTop/fs=${w.dtop === null ? '-' : w.dtop.toFixed(2)}  n=${String(w.n).padEnd(4)} ${path.relative(ROOT, w.file)}`);
    }
  }
  if (mappingSuspects.length) {
    mappingSuspects.sort((a, b) => b.dc - a.dc);
    console.log(`\n--- 疑似整文件坐标映射错误（几何记录 |dC| 中位 > 20px）: ${mappingSuspects.length} 个 ---`);
    for (const w of mappingSuspects.slice(0, 10)) {
      const metric = w.kind === 'text' ? `dTop/fs=${w.dc.toFixed(2)}` : `|dC|=${w.dc.toFixed(0)}px`;
      console.log(`  ${metric.padEnd(16)} IoU=${w.iou.toFixed(3)}  n=${String(w.n).padEnd(4)} ${path.relative(ROOT, w.file)}`);
    }
  }

  const errRows = all.filter((r) => r.error);
  if (errRows.length) {
    console.log(`\n--- 记录异常: ${errRows.length} 条（示例）---`);
    for (const r of errRows.slice(0, 5)) console.log(`  ${r.typeName}: ${r.error}`);
  }

  const docErrors = results.filter((r) => r.docError);
  if (docErrors.length) {
    console.log(`\n--- 整文件绘制异常: ${docErrors.length} 个 ---`);
    for (const r of docErrors.slice(0, 5)) console.log(`  ${path.relative(ROOT, r.file)}: ${r.docError}`);
  }

  if (args.verbose) {
    console.log('\n--- 明细（前 40 条） ---');
    for (const r of all.slice(0, 40)) {
      console.log(`  ${r.typeName.padEnd(24)} miss=${r.miss ? 'Y' : 'n'} iou=${r.miss ? '-' : r.iou.toFixed(3)} ` +
        `dC=(${r.dCx === null ? '-' : r.dCx.toFixed(1)},${r.dCy === null ? '-' : r.dCy.toFixed(1)}) ` +
        `${path.basename(r.file)}`);
    }
  }

  if (args.json) {
    const outPath = path.resolve(args.json);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      files: results.map((r) => ({
        file: path.relative(ROOT, r.file),
        skipped: r.skipped || null,
        docError: r.docError || null,
        records: r.records || 0,
        considered: r.rows.length,
        miss: r.rows.filter((x) => x.miss).length,
        pageSized: r.rows.filter((x) => x.pageSized).length,
        suspectRef: r.rows.filter((x) => x.suspectRef).length,
        textIouMedian: median(r.rows.filter((x) => x.text && !x.miss && !x.pageSized && !x.suspectRef && !x.loose).map((x) => x.iou)),
        iouMedian: median(r.rows.filter((x) => !x.miss && !x.pageSized && !x.suspectRef && !x.loose).map((x) => x.iou)),
        mappingSuspect: suspectSet.has(r.file),
      })),
      mappingSuspects: mappingSuspects
        .sort((a, b) => b.dc - a.dc)
        .map((w) => ({ file: path.relative(ROOT, w.file), kind: w.kind, records: w.n, metric: w.dc, iouMedian: w.iou })),
      types: rowsSorted.map((a) => ({
        type: a.type, name: a.key, n: a.n, miss: a.miss,
        iouMedian: median(a.ious), dCxMedian: median(a.dcx), dCyMedian: median(a.dcy),
        dTopRatioMedian: a.dtop.length ? median(a.dtop) : null,
      })),
      overall: {
        considered: all.length,
        miss: all.filter((r) => r.miss).length,
        measured: measured.length,
        excludedFiles: suspectSet.size,
        iouMedian: median(okIou),
        iouP10: pct(okIou, 0.1),
        exact99: okIou.length ? okIou.filter((v) => v >= 0.99).length / okIou.length : null,
        textDTopRatioMedian: textDtop.length ? median(textDtop) : null,
      },
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`\nJSON 已写入 ${path.relative(ROOT, outPath)}`);
  }
}

// 同一份语料换一个绘制后端再跑一遍（用于「后端无关性」验证）
function runAll(files, args) {
  const results = [];
  for (const f of files) {
    try { results.push(runFile(f, args)); }
    catch (e) { results.push({ file: f, docError: /** @type {Error} */(e).message, rows: [] }); }
  }
  return results;
}

// ---- 后端对比 ----
// 两个后端跑同一份 src：几何应当一致（差异只应来自文本宽度等度量能力）。
// 每个类型比较 IoU 中位，并列出文本分歧最大的文件。
function compareBackends(svgResults, canvasResults) {
  // 与 summarize 用同一套剔除规则：映射坏掉的文件对两种后端都无意义
  const suspects = new Set([
    ...detectMappingSuspects(svgResults).mappingSuspects.map((x) => x.file),
    ...detectMappingSuspects(canvasResults).mappingSuspects.map((x) => x.file),
  ]);
  const agg = (results) => {
    const byType = new Map();
    for (const r of results) {
      if (suspects.has(r.file)) continue;
      for (const row of r.rows) {
        if (row.miss || row.pageSized || row.suspectRef || row.loose) continue;
        const key = row.typeName + (row.text ? ' (text)' : '');
        if (!byType.has(key)) byType.set(key, { n: 0, ious: [], dcx: [] });
        const a = byType.get(key);
        a.n++;
        a.ious.push(row.iou);
        a.dcx.push(Math.abs(row.dCx));
      }
    }
    return byType;
  };
  const a = agg(svgResults);
  const b = agg(canvasResults);
  const keys = [...new Set([...a.keys(), ...b.keys()])]
    .filter((k) => (a.get(k)?.n || 0) >= 10 || (b.get(k)?.n || 0) >= 10)
    .sort((x, y) => ((b.get(y)?.n || 0) + (a.get(y)?.n || 0)) - ((b.get(x)?.n || 0) + (a.get(x)?.n || 0)))
    .slice(0, 14);

  console.log('\n=== 后端无关性对比（svg vs canvas，同一份 src） ===');
  const widths = [30, 10, 9, 10, 9, 10];
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');
  console.log(fmt(['记录类型', 'n', 'svg IoU', 'svg |dCx|', 'canvas IoU', 'canvas |dCx|']));
  for (const k of keys) {
    const x = a.get(k), y = b.get(k);
    console.log(fmt([
      k.slice(0, 29),
      (y?.n ?? x?.n) ?? 0,
      x ? median(x.ious).toFixed(3) : '-',
      x ? median(x.dcx).toFixed(2) : '-',
      y ? median(y.ious).toFixed(3) : '-',
      y ? median(y.dcx).toFixed(2) : '-',
    ]));
  }

  const perFile = (results) => {
    const m = new Map();
    for (const r of results) {
      if (suspects.has(r.file)) continue;
      for (const row of r.rows) {
        if (!row.text || row.miss || row.pageSized || row.suspectRef || row.loose) continue;
        if (!m.has(r.file)) m.set(r.file, []);
        m.get(r.file).push(row.iou);
      }
    }
    return m;
  };
  const fs1 = perFile(svgResults), fs2 = perFile(canvasResults);
  const diverge = [];
  for (const [file, ious] of fs1) {
    const other = fs2.get(file);
    if (!other || ious.length < 5) continue;
    diverge.push({ file, n: ious.length, d: median(other) - median(ious) });
  }
  if (diverge.length) {
    // d > 0 = canvas 的文本 IoU 更高 = SVG 侧的文本度量（0.6em 估算）偏差更大
    diverge.sort((x, y) => y.d - x.d);
    console.log('\n--- SVG 侧文本度量误差最大的文件（canvas IoU − svg IoU > 0） ---');
    for (const d of diverge.slice(0, 8)) {
      console.log(`  ${d.d >= 0 ? '+' : ''}${d.d.toFixed(3)}  n=${String(d.n).padEnd(4)} ${path.relative(ROOT, d.file)}`);
    }
  }
}

// 给 SvgContext/PdfContext 注入真实字体度量（来自原生 canvas），
// 用于验证「无度量时 SVG 侧文本宽度误差」这一结论。
function installRealSvgMetrics() {
  const napi = require('@napi-rs/canvas');
  const measureCtx = napi.createCanvas(1, 1).getContext('2d');
  SvgContext.setMeasureProvider((font, text) => {
    measureCtx.font = font || '12px sans-serif';
    return measureCtx.measureText(text).width;
  });
}

// 用 src/utils/fontFileMetrics（零依赖解析系统字体）作为度量源
function installSystemSvgMetrics() {
  const fontFileMetrics = require('../src/utils/fontFileMetrics');
  SvgContext.setMeasureProvider(fontFileMetrics.createMeasureProvider());
}

function main() {
  const args = parseArgs(process.argv);
  const files = collectFiles(args);
  if (args.svgMetrics === 'real') installRealSvgMetrics();
  else if (args.svgMetrics === 'system') installSystemSvgMetrics();
  // 渲染器/解析器的调试日志会淹没报告（bundle 里的 console.log 是被 define 改写的，
  // 直接跑 src 时不会被静音）
  const realLog = console.log;
  const realWarn = console.warn;
  const realErr = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  const results = [];
  try {
    if (args.backend === 'both') {
      const svgResults = runAll(files, { ...args, backend: 'svg' });
      const canvasResults = runAll(files, { ...args, backend: 'canvas' });
      console.log = realLog;
      console.warn = realWarn;
      console.error = realErr;
      summarize(svgResults, { ...args, backend: 'svg', json: args.json });
      summarize(canvasResults, { ...args, backend: 'canvas', json: null });
      compareBackends(svgResults, canvasResults);
      return;
    }
    results.push(...runAll(files, args));
  } finally {
    console.log = realLog;
    console.warn = realWarn;
    console.error = realErr;
  }
  summarize(results, args);
}

module.exports = { runFile, median, pct, iou, GeometryTracker, DRAW_TYPES, TEXT_TYPES };

if (require.main === module) main();
