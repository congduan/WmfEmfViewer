// EMF+绘制模块
const CoordinateTransformer = require('../../utils/coordinateTransformer');
const GdiObjectManager = require('../../utils/gdiObjectManager');
const GeometryUtils = require('../../utils/geometryUtils');
const { readFloat32, readDword, readShort } = require('../../utils/binaryReader');
const { argbToCss, readArgb } = require('../../utils/colorUtils');
const { applyCanvasSize, clearCanvas, applyDefaultPenBrush } = require('../../utils/surface');
const { decodeUtf16Le, readUtf16Name } = require('../../utils/textCodec');
const { DEFAULT_VIEW_WIDTH, DEFAULT_VIEW_HEIGHT } = require('../../utils/constants');
const NestedMetafilePlayer = require('../../utils/nestedMetafilePlayer');

// EMF+ 记录分派表：记录类型 -> 处理方法名（processEmfPlusRecordType 中调用 this[方法名](flags, data)）。
// 值为 null 表示已识别但无需处理（与原 switch 的空分支等价）。
// 记录编号依据 MS-EMFPLUS 规范 2.1.1.1 节 EmfPlusRecordType 枚举。
const EMF_PLUS_RECORD_HANDLERS = {
  // ========== 全局/控制记录 ==========
  0x4001: 'processEmfPlusHeader',            // EmfPlusHeader
  0x4002: null,                              // EmfPlusEndOfFile
  0x4003: null,           // EmfPlusComment
  0x4004: null,             // EmfPlusGetDC

  // ========== 对象管理 ==========
  0x4008: 'processEmfPlusObject',            // EmfPlusObject

  // ========== 绘图记录 ==========
  0x4009: 'processEmfPlusClear',             // EmfPlusClear
  0x400A: 'processEmfPlusFillRectangles',    // EmfPlusFillRects
  0x400B: 'processEmfPlusDrawRectangles',    // EmfPlusDrawRects
  0x400C: 'processEmfPlusFillPolygon',       // EmfPlusFillPolygon
  0x400D: 'processEmfPlusDrawLines',         // EmfPlusDrawLines
  0x400E: 'processEmfPlusFillEllipse',       // EmfPlusFillEllipse
  0x400F: 'processEmfPlusDrawEllipse',       // EmfPlusDrawEllipse
  0x4010: 'processEmfPlusFillPie',           // EmfPlusFillPie
  0x4011: 'processEmfPlusDrawPie',           // EmfPlusDrawPie
  0x4012: 'processEmfPlusDrawArc',           // EmfPlusDrawArc
  0x4013: null,                              // EmfPlusFillRegion（Region 对象未解析，见 processEmfPlusObject 的 U_OT_Region 分支）
  0x4014: 'processEmfPlusFillPath',          // EmfPlusFillPath
  0x4015: 'processEmfPlusDrawPath',          // EmfPlusDrawPath
  0x4016: 'processEmfPlusFillClosedCurve',   // EmfPlusFillClosedCurve
  0x4017: 'processEmfPlusDrawClosedCurve',   // EmfPlusDrawClosedCurve
  0x4018: 'processEmfPlusDrawCurve',         // EmfPlusDrawCurve
  0x4019: 'processEmfPlusDrawBeziers',       // EmfPlusDrawBeziers

  // ========== 图像/文本绘制 ==========
  0x401A: 'processEmfPlusDrawImage',         // EmfPlusDrawImage
  0x401B: 'processEmfPlusDrawImagePoints',   // EmfPlusDrawImagePoints
  0x401C: 'processEmfPlusDrawString',        // EmfPlusDrawString
  0x4036: null,  // EmfPlusDrawDriverString

  // ========== 状态/渲染参数记录 ==========
  0x401D: null,   // EmfPlusSetRenderingOrigin
  0x401E: null,     // EmfPlusSetAntiAliasMode
  0x401F: null, // EmfPlusSetTextRenderingHint
  0x4020: null,      // EmfPlusSetTextContrast
  0x4021: null, // EmfPlusSetInterpolationMode
  0x4022: null,   // EmfPlusSetPixelOffsetMode
  0x4023: null,   // EmfPlusSetCompositingMode
  0x4024: null, // EmfPlusSetCompositingQuality

  // ========== 图形状态容器/变换 ==========
  0x4025: 'processEmfPlusSave',                   // EmfPlusSave
  0x4026: 'processEmfPlusRestore',                // EmfPlusRestore
  0x4027: 'processEmfPlusBeginContainer',         // EmfPlusBeginContainer
  0x4028: 'processEmfPlusBeginContainerNoParams', // EmfPlusBeginContainerNoParams
  0x4029: 'processEmfPlusEndContainer',           // EmfPlusEndContainer
  0x402A: 'processEmfPlusSetWorldTransform',      // EmfPlusSetWorldTransform
  0x402B: 'processEmfPlusResetWorldTransform',    // EmfPlusResetWorldTransform
  0x402C: 'processEmfPlusMultiplyWorldTransform', // EmfPlusMultiplyWorldTransform
  0x402D: 'processEmfPlusTranslateWorldTransform', // EmfPlusTranslateWorldTransform
  0x402E: 'processEmfPlusScaleWorldTransform',    // EmfPlusScaleWorldTransform
  0x402F: 'processEmfPlusRotateWorldTransform',   // EmfPlusRotateWorldTransform
  0x4030: 'processEmfPlusSetPageTransform',       // EmfPlusSetPageTransform

  // ========== 裁剪 ==========
  0x4031: 'processEmfPlusResetClip',          // EmfPlusResetClip
  0x4032: 'processEmfPlusSetClipRect',        // EmfPlusSetClipRect
  0x4033: 'processEmfPlusSetClipPath',        // EmfPlusSetClipPath
  0x4034: 'processEmfPlusSetClipRegion',      // EmfPlusSetClipRegion
  0x4035: 'processEmfPlusOffsetClip',         // EmfPlusOffsetClip

  // ========== 其他 ==========
  0x4037: null,       // EmfPlusStrokeFillPath (非标准)
  0x4038: null,   // EmfPlusSerializableObject
  0x4039: null,        // EmfPlusSetTSGraphics
  0x403A: null             // EmfPlusSetTSClip
};

// MS-WMF 2.1.1.12 的权威 8×8 单色 hatch 位图（GDI 与 GDI+ 对基础样式共用同一组）。
// 数值取自 Apache POI 的 org.apache.poi.hwmf.record.HwmfHatchStyle（Apache-2.0），
// 与规范附录的位图逐位一致。位序 LSB-first：byte[y] 的第 x 位 = 像素 (x, y)，置位 = 前景色。
// EMF+ 的 HatchStyle 0-5 与 GDI 的同名样式一一对应，故可直接复用。
// 其余 47 种样式（含全部百分比样式）微软从未公开像素图案，只能参数化近似。
const HATCH_BITMAPS = {
  0: [0xFF, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00], // Horizontal        0x000000FF000000FF
  1: [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88], // Vertical          0x8888888888888888
  2: [0x10, 0x20, 0x40, 0x80, 0x01, 0x02, 0x04, 0x08], // ForwardDiagonal   0x0804020180402010
  3: [0x08, 0x04, 0x02, 0x01, 0x80, 0x40, 0x20, 0x10], // BackwardDiagonal  0x1020408001020408
  4: [0xFF, 0x11, 0x11, 0x11, 0xFF, 0x11, 0x11, 0x11], // LargeGrid / Cross 0x111111FF111111FF
  5: [0x18, 0x24, 0x42, 0x81, 0x81, 0x42, 0x24, 0x18], // DiagonalCross     0x1824428181422418
};

class EmfPlusDrawer {
  constructor(ctx) {
    this.ctx = ctx;
    this.coordinateTransformer = new CoordinateTransformer();
    // 同 EmfDrawer：EMF+ 也采用简化 orgs 语义（MM_TEXT/公制忽略 windowOrg/viewportOrg）
    this.coordinateTransformer.setIgnoreWindowOrgs(true);
    this.gdiObjectManager = new GdiObjectManager();
    this.currentPath = []; // 当前路径点集合
    this.pathState = 'idle'; // 路径状态：idle, active, completed
    this.fillColor = '#000000'; // 默认填充颜色
    this.strokeColor = '#000000'; // 默认描边颜色
    this.lineWidth = 1; // 默认线宽
    this.emfPlusObjects = {}; // EMF+ 对象表（ObjectId -> {type, color, width, ...}）

    // ---- 世界变换 / 状态栈 / 裁剪 ----
    // 仿射矩阵 [a,b,c,d,e,f]（x' = a·x + c·y + e，y' = b·x + d·y + f），
    // 只在 _emfPlusMapPoint 施加一次，故所有绘制记录自动获得正确坐标，
    // 无需在 40+ 个记录处理器里各自换算。
    this.emfPlusMatrix = [1, 0, 0, 1, 0, 0];
    this.emfPlusPageScale = 1;        // EmfPlusSetPageTransform 的页面缩放
    this.emfPlusStateStack = [];      // EmfPlusSave / EmfPlusRestore
    this.emfPlusContainerStack = [];  // EmfPlusBeginContainer / EndContainer
    // 无法用 SVG 精确表达的记录（按出现次数聚合），draw() 收尾时一次性上报，
    // 避免「静默丢弃」——这是与 GDI 真值比对时定位差异的依据。
    this.unsupportedRecords = [];
  }

  // 记录一条无法精确实现的语义（按 key 聚合计数）
  _noteUnsupported(key) {
    const i = this.unsupportedRecords.indexOf(key);
    if (i < 0) this.unsupportedRecords.push(key);
  }

  // ---- EMF+ 辅助方法 ----
  // float32 reading and ARGB color conversion now live in utils/binaryReader and utils/colorUtils

  // 启发式：提取渐变刷（Linear/PathGradient/Hatch）的主色。
  // GDI+ 写出的这类刷子里 StartColor/EndColor（或 ForeColor/BackColor）总是相邻的两个
  // alpha=0xFF 的 dword（实测 Excel/Office 产出均如此），故优先找相邻对，取前者作主色；
  // 找不到相邻对时退化为首个 alpha=0xFF 的 dword。
  _emfPlusFirstOpaqueArgb(data, offset) {
    const argb = o => (o + 4 <= data.length ? readArgb(data, o) >>> 0 : 0);
    const opaque = v => ((v >>> 24) & 0xFF) === 0xFF && (v & 0x00FFFFFF) !== 0;
    for (let o = offset; o + 8 <= data.length; o += 4) {
      const v1 = argb(o), v2 = argb(o + 4);
      if (opaque(v1) && opaque(v2)) return argbToCss(v1);
    }
    for (let o = offset; o + 4 <= data.length; o += 4) {
      const v = argb(o);
      if (opaque(v)) return argbToCss(v);
    }
    return null;
  }

