// EMF+绘制模块
const CoordinateTransformer = require('../../utils/coordinateTransformer');
const GdiObjectManager = require('../../utils/gdiObjectManager');

// EMF+ 记录分派表：记录类型 -> 处理方法名（processEmfPlusRecordType 中调用 this[方法名](flags, data)）。
// 值为 null 表示已识别但无需处理（与原 switch 的空分支等价）。
// 记录编号依据 MS-EMFPLUS 规范 2.1.1.1 节 EmfPlusRecordType 枚举。
const EMF_PLUS_RECORD_HANDLERS = {
  // ========== 全局/控制记录 ==========
  0x4001: 'processEmfPlusHeader',            // EmfPlusHeader
  0x4002: null,                              // EmfPlusEndOfFile
  0x4003: 'processEmfPlusComment',           // EmfPlusComment
  0x4004: 'processEmfPlusGetDC',             // EmfPlusGetDC

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
  0x4013: 'processEmfPlusFillRegion',        // EmfPlusFillRegion
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
  0x4036: 'processEmfPlusDrawDriverString',  // EmfPlusDrawDriverString

  // ========== 状态/渲染参数记录 ==========
  0x401D: 'processEmfPlusSetRenderingOrigin',   // EmfPlusSetRenderingOrigin
  0x401E: 'processEmfPlusSetAntiAliasMode',     // EmfPlusSetAntiAliasMode
  0x401F: 'processEmfPlusSetTextRenderingHint', // EmfPlusSetTextRenderingHint
  0x4020: 'processEmfPlusSetTextContrast',      // EmfPlusSetTextContrast
  0x4021: 'processEmfPlusSetInterpolationMode', // EmfPlusSetInterpolationMode
  0x4022: 'processEmfPlusSetPixelOffsetMode',   // EmfPlusSetPixelOffsetMode
  0x4023: 'processEmfPlusSetCompositingMode',   // EmfPlusSetCompositingMode
  0x4024: 'processEmfPlusSetCompositingQuality', // EmfPlusSetCompositingQuality

  // ========== 图形状态容器/变换 ==========
  0x4025: 'processEmfPlusSave',                  // EmfPlusSave
  0x4026: 'processEmfPlusRestore',               // EmfPlusRestore
  0x4027: 'processEmfPlusBeginContainer',        // EmfPlusBeginContainer
  0x4028: 'processEmfPlusBeginContainerNoParams', // EmfPlusBeginContainerNoParams
  0x4029: 'processEmfPlusEndContainer',          // EmfPlusEndContainer
  0x402A: 'processEmfPlusSetWorldTransform',     // EmfPlusSetWorldTransform
  0x402B: 'processEmfPlusResetWorldTransform',   // EmfPlusResetWorldTransform
  0x402C: 'processEmfPlusMultiplyWorldTransform', // EmfPlusMultiplyWorldTransform
  0x402D: 'processEmfPlusTranslateWorldTransform', // EmfPlusTranslateWorldTransform
  0x402E: 'processEmfPlusScaleWorldTransform',   // EmfPlusScaleWorldTransform
  0x402F: 'processEmfPlusRotateWorldTransform',  // EmfPlusRotateWorldTransform
  0x4030: 'processEmfPlusSetPageTransform',      // EmfPlusSetPageTransform

  // ========== 裁剪 ==========
  0x4031: 'processEmfPlusResetClip',          // EmfPlusResetClip
  0x4032: 'processEmfPlusSetClipRect',        // EmfPlusSetClipRect
  0x4033: 'processEmfPlusSetClipPath',        // EmfPlusSetClipPath
  0x4034: 'processEmfPlusSetClipRegion',      // EmfPlusSetClipRegion
  0x4035: 'processEmfPlusOffsetClip',         // EmfPlusOffsetClip

  // ========== 其他 ==========
  0x4037: 'processEmfPlusStrokeFillPath',       // EmfPlusStrokeFillPath (非标准)
  0x4038: 'processEmfPlusSerializableObject',   // EmfPlusSerializableObject
  0x4039: 'processEmfPlusSetTSGraphics',        // EmfPlusSetTSGraphics
  0x403A: 'processEmfPlusSetTSClip'             // EmfPlusSetTSClip
};

