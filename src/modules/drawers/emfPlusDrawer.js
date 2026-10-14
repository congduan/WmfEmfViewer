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
  0x4025: null,                  // EmfPlusSave
  0x4026: null,               // EmfPlusRestore
  0x4027: null,        // EmfPlusBeginContainer
  0x4028: null, // EmfPlusBeginContainerNoParams
  0x4029: null,          // EmfPlusEndContainer
  0x402A: null,     // EmfPlusSetWorldTransform
  0x402B: null,   // EmfPlusResetWorldTransform
  0x402C: null, // EmfPlusMultiplyWorldTransform
  0x402D: null, // EmfPlusTranslateWorldTransform
  0x402E: null,   // EmfPlusScaleWorldTransform
  0x402F: null,  // EmfPlusRotateWorldTransform
  0x4030: null,      // EmfPlusSetPageTransform

  // ========== 裁剪 ==========
  0x4031: null,          // EmfPlusResetClip
  0x4032: null,        // EmfPlusSetClipRect
  0x4033: null,        // EmfPlusSetClipPath
  0x4034: null,      // EmfPlusSetClipRegion
  0x4035: null,         // EmfPlusOffsetClip

  // ========== 其他 ==========
  0x4037: null,       // EmfPlusStrokeFillPath (非标准)
  0x4038: null,   // EmfPlusSerializableObject
  0x4039: null,        // EmfPlusSetTSGraphics
  0x403A: null             // EmfPlusSetTSClip
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
    if (obj && obj.type === 'solidBrush') {
      return obj.color;
    }
    // 兜底（容错）：BrushId 超出对象表范围则视为 ARGB 颜色直传
    if (brushId > 63 || brushId >= 0x01000000) {
      return argbToCss(brushId);
    }
    return '#000000';
  }

  // 解析画笔对象 -> { color, width }
  _emfPlusResolvePen(penId) {
    const obj = this.emfPlusObjects[penId >>> 0];
    if (obj && obj.type === 'pen') {
      return { color: obj.color, width: obj.width };
    }
    return { color: '#000000', width: 1 };
  }

  // 坐标映射（EMF+ 坐标通常与 EMF 设备坐标一致，经由 coordinateTransformer）
  _emfPlusMapPoint(x, y) {
    const t = this.coordinateTransformer.transform(x, y);
    return t;
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
      const s = Math.abs(b.x - a.x) / 100;
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
    if (fontObj && fontObj.type === 'font') {
      const scale = this._emfPlusUnitsToPx();
      const sz = Math.max(4, Math.round(fontObj.emSize * scale));
      drawSize = sz;
      this.ctx.font = `${fontObj.italic}${fontObj.weight} ${sz}px "${fontObj.face}"`;
    }
    const p = this._emfPlusMapPoint(layoutX, layoutY);
    this.ctx.fillText(text, p.x, p.y + drawSize);
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
      if (data.length < 8) return;
      const brushType = readDword(data, 0);
      if (brushType === 0) { // Solid: EmfPlusSolidBrushData = ARGB
        const argb = readArgb(data, 4);
        this.emfPlusObjects[objectId] = { type: 'solidBrush', color: argbToCss(argb) };
      } else if (brushType === 1 || brushType === 3 || brushType === 4) {
        // Hatch/PathGradient/LinearGradient：完整解析较复杂（可选字段随 BrushDataFlags 变化），
        // 这里启发式提取首个不透明（alpha>=0x80）ARGB 作为主色——对静态渲染已足够接近。
        const color = this._emfPlusFirstOpaqueArgb(data, 4);
        if (color) this.emfPlusObjects[objectId] = { type: 'solidBrush', color };
      }
      // Texture 后续扩展
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