  // 根据 flags 与 BrushId 解析画刷颜色：
  // flags 的 0x8000 位（U_PPF_B）为 1 时 BrushId 直接是 ARGB 颜色，否则是对象表索引。
  // 对损坏文件的容错：
  //   非 solid 模式下 BrushId > 63 时按 ARGB 颜色处理（对象表索引只有 0-63）。
  _emfPlusResolveBrush(flags, brushId, data, offset) {
    if (flags & 0x8000) {
      return argbToCss(brushId);
    }
    const obj = this.emfPlusObjects[brushId >>> 0];
    if (obj) {
      const paint = this._emfPlusBrushPaint(obj);
      if (paint) return paint;
    }
    // 兜底（容错）：BrushId 超出对象表范围则视为 ARGB 颜色直传
    if (brushId > 63 || brushId >= 0x01000000) {
      return argbToCss(brushId);
    }
    return '#000000';
  }

  // 画刷对象 -> 可直接赋给 fillStyle/strokeStyle 的值（颜色串或渐变/图案对象）。
  // 渐变几何在**使用时刻**才映射：EMF+ 的 Brush 坐标属于世界空间，
  // 同一画刷可能在多个世界变换下被使用，创建时烘焙会在变换改变后失真。
  // 同一变换下重复使用则复用已建对象，避免 <defs> 里堆出大量同义渐变。
  _emfPlusBrushPaint(obj) {
    if (!obj) return null;
    if (obj.type === 'solidBrush') return obj.color;
    if (obj.type === 'gradientBrush') {
      const key = this.emfPlusMatrix.join(',') + '|' + this.emfPlusPageScale;
      if (obj._paintKey === key) return obj._paint;
      let paint = null;
      try {
        paint = obj.grad.kind === 'linear'
          ? this._buildLinearGradient(obj.grad)
          : this._buildRadialGradient(obj.grad);
      } catch (e) {
        paint = null;
      }
      obj._paintKey = key;
      obj._paint = paint || obj.grad.fallback || '#000000';
      return obj._paint;
    }
    if (obj.type === 'hatchBrush') return this._buildHatchPaint(obj);
    return null;
  }

  // EmfPlusLinearGradientBrushData（MS-EMFPLUS 2.2.2.10）：
  //   BrushDataFlags(4) + WrapMode(4) + RectF(16, 起点+尺寸向量) + FirstColor(ARGB)
  //   + SecondColor(ARGB) + 两个语义未知的重复 ARGB(8)
  //   + [BrushDataTransform 0x02: XForm(24)]
  //   + [BrushDataBlendFactors 0x08: count + positions[count] + factors[count]]
  //   + [BrushDataPresetColors 0x04: count + positions[count] + colors[count]]
  _emfPlusParseLinearGradient(data) {
    if (data.length < 44) return null;
    const flags2 = readDword(data, 4);
    const x = readFloat32(data, 12), y = readFloat32(data, 16);
    const w = readFloat32(data, 20), h = readFloat32(data, 24);
    const first = argbToCss(readArgb(data, 28));
    const second = argbToCss(readArgb(data, 32));
    let o = 44;                       // 已读 4 个 ARGB（28/32 为色，36/40 为重复字段）
    if (flags2 & 0x02) o += 24;       // BrushDataTransform：暂不参与几何，记为近似
    if (flags2 & 0x08) {              // BrushDataBlendFactors：影响 alpha 渐变，暂忽略
      if (o + 4 > data.length) return null;
      const n = readDword(data, o);
      o += 4 + Math.max(0, Math.min(n, 4096)) * 8;
      this._noteUnsupported('LinearGradient BrushDataBlendFactors');
    }
    let stops = null;
    if (flags2 & 0x04) {              // BrushDataPresetColors：最精确的色标来源
      if (o + 4 <= data.length) {
        const n = Math.max(0, Math.min(readDword(data, o), 4096));
        const posOff = o + 4;
        const colOff = posOff + n * 4;
        if (n > 0 && colOff + n * 4 <= data.length) {
          stops = [];
          for (let i = 0; i < n; i++) {
            stops.push({ pos: readFloat32(data, posOff + i * 4), color: argbToCss(readArgb(data, colOff + i * 4)) });
          }
        }
      }
    }
    if (!stops || stops.length === 0) {
      stops = [{ pos: 0, color: first }, { pos: 1, color: second }];
    }
    if (flags2 & 0x02) this._noteUnsupported('LinearGradient BrushDataTransform');
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    return { kind: 'linear', x, y, w, h, stops, fallback: first };
  }

  // EmfPlusPathGradientBrushData（MS-EMFPLUS 2.2.2.14）：
  //   BrushDataFlags(4) + WrapMode(4) + CenterColor(ARGB) + CenterPoint(8)
  //   + SurroundColorsCount(4) + SurroundColors[Count](ARGB)
  //   + [BrushDataPath 0x01: PathLength(4) + EmfPlusPath]
  _emfPlusParsePathGradient(data) {
    if (data.length < 28) return null;
    const flags2 = readDword(data, 4);
    const center = argbToCss(readArgb(data, 12));
    const cx = readFloat32(data, 16), cy = readFloat32(data, 20);
    const n = Math.max(0, Math.min(readDword(data, 24), 4096));
    let o = 28;
    const surround = [];
    for (let i = 0; i < n && o + 4 <= data.length; i++, o += 4) {
      surround.push(argbToCss(readArgb(data, o)));
    }
    const stops = [{ pos: 0, color: center }];
    if (surround.length) stops.push({ pos: 1, color: surround[0] });
    else stops.push({ pos: 1, color: center });
    // 边界路径：用于推导向外半径（无路径时无法确定半径，退化为纯中心色）
    let radius = 0;
    if (flags2 & 0x01) {
      const bounds = this._emfPlusBoundaryRadius(data, o);
      if (bounds > 0) radius = bounds;
      else this._noteUnsupported('PathGradient 边界路径解析失败');
    } else {
      this._noteUnsupported('PathGradient 无边界路径');
    }
    if (!isFinite(cx) || !isFinite(cy)) return null;
    if (radius <= 0) return { kind: 'radial', cx, cy, radius: 0, stops, fallback: center };
    return { kind: 'radial', cx, cy, radius, stops, fallback: center };
  }

  // 从 PathGradient 的边界路径点集推导向外半径：取包围盒半对角线。
  // 数据布局：PathLength(4) + [路径头 4 + PointCount(4) + PointFlags(4) + Points...]
  // 这里只从点流中取足够点估包围盒，不构建完整路径（半径估算不需要图元类型）。
  _emfPlusBoundaryRadius(data, offset) {
    if (offset + 12 > data.length) return 0;
    const pathLength = readDword(data, offset);
    if (!(pathLength > 0) || pathLength > data.length) return 0;
    const base = offset + 4;
    // 路径头之后为 PointCount + PointFlags
    const count = readDword(data, base + 4);
    const pflags = readDword(data, base + 8);
    if (!(count > 0) || count > 65536) return 0;
    const compressed = (pflags & 0x4000) !== 0;   // FORMAT_COMPRESSED: int16
    const relative = (pflags & 0x0800) !== 0;      // RELATIVE_POSITION
    const stride = compressed ? 4 : 8;
    const pts = base + 12;
    if (pts + count * stride > data.length) return 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let px = 0, py = 0;
    for (let i = 0; i < count; i++) {
      const o = pts + i * stride;
      let x, y;
      if (compressed) { x = readShort(data, o); y = readShort(data, o + 2); }
      else { x = readFloat32(data, o); y = readFloat32(data, o + 4); }
      if (!isFinite(x) || !isFinite(y)) return 0;
      if (relative) { x += px; y += py; px = x; py = y; }
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX, h = maxY - minY;
    if (!(w > 0) && !(h > 0)) return 0;
    return Math.hypot(w, h) / 2;
  }

  _buildLinearGradient(spec) {
    const ctx = this.ctx;
    if (typeof ctx.createLinearGradient !== 'function') return spec.fallback;
    const p1 = this._emfPlusMapPoint(spec.x, spec.y);
    const p2 = this._emfPlusMapPoint(spec.x + spec.w, spec.y + spec.h);
    if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) return spec.fallback;
    if (Math.abs(p2.x - p1.x) < 1e-6 && Math.abs(p2.y - p1.y) < 1e-6) return spec.fallback;  // 退化向量
    const g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    for (const s of spec.stops) g.addColorStop(s.pos, s.color);
    return g;
  }

  _buildRadialGradient(spec) {
    const ctx = this.ctx;
    if (typeof ctx.createRadialGradient !== 'function') return spec.fallback;
    const c = this._emfPlusMapPoint(spec.cx, spec.cy);
    const e = this._emfPlusMapPoint(spec.cx + spec.radius, spec.cy);
    if (!isFinite(c.x) || !isFinite(c.y)) return spec.fallback;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    if (!(r > 0)) return spec.fallback;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    for (const s of spec.stops) g.addColorStop(s.pos, s.color);
    return g;
  }