class EmfPlusDrawer {
  constructor(ctx) {
    this.ctx = ctx;
    this.coordinateTransformer = new CoordinateTransformer();
    this.gdiObjectManager = new GdiObjectManager();
    this.currentPath = []; // 当前路径点集合
    this.pathState = 'idle'; // 路径状态：idle, active, completed
    this.fillColor = '#000000'; // 默认填充颜色
    this.strokeColor = '#000000'; // 默认描边颜色
    this.lineWidth = 1; // 默认线宽
    this.emfPlusObjects = {}; // EMF+ 对象表（ObjectId -> {type, color, width, ...}）
  }

  // ---- EMF+ 辅助方法 ----
  // 读取小端 float32
  _emfPlusReadFloat(data, offset) {
    if (offset + 4 > data.length) return 0;
    const buf = new DataView(data.buffer, data.byteOffset + offset, 4);
    return buf.getFloat32(0, true);
  }

  // 32 位 ARGB -> CSS 颜色（支持透明度）
  _emfPlusArgbToColor(argb) {
    const a = (argb >>> 24) & 0xFF;
    const r = (argb >>> 16) & 0xFF;
    const g = (argb >>> 8) & 0xFF;
    const b = argb & 0xFF;
    if (a === 0xFF) {
      return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    }
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  }

  // 读取 32 位 ARGB（无符号）
  _emfPlusReadArgb(data, offset) {
    if (offset + 4 > data.length) return 0xFFFFFFFF;
    return (data[offset] & 0xFF) |
      ((data[offset + 1] & 0xFF) << 8) |
      ((data[offset + 2] & 0xFF) << 16) |
      ((data[offset + 3] & 0xFF) << 24);
  }