  // ---- Hatch 填充 ----
  // SVG 没有 hatch 图元，用 <pattern> 平铺实现。EmfPlusHatchStyle 共 53 种
  //（MS-EMFPLUS 2.1.1.7），这里对几何上有明确定义的族给出参数化图案：
  //   0-5   基本几何（横/竖/两种对角/网格/对角交叉）
  //   6-17  百分比填充（按密度反推线距，斜线近似）
  //   18-33 密集度/粗细/虚线变体
  //   34-52 装饰类（砖、编织、格纹等）无对应图元，统一退化为交叉网纹并记为近似。
  // 单元格取 8 个用户单位（GDI+ 典型 hatch 单元），不随世界变换缩放——这是已知近似。
  _buildHatchPaint(obj) {
    const key = obj.style + '|' + obj.fore + '|' + obj.back;
    if (this._hatchCache && this._hatchCache[key]) return this._hatchCache[key];
    if (!this._hatchCache) this._hatchCache = {};
    if (!this._hatchSeq) this._hatchSeq = 0;
    const id = 'hatch-' + (++this._hatchSeq);
    // fore/back 均由 argbToCss 产出（#rrggbb / rgba(...)），不含需要转义的字符
    const bg = (cellSize) => '<rect x="0" y="0" width="' + cellSize + '" height="' + cellSize + '" fill="' + obj.back + '"/>';
    let cell, body;
    const bmp = HATCH_BITMAPS[obj.style];
    if (bmp) {
      // 0-5：直接用 MS-WMF 权威 8×8 位图，逐像素输出 1×1 矩形。
      // 与 GDI 的二值掩码逐位一致——不缩放（hatch 单元本就不随用户变换变化）、
      // 不抗锯齿（GDI 对密集横竖线同样关 AA 以保证锐利）。
      cell = 8;
      let px = '';
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if ((bmp[y] >> x) & 1) {
            px += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + obj.fore + '"/>';
          }
        }
      }
      body = bg(8) + px;
    } else {
      const geo = this._hatchGeometry(obj.style);
      cell = geo.cell;
      if (geo.approximate) this._noteUnsupported('Hatch style ' + obj.style + ' (近似)');
      body = bg(cell) + geo.lines.map(l =>
        '<path d="' + l.d + '" fill="none" stroke="' + obj.fore + '" stroke-width="' + l.w + '"/>'
      ).join('');
    }
    this.ctx.defsPush(
      '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + cell + '" height="' + cell + '">' +
      body + '</pattern>'
    );
    const paint = { __svgPaint: 'url(#' + id + ')' };
    this._hatchCache[key] = paint;
    return paint;
  }

  // 返回 { cell, lines:[{d,w}], approximate }
  _hatchGeometry(style) {
    const L = [];
    const line = (x1, y1, x2, y2, w) => L.push({ d: 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2, w: w || 1 });
    // 百分比填充：线距 ≈ 1/密度（1px 线宽下覆盖率与密度同量级）
    const PCT = [0.05, 0.10, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.90];
    if (style >= 6 && style <= 17) {
      const d = PCT[style - 6];
      const cell = Math.max(2, Math.round(1 / d));
      line(0, cell, cell, 0, 1);
      return { cell, lines: L, approximate: true };
    }
    // 注：样式 0-5 由 HATCH_BITMAPS 的权威位图处理，不进入本函数。
    switch (style) {
      // 对角线的明暗/宽窄变体
      case 18: line(0, 0, 8, 8); return { cell: 6, lines: L };                 // LightDownwardDiagonal
      case 19: line(0, 8, 8, 0); return { cell: 6, lines: L };                 // LightUpwardDiagonal
      case 20: line(0, 0, 4, 4); return { cell: 4, lines: L };                 // DarkDownwardDiagonal
      case 21: line(0, 4, 4, 0); return { cell: 4, lines: L };                 // DarkUpwardDiagonal
      case 22: line(0, 0, 8, 8, 2); return { cell: 8, lines: L };              // WideDownwardDiagonal
      case 23: line(0, 8, 8, 0, 2); return { cell: 8, lines: L };              // WideUpwardDiagonal
      // 横竖线的明暗/宽窄变体
      case 24: line(2, 0, 2, 6); return { cell: 6, lines: L };                 // LightVertical
      case 25: line(0, 2, 6, 2); return { cell: 6, lines: L };                 // LightHorizontal
      case 26: line(1, 0, 1, 2); return { cell: 2, lines: L };                 // NarrowVertical
      case 27: line(0, 1, 2, 1); return { cell: 2, lines: L };                 // NarrowHorizontal
      case 28: line(1, 0, 1, 4, 2); return { cell: 4, lines: L };              // DarkVertical
      case 29: line(0, 1, 4, 1, 2); return { cell: 4, lines: L };              // DarkHorizontal
      // 虚线族：SVG 图案里用短划表达
      case 30: L.push({ d: 'M0 0L3 3M5 5L8 8', w: 1 }); return { cell: 8, lines: L, approximate: true };
      case 31: L.push({ d: 'M0 8L3 5M5 3L8 0', w: 1 }); return { cell: 8, lines: L, approximate: true };
      case 32: L.push({ d: 'M0 2L4 2M6 2L8 2', w: 1 }); return { cell: 8, lines: L, approximate: true };// DashedHorizontal
      case 33: L.push({ d: 'M2 0L2 4M2 6L2 8', w: 1 }); return { cell: 8, lines: L, approximate: true };// DashedVertical
      default:
        // 34-52 装饰类：无对应 SVG 图元，退化为中等密度交叉网纹
        line(0, 0, 8, 8); line(0, 8, 8, 0);
        return { cell: 8, lines: L, approximate: true };
    }
  }

  // 解析画笔对象 -> { color, width }
  _emfPlusResolvePen(penId) {
    const obj = this.emfPlusObjects[penId >>> 0];
    if (obj && obj.type === 'pen') {
      return { color: obj.color, width: obj.width };
    }
    return { color: '#000000', width: 1 };
  }

  // 坐标映射：世界变换 → 页面缩放 → coordinateTransformer（mapMode/window/viewport）。
  // 单位矩阵且页面缩放为 1 时严格走恒等路径（不做乘法），保证既有快照逐字节不变。
  _emfPlusMapPoint(x, y) {
    const m = this.emfPlusMatrix;
    let px = x, py = y;
    if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) {
      px = m[0] * x + m[2] * y + m[4];
      py = m[1] * x + m[3] * y + m[5];
    }
    if (this.emfPlusPageScale !== 1) {
      px *= this.emfPlusPageScale;
      py *= this.emfPlusPageScale;
    }
    return this.coordinateTransformer.transform(px, py);
  }

  // 世界变换矩阵复合（列向量约定：p' = A·p，A = [[a,c,e],[b,d,f],[0,0,1]]）。
  // GDI+ 的 PostMultiply（flags 0x2000，Append）语义是「新变换作用在已有变换之后」，
  // 即 p'' = B·(A·p)，故 A ← B·A；否则（Prepend）A ← A·B。
  // 两者不可互换：对「先 Rotate 再 Translate」的序列，Append 得到 T·R（锚点保持不动、
  // 字形原地旋转），Prepend 得到 R·T（锚点绕原点公转）——结果是完全不同的图形。
  _emfPlusComposeMatrix(m, post) {
    if (!m || m.length < 6 || m.some(v => !isFinite(v))) return;
    const t = this.emfPlusMatrix;   // A：已有变换
    const b = m;                    // B：新变换
    if (post) {
      // A ← B·A
      this.emfPlusMatrix = [
        b[0] * t[0] + b[2] * t[1], b[1] * t[0] + b[3] * t[1],
        b[0] * t[2] + b[2] * t[3], b[1] * t[2] + b[3] * t[3],
        b[0] * t[4] + b[2] * t[5] + b[4], b[1] * t[4] + b[3] * t[5] + b[5],
      ];
    } else {
      // A ← A·B
      this.emfPlusMatrix = [
        t[0] * b[0] + t[2] * b[1], t[1] * b[0] + t[3] * b[1],
        t[0] * b[2] + t[2] * b[3], t[1] * b[2] + t[3] * b[3],
        t[0] * b[4] + t[2] * b[5] + t[4], t[1] * b[4] + t[3] * b[5] + t[5],
      ];
    }
  }

  // EmfPlusTransformObject 布局（MS-EMFPLUS 2.2.1.2 / GDI+ Matrix）：
  // M11, M12, M21, M22, Dx, Dy 六个 float32（共 24 字节）。
  _emfPlusReadMatrix(data) {
    if (!data || data.length < 24) return null;
    return [readFloat32(data, 0), readFloat32(data, 4), readFloat32(data, 8),
      readFloat32(data, 12), readFloat32(data, 16), readFloat32(data, 20)];
  }

  // EmfPlusPath (MS-EMFPLUS 2.2.1.6) 解析：data 起点（已跳过 EmfPlusObject 的 GraphicsVersion）
// 实际 layout: PathPointCount(4) + PathPointFlags(4) + PathPoints(Count × stride) + PathPointTypes(Count if non-RLE) + AlignmentPadding(0..3)
// 注意：graphicsVersion 是 EmfPlusPath 自身 Version 字段（spec 2.2.1.6）；解析 EmfPlusObject 时先读 graphicsVersion 再交给 EmfPlusPath。
// PathPointFlags:
//   0x0800 RELATIVE_POSITION — 坐标相对于前一点（PathPointR，否则 PathPoint/PathPointF）
//   0x1000 RLE_COMPRESSED    — PathPointTypes 为 RLE 编码
//   0x4000 FORMAT_COMPRESSED — 坐标为 int16（否则 float32）
// PathPointType 字节：低 4 位 (0x0F): 0=Start, 1=Line, 3=Bezier；高 4 位 0x10=Dashed, 0x20=Marker, 0x80=CloseSubpath
  _emfPlusParsePath(data) {
    if (!data || data.length < 8) return null;
    const count = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const pointFlags = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
    const compressed = (pointFlags & 0x4000) !== 0;
    const rle = (pointFlags & 0x1000) !== 0;
    const relative = (pointFlags & 0x0800) !== 0;

    // PathPoints 在前（spec 2.2.1.6 字段顺序）：起点 offset=8
    let offset = 8;
    const points = [];
    const stride = compressed ? 4 : 8;
    for (let i = 0; i < count; i++) {
      if (offset + stride > data.length) break;
      let x, y;
      if (compressed) {
        x = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        if (x & 0x8000) x |= 0xFFFF0000;
        y = (data[offset + 2] & 0xFF) | ((data[offset + 3] & 0xFF) << 8);
        if (y & 0x8000) y |= 0xFFFF0000;
      } else {
        x = readFloat32(data, offset);
        y = readFloat32(data, offset + 4);
      }
      points.push({ x, y });
      offset += stride;
    }
    // PathPointTypes 在 PathPoints 之后：RLE=0 时每点 1 字节，RLE=1 时按 RLE 编码
    const pointTypes = new Uint8Array(count);
    if (rle) {
      let i = 0;
      while (i < count && offset + 2 <= data.length) {
        const header = data[offset] & 0xFF;
        const t = data[offset + 1] & 0xFF;
        offset += 2;
        const runCount = header & 0x3F;
        const actual = Math.min(runCount, count - i);
        for (let k = 0; k < actual; k++) pointTypes[i + k] = t;
        i += actual;
      }
    } else {
      for (let i = 0; i < count && offset < data.length; i++) {
        pointTypes[i] = data[offset++] & 0xFF;
      }
    }
    return { count, pointTypes, points, compressed, rle, relative };
  }

  // 在 ctx 上构造 Path 命令（按 PathPointType 序列 moveTo/lineTo/bezier/closePath）
  // 由调用方在 fill()/stroke() 之前调用
  _emfPlusTracePath(pathObj) {
    if (!pathObj || !pathObj.pointTypes || pathObj.count === 0) return;
    const ctx = this.ctx;
    let bezierBuf = [];
    let prevX = 0, prevY = 0;
    let started = false;
    for (let i = 0; i < pathObj.count; i++) {
      const t = pathObj.pointTypes[i];
      const p = pathObj.points[i];
      if (!p) continue;
      let x = p.x, y = p.y;
      if (pathObj.relative) { x += prevX; y += prevY; }
      const mapped = this._emfPlusMapPoint(x, y);
      const type = t & 0x0F;
      const closed = (t & 0x80) !== 0;
      if (type === 0) { // Start
        if (started) ctx.closePath();
        ctx.beginPath();
        ctx.moveTo(mapped.x, mapped.y);
        started = true;
        bezierBuf = [];
      } else if (type === 1) { // Line
        if (!started) { ctx.beginPath(); ctx.moveTo(mapped.x, mapped.y); started = true; }
        ctx.lineTo(mapped.x, mapped.y);
        bezierBuf = [];
      } else if (type === 3) { // Bezier
        if (!started) { ctx.beginPath(); ctx.moveTo(mapped.x, mapped.y); started = true; }
        bezierBuf.push(mapped);
        if (bezierBuf.length === 3) {
          ctx.bezierCurveTo(bezierBuf[0].x, bezierBuf[0].y, bezierBuf[1].x, bezierBuf[1].y, bezierBuf[2].x, bezierBuf[2].y);
          bezierBuf = [];
        }
      }
      if (closed && bezierBuf.length === 0) ctx.closePath();
      prevX = x; prevY = y;
    }
    if (started) ctx.closePath();
  }

  draw(metafileData, options = {}) {
    console.log('Drawing EMF+ with header:', metafileData.header);
    console.log('Number of records:', metafileData.records.length);

    // 获取view尺寸，默认见 constants.DEFAULT_VIEW_*
    const viewWidth = options.viewWidth || DEFAULT_VIEW_WIDTH;
    const viewHeight = options.viewHeight || DEFAULT_VIEW_HEIGHT;

    let canvasWidth, canvasHeight;
    if (metafileData.header.bounds) {
      const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
      const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;

      // 在保持宽高比的情况下，尽可能占满view
      const scaleToFit = Math.min(
        viewWidth / width,
        viewHeight / height
      );
      canvasWidth = Math.round(width * scaleToFit);
      canvasHeight = Math.round(height * scaleToFit);
    } else {
      canvasWidth = viewWidth;
      canvasHeight = viewHeight;
    }

    // Canvas sizing, clearing and default styles (host detection lives in utils/surface)
    this.devicePixelRatio = applyCanvasSize(this.ctx, canvasWidth, canvasHeight);
    clearCanvas(this.ctx, canvasWidth, canvasHeight);
    applyDefaultPenBrush(this.ctx, { lineWidth: 2 });
    this.fillColor = '#ffffff';
    this.strokeColor = '#000000';

    // 重置路径状态
    this.currentPath = [];
    this.pathState = 'idle';

    // 处理每个记录
    for (let i = 0; i < metafileData.records.length; i++) {
      const record = metafileData.records[i];
      // 性能：每条记录一次日志会拖慢大文件渲染，仅在调试模式输出
      if (globalThis.__WMF_DEBUG__) {
        console.log('Processing EMF+ record', i, ':', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')', 'flags:', record.flags);
      }
      this.processEmfPlusRecordType(record.type, record.flags, record.data);
    }

    // 处理剩余的路径
    this.finishPath();

    // 无法用 SVG 精确表达的语义集中上报：这些条目是与 GDI 真值比对时
    // 优先排查的差异来源，避免「静默丢弃」造成难以定位的渲染偏差。
    // 用 console.log（构建时被改写成受 __WMF_DEBUG__ 控制的版本），
    // 不污染生产控制台；调用方也可直接读 drawer.unsupportedRecords。
    if (this.unsupportedRecords.length) {
      console.log('EMF+ 近似/未实现的语义:', this.unsupportedRecords.join(', '));
    }

    console.log('EMF+ drawing completed');
  }

  // 完成路径绘制（若路径仍处于 active/completed，则描边输出）
  finishPath() {
    if (this.pathState === 'active' || this.pathState === 'completed') {
      this.ctx.stroke();
      this.pathState = 'idle';
    }
  }

  processEmfPlusRecordType(recordType, flags, data) {
    // 查表分派：记录类型 -> 处理方法名，映射见文件顶部 EMF_PLUS_RECORD_HANDLERS
    const handlerName = EMF_PLUS_RECORD_HANDLERS[recordType];
    if (handlerName !== undefined) {
      if (handlerName !== null) {
        this[handlerName](flags, data);
      }
      return;
    }
    console.log('Unknown/Unimplemented EMF+ record type:', recordType.toString(16));
  }

  // 解析EMF头
  parseEmfHeader() {
    // 这里应该实现EMF头的解析逻辑
    // 暂时返回一个模拟的EMF头
    return {
      nSize: 88,
      nVersion: 0x00010000,
      nRecords: 0,
      nHandles: 0,
      nReserved: 0,
      nWidth: 0,
      nHeight: 0,
      nNumberOfPages: 1,
      nPlayCount: 0
    };
  }

  // 处理EMF+填充多边形记录：data = BrushId(4) + Count(4) + PointF[Count](8 each)
  // （BrushId 在 data 首字段）
  processEmfPlusFillPolygon(flags, data) {
    if (data.length < 8) return;
    const brushId = readDword(data, 0);
    const count = readDword(data, 4);
    if (count < 1 || count > 65536) return;
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 8;
      if (o + 8 > data.length) break;
      const x = readFloat32(data, o);
      const y = readFloat32(data, o + 4);
      const p = this._emfPlusMapPoint(x, y);
      if (i === 0) {
        this.ctx.moveTo(p.x, p.y);
      } else {
        this.ctx.lineTo(p.x, p.y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
    console.log('EMF+ FillPolygon:', count, '个点');
  }

  // EmfPlusFillPath (0x4014, MS-EMFPLUS 2.3.4.17)：flags[7..0]=pathId, flags[15]=S(ARGB 直传), data[0..3]=brushId/ARGB
  processEmfPlusFillPath(flags, data) {
    if (data.length < 4) return;
    const pathId = flags & 0xFF;
    const solid = (flags & 0x8000) !== 0;
    const brushId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const path = this.emfPlusObjects[pathId];
    if (!path || path.type !== 'path') return;
    const color = solid ? argbToCss(brushId) : this._emfPlusResolveBrush(0, brushId);
    if (!color) return;
    this.ctx.fillStyle = color;
    this._emfPlusTracePath(path);
    this.ctx.fill();
  }

  // EmfPlusDrawPath (0x4015, MS-EMFPLUS 2.3.4.18)：flags[7..0]=pathId, flags[15]=S, data[0..3]=penId/ARGB
  processEmfPlusDrawPath(flags, data) {
    if (data.length < 4) return;
    const pathId = flags & 0xFF;
    const solid = (flags & 0x8000) !== 0;
    const penId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const path = this.emfPlusObjects[pathId];
    if (!path || path.type !== 'path') return;
    let color = '#000000', width = 1;
    if (solid) {
      color = argbToCss(penId);
    } else {
      const pen = this.emfPlusObjects[penId];
      if (pen && pen.type === 'pen') { color = pen.color; width = pen.width || 1; }
    }
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this._emfPlusTracePath(path);
    this.ctx.stroke();
  }

  // 处理EMF+绘制图像记录（0x401A，MS-EMFPLUS 2.3.4.9）：
  // data = imageAttributesId(4) + srcUnit(4) + srcRect RectF(16，源裁剪，像素单位)
  //        + RectData（目标框：flags&0x4000(C) 压缩为 EmfPlusRect(4×int16)，否则 EmfPlusRectF(4×float)）。
  // srcRect 被缩放填充到 RectData；此前漏读 RectData 导致图被画到源坐标位置。
  processEmfPlusDrawImage(flags, data) {
    const img = this.emfPlusObjects[flags & 0xFF];
    if (!img || data.length < 24) return;
    const sx = readFloat32(data, 8);
    const sy = readFloat32(data, 12);
    const sw = readFloat32(data, 16);
    const sh = readFloat32(data, 20);
    const compressed = (flags & 0x4000) !== 0;
    if (24 + (compressed ? 8 : 16) > data.length) return;
    let dx, dy, dw, dh;
    if (compressed) {
      dx = readShort(data, 24);
      dy = readShort(data, 26);
      dw = readShort(data, 28);
      dh = readShort(data, 30);
    } else {
      dx = readFloat32(data, 24);
      dy = readFloat32(data, 28);
      dw = readFloat32(data, 32);
      dh = readFloat32(data, 36);
    }
    const ul = this._emfPlusMapPoint(dx, dy);
    const ur = this._emfPlusMapPoint(dx + dw, dy);
    const ll = this._emfPlusMapPoint(dx, dy + dh);
    this._drawImageObj(img, ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, { x: sx, y: sy, w: sw, h: sh });
  }

  // 处理EMF+绘制图像点记录（DrawImagePoints：三点定义目标平行四边形）
  processEmfPlusDrawImagePoints(flags, data) {
    const img = this.emfPlusObjects[flags & 0xFF];
    if (!img || data.length < 28) return;
    // imageAttributesId(4) + sourceUnit(4) + srcRect(16) + count(4) + points[3]
    const count = readDword(data, 24);
    if (count !== 3) return;
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const o = 28 + i * 8;
      if (o + 8 > data.length) return;
      pts.push({ x: this._emfPlusReadPointX(flags, data, o), y: this._emfPlusReadPointY(flags, data, o) });
    }
    // pts: 左上 / 右上 / 左下（EMF+ page 单位）
    this._drawImageObj(img, pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  }

  // int32/int16 reading now lives in utils/binaryReader (readDword/readShort)

  // EMF+ 页面单位 -> 画布像素的比例（用当前坐标变换实测 100 单位的水平跨度）
  _emfPlusUnitsToPx() {
    try {
      const a = this._emfPlusMapPoint(0, 0);
      const b = this._emfPlusMapPoint(100, 0);
      // 取映射后 x 轴向量的**长度**而非 x 分量：世界变换含旋转时，
      // x 分量会被 cosθ 缩放（90° 时甚至为 0），导致字号随角度跳动；
      // 向量长度只反映缩放，与旋转无关。恒等/纯缩放场景下与旧实现等价。
      const s = Math.hypot(b.x - a.x, b.y - a.y) / 100;
      return s > 0 ? s : 1;
    } catch (e) {
      return 1;
    }
  }

  // 字体名 -> CSS 通用字体族（EMF+ FaceName 常见字体映射）
  _emfPlusFontFamilyFromName(name) {
    const n = (name || '').toLowerCase();
    if (/courier|consol|mono|menlo/.test(n)) return 'monospace';
    if (/times|georgia|garamond|cambria|book|roman|serif|minion/.test(n)) return 'serif';
    return 'sans-serif';
  }

  // 读取点坐标（flags 0x4000=压缩坐标时用 int16/4096）
  _emfPlusReadPointX(flags, data, o) {
    if (flags & 0x4000) {
      const v = (data[o] | (data[o + 1] << 8)) << 16 >> 16;
      return v / 4096;
    }
    return readFloat32(data, o);
  }
  _emfPlusReadPointY(flags, data, o) {
    if (flags & 0x4000) {
      const v = (data[o + 2] | (data[o + 3] << 8)) << 16 >> 16;
      return v / 4096;
    }
    return readFloat32(data, o + 4);
  }

  // 渲染嵌套 EMF / 位图对象到指定平行四边形（3 点：左上 / 右上 / 左下）
  // srcRect（可选）：源裁剪矩形 {x,y,w,h}，嵌套 EMF 按其子区域映射到目标平行四边形。
  _drawImageObj(img, x1, y1, x2, y2, x3, y3, srcRect) {
    try {
      if (img.type === 'imageData') {
        // 原生 PNG/JPEG 位图（srcRect 裁剪需要图片内在尺寸，暂按整图绘制）
        this.ctx.rawPush('<image x="' + Math.min(x1, x2, x3) + '" y="' + Math.min(y1, y2, y3) + '" width="' +
          Math.abs(Math.max(x1, x2, x3) - Math.min(x1, x2, x3)) + '" height="' +
          Math.abs(Math.max(y1, y2, y3) - Math.min(y1, y2, y3)) + '" href="' + img.href + '" preserveAspectRatio="none" />');
        return;
      }
      if (img.type !== 'imageEmf') return;
      const nested = NestedMetafilePlayer.renderNestedToSvgNodes(img.data);
      if (!nested) return;
      const W = nested.width || 1;
      const H = nested.height || 1;
      // srcRect 为空或覆盖全图时退化为整图映射
      const sx = srcRect && srcRect.w > 0 && srcRect.h > 0 ? srcRect.x : 0;
      const sy = srcRect && srcRect.w > 0 && srcRect.h > 0 ? srcRect.y : 0;
      const sw = srcRect && srcRect.w > 0 ? srcRect.w : W;
      const sh = srcRect && srcRect.h > 0 ? srcRect.h : H;
      // source 子矩形 (sx,sy)-(sx+sw,sy+sh) → dest 由 3 点定义的仿射
      const a = (x2 - x1) / sw, b = (y2 - y1) / sw;
      const c = (x3 - x1) / sh, d = (y3 - y1) / sh;
      const e = x1 - a * sx - c * sy;
      const f = y1 - b * sx - d * sy;
      const body = nested.nodes.join('\n');
      const defs = nested.defs.length ? '<defs>' + nested.defs.join('') + '</defs>' : '';
      this.ctx.rawPush(
        '<g transform="matrix(' + this._fmtN(a) + ' ' + this._fmtN(b) + ' ' + this._fmtN(c) + ' ' + this._fmtN(d) + ' ' + this._fmtN(e) + ' ' + this._fmtN(f) + ')">' +
        defs + body + '</g>'
      );
    } catch (e) {
      console.log('EMF+ DrawImage failed:', /** @type {Error} */ (e).message);
    }
  }

  _fmtN(v) {
    return Math.round(v * 100) / 100;
  }

  // 嵌套 EMF 的独立渲染已下沉到 utils/nestedMetafilePlayer.renderNestedToSvgNodes

  // EmfPlusDrawString（0x401C，MS-EMFPLUS 2.3.4.14）：
  // FontId = flags 低字节；data = BrushId(4) + FormatId(4) + Length(4) + RectF(16) + UTF16LE[Length]
  // 字距/字符间距暂忽略（PNG→SVG 静态图对齐为主）。
  processEmfPlusDrawString(flags, data) {
    if (data.length < 28) return;
    const fontId = flags & 0xFF;
    const brushId = readDword(data, 0);
    const len = readDword(data, 8);
    if (len < 1 || len > 65536) return;
    const layoutX = readFloat32(data, 12);
    const layoutY = readFloat32(data, 16);
    const strOff = 28;
    if (strOff + len * 2 > data.length) return;
    // 解码 UTF16LE 字符串（遇 NUL 终止）
    const text = decodeUtf16Le(data, strOff, len, { breakAtNul: true });
    if (!text) return;
    // 取 brush 颜色（BrushId 为 ARGB 直传或对象表索引）
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (color) this.ctx.fillStyle = color;
    // 应用 font（若有）。EmSize 单位依 SizeUnit，多数文件为页面单位：
    // 按当前坐标变换把 EmSize 换算成画布像素（与 LayoutRect 的映射一致）。
    const fontObj = this.emfPlusObjects[fontId];
    let drawSize = 12;
    const scale = this._emfPlusUnitsToPx() || 1;
    if (fontObj && fontObj.type === 'font') {
      const sz = Math.max(4, Math.round(fontObj.emSize * scale));
      drawSize = sz;
      this.ctx.font = `${fontObj.italic}${fontObj.weight} ${sz}px "${fontObj.face}"`;
    }
    // ---- StringFormat 对齐（MS-EMFPLUS 2.2.1.9 + LibreOffice 的换算公式） ----
    // 偏移在**世界单位**中计算后再统一映射，因此旋转/缩放场景下同样正确；
    // 单位矩阵时与旧实现逐像素等价（Near/Near 时 offX=0、offY=emSize，
    // 而 emSize×scale 恰为 drawSize）。
    const fmt = this.emfPlusObjects[readDword(data, 4)];
    const layoutW = readFloat32(data, 20);
    const layoutH = readFloat32(data, 24);
    const emWorld = drawSize / scale;
    let offX = 0;
    let offY = emWorld;                       // 默认 Near：基线 = 顶边 + 一个字号
    // 水平对齐交给 SVG 的 text-anchor：渲染器用真实字体度量定位，比
    // measureText（0.6×字号×字数 的估算）准确得多。故这里只算锚点位置。
    let anchorAlign = null;                   // null = 沿用当前 ctx.textAlign
    if (fmt && fmt.type === 'stringFormat') {
      const lw = isFinite(layoutW) ? layoutW : 0;
      const lh = isFinite(layoutH) ? layoutH : 0;
      if (fmt.align === 1) {                  // Center
        offX = 0.5 * lw + 0.5 * (fmt.leadingMargin - fmt.trailingMargin) * emWorld;
        anchorAlign = 'center';
      } else if (fmt.align === 2) {           // Far
        offX = lw - fmt.trailingMargin * emWorld;
        anchorAlign = 'right';
      } else {                                // Near
        offX = fmt.leadingMargin * emWorld;
        anchorAlign = 'left';
      }
      if (fmt.lineAlign === 1) {              // Center
        offY = 0.5 * lh + 0.5 * emWorld;
      } else if (fmt.lineAlign === 2) {       // Far
        offY = lh;
      }
      // 无法用 SVG <text> 精确表达的格式化语义，记录以免静默丢弃
      if (fmt.tracking !== 1 && fmt.tracking !== 0) this._noteUnsupported('StringFormat tracking');
      if (fmt.trimming) this._noteUnsupported('StringFormat trimming');
      if (fmt.tabStopCount) this._noteUnsupported('StringFormat tabStops');
      if (fmt.flags & 0x0001) this._noteUnsupported('StringFormat 右到左');
      if (fmt.flags & 0x0002) this._noteUnsupported('StringFormat 竖排');
    }
    const p = this._emfPlusMapPoint(layoutX + offX, layoutY + offY);
    // 世界变换含旋转时字形方向必须跟着转（GDI+ 语义）：锚点已由 _emfPlusMapPoint
    // 摆到正确位置，这里只补字形朝向。fillText 的 transformMatrix.rotate 以度为单位、
    // 绕锚点旋转；角度取矩阵第一列的极角，镜像/反射场景下方向仍由该极角表达。
    const m = this.emfPlusMatrix;
    const deg = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    const xform = Math.abs(deg) > 0.01 ? { rotate: deg } : undefined;
    if (anchorAlign) {
      // 用完即还：DrawString 的对齐取自 StringFormat，不得污染 DC 上的
      // SETTEXTALIGN 状态（EMF+ 记录常回放在 EmfDrawer 的 DC 上下文中）。
      const savedAlign = this.ctx.textAlign;
      this.ctx.textAlign = anchorAlign;
      this.ctx.fillText(text, p.x, p.y, xform);
      this.ctx.textAlign = savedAlign;
      return;
    }
    this.ctx.fillText(text, p.x, p.y, xform);
  }

  // 处理EMF+绘制多线段记录：PenId(4) + Count(4) + PointF[Count](8 each)
  processEmfPlusDrawLines(flags, data) {
    if (data.length < 4) return;
    const penId = flags & 0xFF;
    const count = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    if (count > 65536) return;
    const pen = this._emfPlusResolvePen(penId);
    if (!pen || !pen.color) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = 4 + i * 8;
      if (o + 8 > data.length) break;
      const x = readFloat32(data, o);
      const y = readFloat32(data, o + 4);
      const p = this._emfPlusMapPoint(x, y);
      if (i === 0) {
        this.ctx.moveTo(p.x, p.y);
      } else {
        this.ctx.lineTo(p.x, p.y);
      }
    }
    this.ctx.stroke();
    console.log('EMF+ DrawLines:', count, '个点');
  }

  // 处理EMF+绘制椭圆记录：PenId(4) + RectF(16)
  processEmfPlusDrawEllipse(flags, data) {
    if (data.length < 16) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    const x = readFloat32(data, 0);
    const y = readFloat32(data, 4);
    const w = readFloat32(data, 8);
    const h = readFloat32(data, 12);
    const tl = this._emfPlusMapPoint(x, y);
    const br = this._emfPlusMapPoint(x + w, y + h);
    const { cx, cy, rx, ry } = GeometryUtils.absEllipseFromCorners(tl, br);
    if (rx === 0 || ry === 0) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    console.log('EMF+ DrawEllipse');
  }

  // 处理EMF+填充椭圆记录：data = BrushId(4) + RectF(16)
  // （BrushId 在 data 首字段）
  processEmfPlusFillEllipse(flags, data) {
    if (data.length < 20) return;
    const brushId = readDword(data, 0);
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    const x = readFloat32(data, 4);
    const y = readFloat32(data, 8);
    const w = readFloat32(data, 12);
    const h = readFloat32(data, 16);
    const tl = this._emfPlusMapPoint(x, y);
    const br = this._emfPlusMapPoint(x + w, y + h);
    const { cx, cy, rx, ry } = GeometryUtils.absEllipseFromCorners(tl, br);
    if (rx === 0 || ry === 0) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.fill();
    console.log('EMF+ FillEllipse');
  }

  // 处理EMF+填充饼图记录：data = BrushId(4) + StartAngle(float) + SweepAngle(float) + RectF(16)
  // （角度为度，顺时针自 3 点方向）
  processEmfPlusFillPie(flags, data) {
    if (data.length < 28) return;
    const brushId = readDword(data, 0);
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    const start = readFloat32(data, 4);
    const sweep = readFloat32(data, 8);
    const x = readFloat32(data, 12);
    const y = readFloat32(data, 16);
    const w = readFloat32(data, 20);
    const h = readFloat32(data, 24);
    if (w === 0 || h === 0 || sweep === 0) return;
    const tl = this._emfPlusMapPoint(x, y);
    const br = this._emfPlusMapPoint(x + w, y + h);
    const { cx, cy, rx, ry } = GeometryUtils.absEllipseFromCorners(tl, br);
    if (rx === 0 || ry === 0) return;
    const a0 = start * Math.PI / 180;
    const a1 = (start + sweep) * Math.PI / 180;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.ellipse(cx, cy, rx, ry, 0, a0, a1, sweep < 0);
    this.ctx.closePath();
    this.ctx.fill();
    console.log('EMF+ FillPie');
  }

  // ---- Shared point/spline helpers for the curve records below ----

  // Decode Count points starting at `offset` and map them to canvas space.
  // Compressed points (flags 0x4000) follow the same convention as
  // _emfPlusReadPointX/Y, which is what the already-implemented DrawImagePoints
  // path uses. No corpus sample exercises the compressed case for these records.
  _emfPlusReadPoints(flags, data, offset, count) {
    const pts = [];
    const stride = (flags & 0x4000) ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const o = offset + i * stride;
      if (o + stride > data.length) break;
      pts.push(this._emfPlusMapPoint(
        this._emfPlusReadPointX(flags, data, o),
        this._emfPlusReadPointY(flags, data, o)
      ));
    }
    return pts;
  }

  // Cardinal spline -> cubic Beziers, written into the current path.
  // Tension uses GDI+ semantics: 0 draws straight lines, 1 is the most crooked
  // (GDI+ documents the range 0..1, values outside are clamped).
  // Control points are computed after mapping, which is equivalent for affine
  // transforms because they are linear combinations of the input points.
  _emfPlusTraceSpline(points, tension, closed) {
    const ctx = this.ctx;
    const n = points.length;
    if (n === 0) return false;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    const t = Math.max(0, Math.min(1, Number.isFinite(tension) ? tension : 0)) / 3;
    if (n < 3 || t === 0) {
      for (let i = 1; i < n; i++) ctx.lineTo(points[i].x, points[i].y);
      if (closed) ctx.closePath();
      return true;
    }
    const at = i => points[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
    const segments = closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t,
        p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t,
        p2.x, p2.y
      );
    }
    if (closed) ctx.closePath();
    return true;
  }

  // EmfPlusDrawPie (0x4011, MS-EMFPLUS 2.3.4.4).
  // PenId is in the low byte of flags; layout is the same as EmfPlusFillPie minus
  // the brush: StartAngle(4f) + SweepAngle(4f) + RectF(16). Angles are degrees,
  // clockwise from the 3 o'clock direction.
  processEmfPlusDrawPie(flags, data) {
    if (data.length < 24) return;
    const start = readFloat32(data, 0);
    const sweep = readFloat32(data, 4);
    const x = readFloat32(data, 8), y = readFloat32(data, 12);
    const w = readFloat32(data, 16), h = readFloat32(data, 20);
    if (w === 0 || h === 0 || sweep === 0) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    const { cx, cy, rx, ry } = GeometryUtils.absEllipseFromCorners(
      this._emfPlusMapPoint(x, y),
      this._emfPlusMapPoint(x + w, y + h)
    );
    if (rx === 0 || ry === 0) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.ellipse(cx, cy, rx, ry, 0, start * Math.PI / 180, (start + sweep) * Math.PI / 180, sweep < 0);
    this.ctx.closePath();
    this.ctx.stroke();
    console.log('EMF+ DrawPie');
  }

  // EmfPlusDrawArc (0x4012, MS-EMFPLUS 2.3.4.3): identical to EmfPlusDrawPie but
  // draws the arc only (no lines to the centre, no closing segment).
  processEmfPlusDrawArc(flags, data) {
    if (data.length < 24) return;
    const start = readFloat32(data, 0);
    const sweep = readFloat32(data, 4);
    const x = readFloat32(data, 8), y = readFloat32(data, 12);
    const w = readFloat32(data, 16), h = readFloat32(data, 20);
    if (w === 0 || h === 0 || sweep === 0) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    const { cx, cy, rx, ry } = GeometryUtils.absEllipseFromCorners(
      this._emfPlusMapPoint(x, y),
      this._emfPlusMapPoint(x + w, y + h)
    );
    if (rx === 0 || ry === 0) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, start * Math.PI / 180, (start + sweep) * Math.PI / 180, sweep < 0);
    this.ctx.stroke();
    console.log('EMF+ DrawArc');
  }

  // EmfPlusFillClosedCurve (0x4016, MS-EMFPLUS 2.3.4.11).
  // Layout: BrushId(4) + Tension(4f) + Count(4) + Points(Count x 4/8 bytes).
  processEmfPlusFillClosedCurve(flags, data) {
    if (data.length < 12) return;
    const brushId = readDword(data, 0);
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    const tension = readFloat32(data, 4);
    const count = readDword(data, 8);
    if (count < 2 || count > 65536) return;
    const pts = this._emfPlusReadPoints(flags, data, 12, count);
    if (pts.length < 2) return;
    this.ctx.fillStyle = color;
    if (this._emfPlusTraceSpline(pts, tension, true)) this.ctx.fill();
    console.log('EMF+ FillClosedCurve:', pts.length, '个点');
  }

  // EmfPlusDrawClosedCurve (0x4017, MS-EMFPLUS 2.3.4.10).
  // PenId is in the low byte of flags; layout: Tension(4f) + Count(4) + Points.
  processEmfPlusDrawClosedCurve(flags, data) {
    if (data.length < 8) return;
    const tension = readFloat32(data, 0);
    const count = readDword(data, 4);
    if (count < 2 || count > 65536) return;
    const pts = this._emfPlusReadPoints(flags, data, 8, count);
    if (pts.length < 2) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    if (this._emfPlusTraceSpline(pts, tension, true)) this.ctx.stroke();
    console.log('EMF+ DrawClosedCurve:', pts.length, '个点');
  }

  // EmfPlusDrawCurve (0x4018, MS-EMFPLUS 2.3.4.6).
  // PenId is in the low byte of flags;
  // layout: Tension(4f) + Offset(4) + Count(4) + NumberOfPoints(4) + Points.
  // Offset (index of the first point) is honoured; the whole remaining run is
  // drawn as one open spline.
  processEmfPlusDrawCurve(flags, data) {
    if (data.length < 16) return;
    const tension = readFloat32(data, 0);
    const offset = readDword(data, 4);
    const total = readDword(data, 12);
    if (total < 2 || total > 65536) return;
    const all = this._emfPlusReadPoints(flags, data, 16, total);
    const start = Math.max(0, Math.min(offset, all.length - 2));
    const pts = all.slice(start);
    if (pts.length < 2) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    if (this._emfPlusTraceSpline(pts, tension, false)) this.ctx.stroke();
    console.log('EMF+ DrawCurve:', pts.length, '个点');
  }

  // EmfPlusDrawBeziers (0x4019, MS-EMFPLUS 2.3.4.5).
  // PenId is in the low byte of flags; layout: Count(4) + Points.
  // Points come in groups of three control points continuing from the current
  // position (first point is the start point).
  processEmfPlusDrawBeziers(flags, data) {
    if (data.length < 4) return;
    const count = readDword(data, 0);
    if (count < 4 || count > 65536) return;
    const pts = this._emfPlusReadPoints(flags, data, 4, count);
    if (pts.length < 4) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i + 2 < pts.length; i += 3) {
      this.ctx.bezierCurveTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, pts[i + 2].x, pts[i + 2].y);
    }
    this.ctx.stroke();
    console.log('EMF+ DrawBeziers:', pts.length, '个点');
  }

  // ========== 图形状态容器 / 世界变换 / 裁剪 ==========
  // 参考实现对照：LibreOffice emfphelperdata.cxx 的
  // EmfPlusRecordTypeSave/Restore/BeginContainer/SetWorldTransform/SetClipRect 分支。

  // 0x4025 EmfPlusSave：data = StackIndex(4)。
  // GDI+ 会成对发出 Save/Restore，故这里按栈处理（不按 index 定位）。
  processEmfPlusSave() {
    this.ctx.save();
    this.emfPlusStateStack.push(this.emfPlusMatrix.slice());
  }

  // 0x4026 EmfPlusRestore：恢复到 Save 时的变换与绘制状态（含裁剪）
  processEmfPlusRestore() {
    const saved = this.emfPlusStateStack.pop();
    this.ctx.restore();
    if (saved) this.emfPlusMatrix = saved;
  }

  // 0x4027 EmfPlusBeginContainer：
  //   DestRect(4×float32) + SrcRect(4×float32) + StackIndex(4)
  // 语义：把 SrcRect 内容映射到 DestRect，等价于一次 scale+translate 复合。
  processEmfPlusBeginContainer(flags, data) {
    this.ctx.save();
    this.emfPlusContainerStack.push(this.emfPlusMatrix.slice());
    if (!data || data.length < 32) return;
    const dx = readFloat32(data, 0), dy = readFloat32(data, 4);
    const dw = readFloat32(data, 8), dh = readFloat32(data, 12);
    const sx = readFloat32(data, 16), sy = readFloat32(data, 20);
    const sw = readFloat32(data, 24), sh = readFloat32(data, 28);
    const kx = sw !== 0 ? dw / sw : 1;
    const ky = sh !== 0 ? dh / sh : 1;
    if (!isFinite(kx) || !isFinite(ky)) return;
    if (kx === 1 && ky === 1 && dx === sx && dy === sy) return;   // 恒等容器不留矩阵
    this._emfPlusComposeMatrix([kx, 0, 0, ky, dx - sx, dy - sy], true);
  }

  // 0x4028 EmfPlusBeginContainerNoParams：data = StackIndex(4)，只压栈不改变换
  processEmfPlusBeginContainerNoParams() {
    this.ctx.save();
    this.emfPlusContainerStack.push(this.emfPlusMatrix.slice());
  }

  // 0x4029 EmfPlusEndContainer：弹出容器状态
  processEmfPlusEndContainer() {
    const saved = this.emfPlusContainerStack.pop();
    this.ctx.restore();
    if (saved) this.emfPlusMatrix = saved;
  }

  // 0x402A EmfPlusSetWorldTransform：直接替换世界变换
  processEmfPlusSetWorldTransform(flags, data) {
    const m = this._emfPlusReadMatrix(data);
    if (m) this.emfPlusMatrix = m;
  }

  // 0x402B EmfPlusResetWorldTransform：恢复单位矩阵
  processEmfPlusResetWorldTransform() {
    this.emfPlusMatrix = [1, 0, 0, 1, 0, 0];
  }

  // 0x402C EmfPlusMultiplyWorldTransform
  processEmfPlusMultiplyWorldTransform(flags, data) {
    const m = this._emfPlusReadMatrix(data);
    if (m) this._emfPlusComposeMatrix(m, (flags & 0x2000) !== 0);
  }

  // 0x402D EmfPlusTranslateWorldTransform：data = OffsetX, OffsetY（float32×2）
  processEmfPlusTranslateWorldTransform(flags, data) {
    if (!data || data.length < 8) return;
    this._emfPlusComposeMatrix(
      [1, 0, 0, 1, readFloat32(data, 0), readFloat32(data, 4)], (flags & 0x2000) !== 0);
  }

  // 0x402E EmfPlusScaleWorldTransform：data = ScaleX, ScaleY（float32×2）
  processEmfPlusScaleWorldTransform(flags, data) {
    if (!data || data.length < 8) return;
    const sx = readFloat32(data, 0), sy = readFloat32(data, 4);
    if (sx === 0 || sy === 0) return;   // 退化矩阵，忽略（等价于整幅消失）
    this._emfPlusComposeMatrix([sx, 0, 0, sy, 0, 0], (flags & 0x2000) !== 0);
  }

  // 0x402F EmfPlusRotateWorldTransform：data = Angle（float32，单位为度）
  // 注：LibreOffice 对该记录忽略 PostMultiply 位一律后乘；此处按规范使用 flags 0x2000。
  processEmfPlusRotateWorldTransform(flags, data) {
    if (!data || data.length < 4) return;
    const rad = readFloat32(data, 0) * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    this._emfPlusComposeMatrix([c, s, -s, c, 0, 0], (flags & 0x2000) !== 0);
  }

  // 0x4030 EmfPlusSetPageTransform：data = PageScale（float32），单位由 flags 低字节指定。
  // 仅当 PageUnit 为像素(2) 以外的单位时才真正参与缩放；像素单位的 PageScale 恒为 1。
  processEmfPlusSetPageTransform(flags, data) {
    if (!data || data.length < 4) return;
    const unit = flags & 0xFF;
    const scale = readFloat32(data, 0);
    // UnitType: 0=World 1=Display 2=Pixel 3=Point 4=Inch 5=Document 6=Millimeter
    // 坐标管线当前按设备像素处理，仅 Pixel/Display/World 的 PageScale 可直接相乘，
    // 物理单位（point/inch/mm）需要 DPI 才能换算，暂按 1 处理并记录。
    if (unit <= 2) {
      if (isFinite(scale) && scale > 0) this.emfPlusPageScale = scale;
    } else if (scale !== 1) {
      this._noteUnsupported('EmfPlusSetPageTransform unit=' + unit);
    }
  }

  // 0x4031 EmfPlusResetClip：裁剪区重置为无穷（无裁剪）
  processEmfPlusResetClip() {
    this.ctx.resetClip();
  }

  // 0x4032 EmfPlusSetClipRect：data = RectF(4×float32)，CombineMode 在 flags 位 8..11
  processEmfPlusSetClipRect(flags, data) {
    if (!data || data.length < 16) return;
    const x = readFloat32(data, 0), y = readFloat32(data, 4);
    const w = readFloat32(data, 8), h = readFloat32(data, 12);
    this._emfPlusApplyClip((flags >> 8) & 0x0F, () => {
      const p1 = this._emfPlusMapPoint(x, y);
      const p2 = this._emfPlusMapPoint(x + w, y + h);
      this.ctx.beginPath();
      this.ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    });
  }

  // 0x4033 EmfPlusSetClipPath：路径对象 Id 在 flags 位 0..7
  processEmfPlusSetClipPath(flags, data) {
    const path = this.emfPlusObjects[flags & 0xFF];
    if (!path || path.type !== 'path') return;
    this._emfPlusApplyClip((flags >> 8) & 0x0F, () => this._emfPlusTracePath(path));
  }

  // 0x4034 EmfPlusSetClipRegion：Region 对象尚未解析（见 processEmfPlusObject 的 0x0400 分支）
  processEmfPlusSetClipRegion(flags) {
    const region = this.emfPlusObjects[flags & 0xFF];
    if (!region || region.type !== 'region') {
      this._noteUnsupported('EmfPlusSetClipRegion (Region 对象未解析)');
      return;
    }
    this._noteUnsupported('EmfPlusSetClipRegion');
  }

  // 0x4035 EmfPlusOffsetClip：data = Dx, Dy（float32×2），平移当前裁剪区
  processEmfPlusOffsetClip(flags, data) {
    if (!data || data.length < 8) return;
    this._noteUnsupported('EmfPlusOffsetClip');
  }

  // CombineMode（MS-EMFPLUS 2.1.1.4）：0=Replace 1=Intersect 2=Union 3=Xor 4=Exclude 5=Complement
  // SVG 的 clip-path 只能表达交集，因此：
  //   Replace  —— 精确：清空后设新裁剪区；
  //   Intersect—— 精确：与既有裁剪区求交（SvgContext 用嵌套 clipPath 实现）；
  //   Union    —— 无既有裁剪时精确（并上全集 = 取消裁剪，与 LibreOffice 一致）；
  //                有既有裁剪时无法表达，退化为交集并记录；
  //   Xor/Exclude/Complement —— 无法用单一 clip-path 表达，退化为交集并记录。
  // 所有退化都会进 unsupportedRecords，不会静默丢弃。
  _emfPlusApplyClip(combine, buildPath) {
    if (combine === 0) {                  // Replace
      this.ctx.resetClip();
      buildPath();
      this.ctx.clip();
      return;
    }
    if (combine === 2) {                  // Union
      if (!this.ctx.clipActive) {
        this.ctx.resetClip();             // 与全集求并 = 不裁剪
        return;
      }
      this._noteUnsupported('EMF+ clip Union(存在既有裁剪)');
      buildPath();
      this.ctx.clip();
      return;
    }
    if (combine !== 1) {                  // Xor / Exclude / Complement
      this._noteUnsupported('EMF+ clip CombineMode=' + combine);
    }
    buildPath();                          // Intersect（及各退化分支）
    this.ctx.clip();
  }

  // 补充缺失的处理方法
  processEmfPlusHeader(flags, data) {
    // EmfPlusHeader：data = Version(4) + EmfPlusFlags(4) + ...
    if (data.length >= 4) {
      const version = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
      console.log('EMF+ Header, version: 0x' + version.toString(16));
    }
  }

  // EmfPlusObject：ObjectId = flags & 0xFF；ObjectType 位于 flags 位 8..14（0x7f00）
  //  0x0100=Brush 0x0200=Pen 0x0300=Path 0x0500=Image ...
  // data 起点即对象内容（Image/metafile 等从 data 直接解析）。
  processEmfPlusObject(flags, data) {
    const objectId = flags & 0xFF;
    const objectType = flags & 0x7F00;
    // EmfPlusObject record 数据起点：EmfPlusGraphicsVersion (4 bytes, signature 0xDBC01001) + object-specific data
    // 即先读 graphicsVersion 再交给对象自身的解析
    if (data.length >= 4) data = data.slice(4);
    if (!this._objTypeStats) this._objTypeStats = {};
    this._objTypeStats['0x'+objectType.toString(16)] = (this._objTypeStats['0x'+objectType.toString(16)]||0)+1;
    if (objectType === 0x0100) { // EmfPlusBrush
      // EmfPlusBrush（MS-EMFPLUS 2.2.2.1）：Type(4) + 类型专属数据。
      // data[0] 是 GraphicsVersion（已在上面 slice 掉），故 Type 在 data[0]。
      // 字段布局对照 LibreOffice emfpbrush.cxx 的 EMFPBrush::Read 逐项确认。
      if (data.length < 8) return;
      const brushType = readDword(data, 0);
      if (brushType === 0) { // BrushTypeSolidColor: ARGB
        this.emfPlusObjects[objectId] = { type: 'solidBrush', color: argbToCss(readArgb(data, 4)) };
      } else if (brushType === 1) { // BrushTypeHatchFill: Style(4) + Fore(ARGB) + Back(ARGB)
        const style = readDword(data, 4);
        const fore = argbToCss(readArgb(data, 8));
        const back = argbToCss(readArgb(data, 12));
        this.emfPlusObjects[objectId] = { type: 'hatchBrush', style, fore, back };
      } else if (brushType === 4) { // BrushTypeLinearGradient
        const grad = this._emfPlusParseLinearGradient(data);
        if (grad) this.emfPlusObjects[objectId] = { type: 'gradientBrush', grad };
      } else if (brushType === 3) { // BrushTypePathGradient
        const grad = this._emfPlusParsePathGradient(data);
        if (grad) this.emfPlusObjects[objectId] = { type: 'gradientBrush', grad };
      } else {
        // BrushTypeTextureFill(2) 需要内嵌图像解码，暂不支持；
        // 保留主色兜底以免整块区域丢失。
        const color = this._emfPlusFirstOpaqueArgb(data, 4);
        if (color) this.emfPlusObjects[objectId] = { type: 'solidBrush', color };
        this._noteUnsupported('EmfPlusBrush TextureFill');
      }
    } else if (objectType === 0x0200) { // EmfPlusPen
      // EmfPlusPen（data 已剥离 GraphicsVersion，MS-EMFPLUS 2.2.2.27）：
      // PenType(4,=0) + PenDataFlags(4) + UnitType(4) + PenWidth(float,4) + OptionalData[flags] + Brush
      // OptionalData 顺序：Transform(24) StartCap(4) EndCap(4) Join(4) MiterLimit(4) LineStyle(4)
      //   DashedLineCap(4) DashedLineOffset(4) DashedLineData(4+n*4) Alignment(4)
      //   CompoundLine(4+n*4) CustomStartCap(4+..) CustomEndCap(4+..)；随后固定为 EmfPlusBrush。
      if (data.length < 16) return;
      const penDataFlags = readDword(data, 4);
      const unitType = readDword(data, 8);
      let width = readFloat32(data, 12) || 1;
      let o = 16;
      // 跳过可选字段
      if (penDataFlags & 0x01) o += 24;                    // PenDataTransform: XFORM 6×float
      if (penDataFlags & 0x02) o += 4;                     // StartCap
      if (penDataFlags & 0x04) o += 4;                     // EndCap
      if (penDataFlags & 0x08) o += 4;                     // Join
      if (penDataFlags & 0x10) o += 4;                     // MiterLimit float
      if (penDataFlags & 0x20) o += 4;                     // LineStyle
      if (penDataFlags & 0x40) o += 4;                     // DashedLineCap
      if (penDataFlags & 0x80) o += 4;                     // DashedLineOffset float
      if (penDataFlags & 0x100) {                          // DashedLineData: count + count*float
        const n = o + 4 <= data.length ? readDword(data, o) : 0;
        o += 4 + Math.max(0, Math.min(n, 1000)) * 4;
      }
      if (penDataFlags & 0x200) o += 4;                    // Alignment
      if (penDataFlags & 0x400) {                          // CompoundLine: count + count*float
        const n = o + 4 <= data.length ? readDword(data, o) : 0;
        o += 4 + Math.max(0, Math.min(n, 1000)) * 4;
      }
      if (penDataFlags & 0x800) {                          // CustomStartCap: size + data
        const n = o + 4 <= data.length ? readDword(data, o) : 0;
        o += 4 + Math.max(0, n);
      }
      if (penDataFlags & 0x1000) {                         // CustomEndCap: size + data
        const n = o + 4 <= data.length ? readDword(data, o) : 0;
        o += 4 + Math.max(0, n);
      }
      // 随后固定为 EmfPlusBrush：BrushType(4) + BrushData（Solid=0 → ARGB(4)）
      let color = '#000000';
      if (o + 4 <= data.length) {
        const brushType = readDword(data, o);
        if (brushType === 0 && o + 8 <= data.length) {
          color = argbToCss(readArgb(data, o + 4));
        } else if (brushType !== 0) {
          const c = this._emfPlusFirstOpaqueArgb(data, o + 4);
          if (c) color = c;
        }
      }
      // PenWidth 与坐标同空间使用（不做单位换算，直接输出原始宽度）。
      // 仅当 width<=0 时取最小值 1。
      if (width <= 0) width = 1;
      this.emfPlusObjects[objectId] = { type: 'pen', color, width, penUnit: unitType };
    } else if (objectType === 0x0600) { // EmfPlusFont（U_OT_Font=6）
      // EmfPlusFont（data 已剥离 GraphicsVersion，MS-EMFPLUS 2.2.1.3）：
      // EmSize(float,4) + SizeUnit(4) + StyleFlags(4) + 保留(4，实测为 FaceName 字符数)
      // + FaceName(variable, UTF16LE)。实测 Excel/Office 产出：偏移 16 处 dword = 字体名长度，
      // 如 11 + "Courier New"。
      // 简化实现：取 EmSize 作字号，StyleFlags 解析 bold/italic，字体名映射到通用族。
      let emSize = 12;
      let styleFlags = 0;
      let face = 'sans-serif';
      if (data.length >= 12) {
        emSize = readFloat32(data, 0) || 12;
        styleFlags = readDword(data, 8);
        if (data.length >= 20) {
          const nameLen = readDword(data, 16);
          if (nameLen > 0 && nameLen < 64 && 20 + nameLen * 2 <= data.length) {
            const name = readUtf16Name(data, 20, nameLen);
            face = this._emfPlusFontFamilyFromName(name);
          }
        }
      }
      const weight = (styleFlags & 0x01) ? 'bold' : 'normal'; // FontStyleBold
      const italic = (styleFlags & 0x02) ? 'italic ' : '';
      this.emfPlusObjects[objectId] = { type: 'font', emSize, weight, italic, face };
    } else if (objectType === 0x0700) { // EmfPlusStringFormat
      // EmfPlusStringFormat（MS-EMFPLUS 2.2.1.9）：GraphicsVersion(4) 已剥离，之后为
      //   StringFormatFlags(4) + Language(4) + StringAlignment(4) + LineAlign(4) +
      //   DigitSubstitution(4) + DigitLanguage(4) + FirstTabOffset(f32) + HotkeyPrefix(4) +
      //   LeadingMargin(f32) + TrailingMargin(f32) + Tracking(f32) + Trimming(4) +
      //   TabStopCount(4) + RangeCount(4) + StringFormatData
      // 布局与 LibreOffice emfpstringformat.cxx 的 EMFPStringFormat::Read 逐字段一致。
      if (data.length < 56) return;
      this.emfPlusObjects[objectId] = {
        type: 'stringFormat',
        flags: readDword(data, 0),
        align: readDword(data, 8),          // StringAlignment: 0=Near 1=Center 2=Far
        lineAlign: readDword(data, 12),     // LineAlign:     0=Near 1=Center 2=Far
        digitSubstitution: readDword(data, 16),
        leadingMargin: readFloat32(data, 32),
        trailingMargin: readFloat32(data, 36),
        tracking: readFloat32(data, 40),
        trimming: readDword(data, 44),
        tabStopCount: readDword(data, 48),
        rangeCount: readDword(data, 52),
      };
    } else if (objectType === 0x0400) { // EmfPlusRegion —— 裁剪区域，暂不处理
      // Region 对象（U_OT_Region=4）暂不支持，忽略即可
    } else if (objectType === 0x0300) { // EmfPlusPath —— 解析后存为 { pointTypes, points, ... }
      const parsed = this._emfPlusParsePath(data);
      if (parsed) {
        this.emfPlusObjects[objectId] = { type: 'path', ...parsed };
      } else {
        this.emfPlusObjects[objectId] = { type: 'path', data };
      }
    } else if (objectType === 0x0500) { // EmfPlusImage
      if (data.length < 8) return;
      const type = readDword(data, 4);
      if (type === 1) { // bitmap
        // width(8) height(12) stride(16) pixelFormat(20) bitmapType(24)
        const bitmapType = data.length >= 28 ? readDword(data, 24) : 0;
        if ((bitmapType === 1 || bitmapType === 2) && data.length > 28) {
          // PNG / JPEG 原生编码直接引用
          const mime = bitmapType === 1 ? 'image/png' : 'image/jpeg';
          const b64 = Buffer.from(data.slice(28)).toString('base64');
          this.emfPlusObjects[objectId] = { type: 'imageData', href: 'data:' + mime + ';base64,' + b64 };
        } else {
          // 原生像素格式（BITMAPINFO + 像素）后续扩展
        }
      } else if (type === 2) { // metafile（内嵌 EMF/WMF）
        const mfType = data.length >= 16 ? readDword(data, 8) : 0;
        const mfSize = data.length >= 16 ? readDword(data, 12) : 0;
        if (mfType === 3 && mfSize > 0 && 16 + mfSize <= data.length) {
          this.emfPlusObjects[objectId] = { type: 'imageEmf', data: data.slice(16, 16 + mfSize) };
        }
      }
    } else {
      console.log('EMF+ Object #' + objectId, 'objType 0x' + objectType.toString(16));
    }
  }

  // EmfPlusClear：data = ARGB(4)，用指定颜色填充整个画布
  processEmfPlusClear(flags, data) {
    if (data.length < 4) return;
    const argb = readArgb(data, 0);
    const color = argbToCss(argb);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    console.log('EMF+ Clear:', color);
  }

  // EmfPlusFillRects（0x400A，MS-EMFPLUS 2.3.4.20）：
  // data = BrushId(4) + Count(4) + Rect[Count]。BrushId 为 ARGB（flags&0x8000）或对象表索引；
  // flags&0x4000（U_PPF_C）为 1 时矩形是 4×int16（8 字节），否则 4×float32（16 字节）。
  processEmfPlusFillRectangles(flags, data) {
    if (data.length < 8) return;
    const brushId = readDword(data, 0);
    const count = readDword(data, 4);
    if (count < 1 || count > 4096) return; // 防异常计数
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    const int16 = (flags & 0x4000) !== 0;
    const step = int16 ? 8 : 16;
    this.ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const o = 8 + i * step;
      if (o + step > data.length) break;
      const x = int16 ? readShort(data, o) : readFloat32(data, o);
      const y = int16 ? readShort(data, o + 2) : readFloat32(data, o + 4);
      const w = int16 ? readShort(data, o + 4) : readFloat32(data, o + 8);
      const h = int16 ? readShort(data, o + 6) : readFloat32(data, o + 12);
      const tl = this._emfPlusMapPoint(x, y);
      const br = this._emfPlusMapPoint(x + w, y + h);
      this.ctx.fillRect(tl.x, tl.y, Math.abs(br.x - tl.x), Math.abs(br.y - tl.y));
    }
    console.log('EMF+ FillRects:', count, '个矩形');
  }

  // EmfPlusDrawRects：body = Count(4) + RectF[Count]；画笔由 flags 低字节指定
  processEmfPlusDrawRectangles(flags, data) {
    if (data.length < 4) return;
    const penId = flags & 0xFF;
    const count = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    if (count > 4096) return;
    const pen = this._emfPlusResolvePen(penId);
    if (!pen || !pen.color) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    for (let i = 0; i < count; i++) {
      const o = 4 + i * 16;
      if (o + 16 > data.length) break;
      const x = readFloat32(data, o);
      const y = readFloat32(data, o + 4);
      const w = readFloat32(data, o + 8);
      const h = readFloat32(data, o + 12);
      const tl = this._emfPlusMapPoint(x, y);
      const br = this._emfPlusMapPoint(x + w, y + h);
      this.ctx.strokeRect(tl.x, tl.y, Math.abs(br.x - tl.x), Math.abs(br.y - tl.y));
    }
    console.log('EMF+ DrawRects:', count, '个矩形');
  }

}

module.exports = EmfPlusDrawer;