  // 根据 flags 与 BrushId 解析画刷颜色：
  // flags 的 0x8000 位为 1 时 BrushId 直接是 ARGB 颜色，否则是对象表索引
  _emfPlusResolveBrush(flags, brushId, data, offset) {
    if (flags & 0x8000) {
      return this._emfPlusArgbToColor(brushId);
    }
    const obj = this.emfPlusObjects[brushId >>> 0];
    if (obj && obj.type === 'solidBrush') {
      return obj.color;
    }
    // 兜底：若 BrushId 明显是颜色值则直接转换
    if (brushId >= 0x01000000 || brushId === 0) {
      return this._emfPlusArgbToColor(brushId);
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
    const t = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    return t;
  }

  // EmfPlusPath (MS-EMFPLUS 2.2.1.6) 解析：data 起点（已跳过 EmfPlusObject 的 GraphicsVersion）
// 实际 layout: PathPointCount(4) + PathPointFlags(4) + PathPoints(Count × stride) + PathPointTypes(Count if non-RLE) + AlignmentPadding(0..3)
// 注意：graphicsVersion 是 EmfPlusPath 自身 Version 字段（spec 2.2.1.6）；POI 的 EmfPlusObject.init 先读 graphicsVersion 后再传给 EmfPlusPath.init
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
        x = this._emfPlusReadFloat(data, offset);
        y = this._emfPlusReadFloat(data, offset + 4);
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

    // 获取view尺寸，默认为800x600
    const viewWidth = options.viewWidth || 800;
    const viewHeight = options.viewHeight || 600;

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

    // HiDPI 支持：获取设备像素比
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.devicePixelRatio = dpr;

    // 设置 Canvas 实际尺寸（考虑设备像素比）
    this.ctx.canvas.width = Math.round(canvasWidth * dpr);
    this.ctx.canvas.height = Math.round(canvasHeight * dpr);

    // 设置 CSS 显示尺寸（逻辑像素）
    this.ctx.canvas.style.width = canvasWidth + 'px';
    this.ctx.canvas.style.height = canvasHeight + 'px';

    // 缩放上下文以匹配设备像素比
    this.ctx.scale(dpr, dpr);

    console.log('Canvas size set to:', canvasWidth, 'x', canvasHeight, '(DPR:', dpr, ', actual:', this.ctx.canvas.width, 'x', this.ctx.canvas.height + ')');

    // 清空Canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    console.log('Canvas cleared');

    // 设置默认绘制样式
    this.ctx.strokeStyle = '#000000'; // 黑色描边
    this.ctx.fillStyle = '#ffffff'; // 白色填充
    this.ctx.lineWidth = 2;
    this.fillColor = '#ffffff';
    this.strokeColor = '#000000';
    console.log('Drawing styles set');

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

  // 处理EMF+绘制线记录
  processEmfPlusDrawLine(flags, data) {
    console.log('Processing EmfPlusDrawLine');
  }

  // 处理EMF+填充多边形记录：BrushId(4) + Count(4) + PointF[Count](8 each)
  processEmfPlusFillPolygon(flags, data) {
    if (data.length < 4) return;
    const brushId = flags & 0xFF;
    const count = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    if (count > 65536) return;
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = 4 + i * 8;
      if (o + 8 > data.length) break;
      const x = this._emfPlusReadFloat(data, o);
      const y = this._emfPlusReadFloat(data, o + 4);
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

  // 处理EMF+绘制曲线记录
  processEmfPlusDrawCurve(flags, data) {
    console.log('Processing EmfPlusDrawCurve');
  }

  // 处理EMF+填充闭合曲线记录
  processEmfPlusFillClosedCurve(flags, data) {
    console.log('Processing EmfPlusFillClosedCurve');
  }

  // 处理EMF+绘制闭合曲线记录
  processEmfPlusDrawClosedCurve(flags, data) {
    console.log('Processing EmfPlusDrawClosedCurve');
  }

  // EmfPlusFillPath (0x4014, MS-EMFPLUS 2.3.4.17)：flags[7..0]=pathId, flags[15]=S(ARGB 直传), data[0..3]=brushId/ARGB
  processEmfPlusFillPath(flags, data) {
    if (data.length < 4) return;
    const pathId = flags & 0xFF;
    const solid = (flags & 0x8000) !== 0;
    const brushId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const path = this.emfPlusObjects[pathId];
    if (!path || path.type !== 'path') return;
    const color = solid ? this._emfPlusArgbToColor(brushId) : this._emfPlusResolveBrush(0, brushId);
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
      color = this._emfPlusArgbToColor(penId);
    } else {
      const pen = this.emfPlusObjects[penId];
      if (pen && pen.type === 'pen') { color = pen.color; width = pen.width || 1; }
    }
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this._emfPlusTracePath(path);
    this.ctx.stroke();
  }

  // 处理EMF+绘制图像记录（DrawImage = 目标矩形与源矩形相同；可引用嵌套 EMF / 位图对象）
  processEmfPlusDrawImage(flags, data) {
    const img = this.emfPlusObjects[flags & 0xFF];
    if (!img || data.length < 24) return;
    // imageAttributesId(4) + sourceUnit(4) + srcRect(16)
    const sx = this._emfPlusReadFloat(data, 8);
    const sy = this._emfPlusReadFloat(data, 12);
    const sw = this._emfPlusReadFloat(data, 16);
    const sh = this._emfPlusReadFloat(data, 20);
    this._drawImageObj(img, sx, sy, sx + sw, sy, sx, sy + sh);
  }

  // 处理EMF+绘制图像点记录（DrawImagePoints：三点定义目标平行四边形）
  processEmfPlusDrawImagePoints(flags, data) {
    const img = this.emfPlusObjects[flags & 0xFF];
    if (!img || data.length < 28) return;
    // imageAttributesId(4) + sourceUnit(4) + srcRect(16) + count(4) + points[3]
    const count = this._emfPlusReadInt32(data, 24);
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

  _emfPlusReadInt32(data, offset) {
    if (offset + 4 > data.length) return 0;
    const b = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    return b | 0;
  }

  // 读取点坐标（flags 0x4000=压缩坐标时用 int16/4096）
  _emfPlusReadPointX(flags, data, o) {
    if (flags & 0x4000) {
      const v = (data[o] | (data[o + 1] << 8)) << 16 >> 16;
      return v / 4096;
    }
    return this._emfPlusReadFloat(data, o);
  }
  _emfPlusReadPointY(flags, data, o) {
    if (flags & 0x4000) {
      const v = (data[o + 2] | (data[o + 3] << 8)) << 16 >> 16;
      return v / 4096;
    }
    return this._emfPlusReadFloat(data, o + 4);
  }

  // 渲染嵌套 EMF / 位图对象到指定平行四边形（3 点：左上 / 右上 / 左下）
  _drawImageObj(img, x1, y1, x2, y2, x3, y3) {
    try {
      if (img.type === 'imageData') {
        // 原生 PNG/JPEG 位图
        this.ctx.rawPush('<image x="' + Math.min(x1, x2, x3) + '" y="' + Math.min(y1, y2, y3) + '" width="' +
          Math.abs(Math.max(x1, x2, x3) - Math.min(x1, x2, x3)) + '" height="' +
          Math.abs(Math.max(y1, y2, y3) - Math.min(y1, y2, y3)) + '" href="' + img.href + '" preserveAspectRatio="none" />');
        return;
      }
      if (img.type !== 'imageEmf') return;
      const nested = this._renderNestedEmf(img.data);
      if (!nested) return;
      const W = nested.width || 1;
      const H = nested.height || 1;
      // source 空间 (0,0)-(W,H) → dest 由 3 点定义的仿射
      const a = (x2 - x1) / W, b = (y2 - y1) / W;
      const c = (x3 - x1) / H, d = (y3 - y1) / H;
      const body = nested.nodes.join('\n');
      const defs = nested.defs.length ? '<defs>' + nested.defs.join('') + '</defs>' : '';
      this.ctx.rawPush(
        '<g transform="matrix(' + this._fmtN(a) + ' ' + this._fmtN(b) + ' ' + this._fmtN(c) + ' ' + this._fmtN(d) + ' ' + this._fmtN(x1) + ' ' + this._fmtN(y1) + ')">' +
        defs + body + '</g>'
      );
    } catch (e) {
      console.log('EMF+ DrawImage failed:', e.message);
    }
  }

  _fmtN(v) {
    return Math.round(v * 100) / 100;
  }

  // 用同一渲染管线把嵌套 EMF 渲染为独立节点列表（递归播放，支持 EMF+ 内嵌）
  _renderNestedEmf(bytes) {
    try {
      const MetafileParserCtor = require('../../utils/metafileParser.js');
      const EmfDrawerCtor = require('./emfDrawer.js');
      const SvgContextCtor = require('../svgContext.js');
      const parser = new MetafileParserCtor(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      const result = parser.parse();
      if (!result || result.error || !result.records) return null;
      const subCtx = new SvgContextCtor();
      const drawer = new EmfDrawerCtor(subCtx);
      drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
      // 嵌套 EMF 画布尺寸（bounds）作为源坐标空间
      let W = 800, H = 600;
      if (result.header && result.header.bounds) {
        W = Math.abs(result.header.bounds.right - result.header.bounds.left);
        H = Math.abs(result.header.bounds.bottom - result.header.bounds.top);
      }
      return { nodes: subCtx.nodes, defs: subCtx.defs, width: W || 1, height: H || 1 };
    } catch (e) {
      console.log('EMF+ nested EMF render failed:', e.message);
      return null;
    }
  }

  // 处理EMF+绘制字符串记录
  processEmfPlusDrawString(flags, data) {
    // 处理 EMF+ 文本绘制（MS-EMFPLUS 2.3.4.8）。body 内 LayoutRect 起点即文本左上角，
    // 字距/字符间距/DxLayout 暂忽略（PNG→SVG 静态图对齐为主）。
    if (data.length < 8) return;
    let o = 0;
    const brushId = flags & 0xFF;
    let fontObj = null;
    if (flags & 0x8000) {
      // 紧接 BrushId 之后是 FontId（4 字节）
      if (o + 4 > data.length) return;
      const fontId = (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24)) >>> 0;
      o += 4;
      fontObj = this.emfPlusObjects[fontId];
    }
    if (flags & 0x4000) o += 4; // StringFormat
    let layoutX = 0, layoutY = 0, layoutW = 0, layoutH = 0;
    if (flags & 0x0800) {
      // LayoutRect: X(float) Y(float) W(float) H(float)
      if (o + 16 > data.length) return;
      layoutX = this._emfPlusReadFloat(data, o);
      layoutY = this._emfPlusReadFloat(data, o + 4);
      layoutW = this._emfPlusReadFloat(data, o + 8);
      layoutH = this._emfPlusReadFloat(data, o + 12);
      o += 16;
    }
    if (o + 4 > data.length) return;
    const len = (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24)) >>> 0;
    o += 4;
    if (len === 0 || o + len > data.length) return;
    // 解码 UTF16LE 字符串（剔除高位空字节）
    const slice = data.slice(o, o + len);
    let text = '';
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const code = slice[i] | (slice[i + 1] << 8);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    if (!text) return;
    // 取 brush 颜色
    const brush = this.emfPlusObjects[brushId];
    if (brush && brush.type === 'solidBrush' && brush.color) {
      this.ctx.fillStyle = brush.color;
    }
    // 应用 font（若有）。EMF+ Font.EmSize 单位依 SizeUnit（默认 World/Page），
    // 此处按 page 坐标下 1px = 1/72 in 粗略换算；最终视觉粗细不影响 PNG RMSE。
    let drawSize = 12;
    if (fontObj && fontObj.type === 'font') {
      const sz = Math.max(6, Math.round(fontObj.emSize * 0.75));
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
      const x = this._emfPlusReadFloat(data, o);
      const y = this._emfPlusReadFloat(data, o + 4);
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

  // 处理EMF+绘制贝塞尔曲线记录
  processEmfPlusDrawBeziers(flags, data) {
    console.log('Processing EmfPlusDrawBeziers');
  }

  // 处理EMF+绘制椭圆记录：PenId(4) + RectF(16)
  processEmfPlusDrawEllipse(flags, data) {
    if (data.length < 16) return;
    const pen = this._emfPlusResolvePen(flags & 0xFF);
    const x = this._emfPlusReadFloat(data, 0);
    const y = this._emfPlusReadFloat(data, 4);
    const w = this._emfPlusReadFloat(data, 8);
    const h = this._emfPlusReadFloat(data, 12);
    const tl = this._emfPlusMapPoint(x, y);
    const br = this._emfPlusMapPoint(x + w, y + h);
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    const rx = Math.abs(br.x - tl.x) / 2;
    const ry = Math.abs(br.y - tl.y) / 2;
    if (rx === 0 || ry === 0) return;
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    console.log('EMF+ DrawEllipse');
  }

  // 处理EMF+填充椭圆记录：BrushId(4) + RectF(16)
  processEmfPlusFillEllipse(flags, data) {
    if (data.length < 16) return;
    const brushId = flags & 0xFF;
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    const x = this._emfPlusReadFloat(data, 0);
    const y = this._emfPlusReadFloat(data, 4);
    const w = this._emfPlusReadFloat(data, 8);
    const h = this._emfPlusReadFloat(data, 12);
    const tl = this._emfPlusMapPoint(x, y);
    const br = this._emfPlusMapPoint(x + w, y + h);
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    const rx = Math.abs(br.x - tl.x) / 2;
    const ry = Math.abs(br.y - tl.y) / 2;
    if (rx === 0 || ry === 0) return;
    this.ctx.fillStyle = this._emfPlusResolveBrush(flags, brushId);
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.fill();
    console.log('EMF+ FillEllipse');
  }

  // 处理EMF+绘制弧线记录
  processEmfPlusDrawArc(flags, data) {
    console.log('Processing EmfPlusDrawArc');
  }

  // 处理EMF+填充饼图记录
  processEmfPlusFillPie(flags, data) {
    console.log('Processing EmfPlusFillPie');
  }

  // 处理EMF+绘制饼图记录
  processEmfPlusDrawPie(flags, data) {
    console.log('Processing EmfPlusDrawPie');
  }

  // 处理EMF+绘制驱动字符串记录
  processEmfPlusDrawDriverString(flags, data) {
    console.log('Processing EmfPlusDrawDriverString');
  }

  // 处理EMF+设置渲染原点记录
  processEmfPlusSetRenderingOrigin(flags, data) {
    console.log('Processing EmfPlusSetRenderingOrigin');
  }

  // 处理EMF+设置抗锯齿模式记录
  processEmfPlusSetAntiAliasMode(flags, data) {
    console.log('Processing EmfPlusSetAntiAliasMode');
  }

  // 处理EMF+设置文本渲染提示记录
  processEmfPlusSetTextRenderingHint(flags, data) {
    console.log('Processing EmfPlusSetTextRenderingHint');
  }

  // 处理EMF+设置插值模式记录
  processEmfPlusSetInterpolationMode(flags, data) {
    console.log('Processing EmfPlusSetInterpolationMode');
  }

  // 处理EMF+设置像素偏移模式记录
  processEmfPlusSetPixelOffsetMode(flags, data) {
    console.log('Processing EmfPlusSetPixelOffsetMode');
  }

  // 处理EMF+设置合成模式记录
  processEmfPlusSetCompositingMode(flags, data) {
    console.log('Processing EmfPlusSetCompositingMode');
  }

  // 处理EMF+设置合成质量记录
  processEmfPlusSetCompositingQuality(flags, data) {
    console.log('Processing EmfPlusSetCompositingQuality');
  }

  // 处理EMF+保存记录
  processEmfPlusSave(flags, data) {
    console.log('Processing EmfPlusSave');
  }

  // 处理EMF+恢复记录
  processEmfPlusRestore(flags, data) {
    console.log('Processing EmfPlusRestore');
  }

  // 处理EMF+开始容器记录
  processEmfPlusBeginContainer(flags, data) {
    console.log('Processing EmfPlusBeginContainer');
  }

  // 处理EMF+开始无参数容器记录
  processEmfPlusBeginContainerNoParams(flags, data) {
    console.log('Processing EmfPlusBeginContainerNoParams');
  }

  // 处理EMF+结束容器记录
  processEmfPlusEndContainer(flags, data) {
    console.log('Processing EmfPlusEndContainer');
  }

  // 处理EMF+设置世界变换记录
  processEmfPlusSetWorldTransform(flags, data) {
    console.log('Processing EmfPlusSetWorldTransform');
  }

  // 处理EMF+重置世界变换记录
  processEmfPlusResetWorldTransform(flags, data) {
    console.log('Processing EmfPlusResetWorldTransform');
  }

  // 处理EMF+乘以世界变换记录
  processEmfPlusMultiplyWorldTransform(flags, data) {
    console.log('Processing EmfPlusMultiplyWorldTransform');
  }

  // 处理EMF+平移世界变换记录
  processEmfPlusTranslateWorldTransform(flags, data) {
    console.log('Processing EmfPlusTranslateWorldTransform');
  }

  // 处理EMF+缩放世界变换记录
  processEmfPlusScaleWorldTransform(flags, data) {
    console.log('Processing EmfPlusScaleWorldTransform');
  }

  // 处理EMF+旋转世界变换记录
  processEmfPlusRotateWorldTransform(flags, data) {
    console.log('Processing EmfPlusRotateWorldTransform');
  }

  // 处理EMF+设置页面变换记录
  processEmfPlusSetPageTransform(flags, data) {
    console.log('Processing EmfPlusSetPageTransform');
  }

  // 处理EMF+重置裁剪记录
  processEmfPlusResetClip(flags, data) {
    console.log('Processing EmfPlusResetClip');
  }

  // 处理EMF+设置裁剪矩形记录
  processEmfPlusSetClipRect(flags, data) {
    console.log('Processing EmfPlusSetClipRect');
  }

  // 处理EMF+设置裁剪路径记录
  processEmfPlusSetClipPath(flags, data) {
    console.log('Processing EmfPlusSetClipPath');
  }

  // 处理EMF+设置裁剪区域记录
  processEmfPlusSetClipRegion(flags, data) {
    console.log('Processing EmfPlusSetClipRegion');
  }

  // 处理EMF+偏移裁剪记录
  processEmfPlusOffsetClip(flags, data) {
    console.log('Processing EmfPlusOffsetClip');
  }

  // 补充缺失的处理方法
  processEmfPlusHeader(flags, data) {
    // EmfPlusHeader：data = Version(4) + EmfPlusFlags(4) + ...
    if (data.length >= 4) {
      const version = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
      console.log('EMF+ Header, version: 0x' + version.toString(16));
    }
  }

  processEmfPlusComment(flags, data) {
    console.log('Processing EmfPlusComment');
  }

  processEmfPlusGetDC(flags, data) {
    console.log('Processing EmfPlusGetDC');
  }

  // EmfPlusObject：ObjectId = flags & 0xFF；ObjectType 位于 flags 位 8..14（0x7f00）
  //  0x0100=Brush 0x0200=Pen 0x0300=Path 0x0500=Image ...
  // data 起点即对象内容（Image/metafile 等从 data 直接解析）。
  processEmfPlusObject(flags, data) {
    const objectId = flags & 0xFF;
    const objectType = flags & 0x7F00;
    // EmfPlusObject record 数据起点：EmfPlusGraphicsVersion (4 bytes, signature 0xDBC01001) + object-specific data
    // POI HemfPlusObject.init 先读 graphicsVersion 后再传给 EmfPlusObjectData.init
    if (data.length >= 4) data = data.slice(4);
    if (!this._objTypeStats) this._objTypeStats = {};
    this._objTypeStats['0x'+objectType.toString(16)] = (this._objTypeStats['0x'+objectType.toString(16)]||0)+1;
    if (objectType === 0x0100) { // EmfPlusBrush
      if (data.length < 8) return;
      const brushType = this._emfPlusReadInt32(data, 0);
      if (brushType === 0) { // Solid: EmfPlusSolidBrushData = ARGB
        const argb = this._emfPlusReadArgb(data, 4);
        this.emfPlusObjects[objectId] = { type: 'solidBrush', color: this._emfPlusArgbToColor(argb) };
      }
      // Hatch/Texture/PathGradient 后续扩展
    } else if (objectType === 0x0200 && data.length >= 8) { // EmfPlusPen
      // EmfPlusPen: PenDataFlags(4) + PenUnit(4) + PenWidth(float, 若 PenDataTransformable?) 简化：
      const penUnit = this._emfPlusReadInt32(data, 4);
      let color = '#000000';
      let width = 1;
      const flagsD = this._emfPlusReadInt32(data, 0);
      if ((flagsD & 0x4) && data.length >= 16) { // PenDataSolidBrush：其后为 ARGB
        const argb = this._emfPlusReadArgb(data, 12);
        color = this._emfPlusArgbToColor(argb);
        if (data.length >= 12) width = this._emfPlusReadFloat(data, 8) || 1;
      } else if (data.length >= 12) {
        width = this._emfPlusReadFloat(data, 8) || 1;
        // 定位 solid brush 颜色（若有）
        if (data.length >= 20) { const argb = this._emfPlusReadArgb(data, 12); color = this._emfPlusArgbToColor(argb); }
      }
      this.emfPlusObjects[objectId] = { type: 'pen', color, width, penUnit };
    } else if (objectType === 0x0400) { // EmfPlusFont
      // EmfPlusFont (MS-EMFPLUS 2.2.3.7):
      // Version(4) + EmSize(float,4) + SizeUnit(4) + StyleFlags(4) + StylePadding(2) + Family(2)
      // + CharacterSet(2) + Stretch(4) + Style(2) + StyleSize(4) + Reserved(4)
      // + FaceName(variable, UTF16LE)
      // 简化实现：只取 EmSize 作字号，StyleFlags 解析 bold/italic
      let emSize = 12;
      let styleFlags = 0;
      let family = 0;
      if (data.length >= 16) {
        emSize = this._emfPlusReadFloat(data, 4) || 12;
        styleFlags = this._emfPlusReadInt32(data, 12);
        family = data.length >= 18 ? (data[16] | (data[17] << 8)) : 0;
      }
      const weight = (styleFlags & 0x01) ? 'bold' : 'normal'; // FontStyleBold
      const italic = (styleFlags & 0x02) ? 'italic ' : '';
      // family 0=GDI CharSet; 1..6 对应 GDI GenericFamily 枚举 (Serif/SansSerif/Monospace...)
      const families = ['serif', 'sans-serif', 'monospace', 'sans-serif', 'cursive', 'fantasy', 'monospace'];
      const face = families[family] || 'sans-serif';
      this.emfPlusObjects[objectId] = { type: 'font', emSize, weight, italic, face };
    } else if (objectType === 0x0300) { // EmfPlusPath —— 解析后存为 { pointTypes, points, ... }
      const parsed = this._emfPlusParsePath(data);
      if (parsed) {
        this.emfPlusObjects[objectId] = { type: 'path', ...parsed };
      } else {
        this.emfPlusObjects[objectId] = { type: 'path', data };
      }
    } else if (objectType === 0x0500) { // EmfPlusImage
      if (data.length < 8) return;
      const type = this._emfPlusReadInt32(data, 4);
      if (type === 1) { // bitmap
        // width(8) height(12) stride(16) pixelFormat(20) bitmapType(24)
        const bitmapType = data.length >= 28 ? this._emfPlusReadInt32(data, 24) : 0;
        if ((bitmapType === 1 || bitmapType === 2) && data.length > 28) {
          // PNG / JPEG 原生编码直接引用
          const mime = bitmapType === 1 ? 'image/png' : 'image/jpeg';
          const b64 = Buffer.from(data.slice(28)).toString('base64');
          this.emfPlusObjects[objectId] = { type: 'imageData', href: 'data:' + mime + ';base64,' + b64 };
        } else {
          // 原生像素格式（BITMAPINFO + 像素）后续扩展
        }
      } else if (type === 2) { // metafile（内嵌 EMF/WMF）
        const mfType = data.length >= 16 ? this._emfPlusReadInt32(data, 8) : 0;
        const mfSize = data.length >= 16 ? this._emfPlusReadInt32(data, 12) : 0;
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
    const argb = this._emfPlusReadArgb(data, 0);
    const color = this._emfPlusArgbToColor(argb);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    console.log('EMF+ Clear:', color);
  }

  // EmfPlusFillRects：body = Count(4) + RectF[Count](16 each)；笔刷由 flags 低字节(ObjectId)指定
  processEmfPlusFillRectangles(flags, data) {
    if (data.length < 4) return;
    const brushId = flags & 0xFF;
    const count = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    if (count > 4096) return; // 防异常计数
    const color = this._emfPlusResolveBrush(flags, brushId);
    if (!color) return;
    this.ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const o = 4 + i * 16;
      if (o + 16 > data.length) break;
      const x = this._emfPlusReadFloat(data, o);
      const y = this._emfPlusReadFloat(data, o + 4);
      const w = this._emfPlusReadFloat(data, o + 8);
      const h = this._emfPlusReadFloat(data, o + 12);
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
      const x = this._emfPlusReadFloat(data, o);
      const y = this._emfPlusReadFloat(data, o + 4);
      const w = this._emfPlusReadFloat(data, o + 8);
      const h = this._emfPlusReadFloat(data, o + 12);
      const tl = this._emfPlusMapPoint(x, y);
      const br = this._emfPlusMapPoint(x + w, y + h);
      this.ctx.strokeRect(tl.x, tl.y, Math.abs(br.x - tl.x), Math.abs(br.y - tl.y));
    }
    console.log('EMF+ DrawRects:', count, '个矩形');
  }

  processEmfPlusFillRegion(flags, data) {
    console.log('Processing EmfPlusFillRegion');
  }

  processEmfPlusSetTextContrast(flags, data) {
    console.log('Processing EmfPlusSetTextContrast');
  }

  processEmfPlusStrokeFillPath(flags, data) {
    console.log('Processing EmfPlusStrokeFillPath');
  }

  processEmfPlusSerializableObject(flags, data) {
    console.log('Processing EmfPlusSerializableObject');
  }

  processEmfPlusSetTSGraphics(flags, data) {
    console.log('Processing EmfPlusSetTSGraphics');
  }

  processEmfPlusSetTSClip(flags, data) {
    console.log('Processing EmfPlusSetTSClip');
  }
}

module.exports = EmfPlusDrawer;