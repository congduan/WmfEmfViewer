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
    if (data.length < 8) return;
    const brushId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const count = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
    const color = this._emfPlusResolveBrush(flags, brushId);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 8;
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

  // 处理EMF+绘制路径记录
  processEmfPlusDrawPath(flags, data) {
    console.log('Processing EmfPlusDrawPath');
  }

  // 处理EMF+填充路径记录
  processEmfPlusFillPath(flags, data) {
    console.log('Processing EmfPlusFillPath');
  }

  // 处理EMF+绘制图像记录
  processEmfPlusDrawImage(flags, data) {
    console.log('Processing EmfPlusDrawImage');
  }

  // 处理EMF+绘制图像点记录
  processEmfPlusDrawImagePoints(flags, data) {
    console.log('Processing EmfPlusDrawImagePoints');
  }

  // 处理EMF+绘制字符串记录
  processEmfPlusDrawString(flags, data) {
    console.log('Processing EmfPlusDrawString');
  }

  // 处理EMF+绘制多线段记录：PenId(4) + Count(4) + PointF[Count](8 each)
  processEmfPlusDrawLines(flags, data) {
    if (data.length < 8) return;
    const penId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const count = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
    const pen = this._emfPlusResolvePen(penId);
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 8;
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
    if (data.length < 20) return;
    const penId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const pen = this._emfPlusResolvePen(penId);
    const x = this._emfPlusReadFloat(data, 4);
    const y = this._emfPlusReadFloat(data, 8);
    const w = this._emfPlusReadFloat(data, 12);
    const h = this._emfPlusReadFloat(data, 16);
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
    if (data.length < 20) return;
    const brushId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const x = this._emfPlusReadFloat(data, 4);
    const y = this._emfPlusReadFloat(data, 8);
    const w = this._emfPlusReadFloat(data, 12);
    const h = this._emfPlusReadFloat(data, 16);
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

  // EmfPlusObject：ObjectId = flags & 0xFF；data = ObjectType(4) + ObjectData
  processEmfPlusObject(flags, data) {
    if (data.length < 4) return;
    const objectId = flags & 0xFF;
    const objectType = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    // ObjectType：0x01 = SolidBrush，0x07 = Pen
    if (objectType === 0x01 && data.length >= 8) {
      // EmfPlusSolidBrushData = ARGB(4)
      const argb = this._emfPlusReadArgb(data, 4);
      this.emfPlusObjects[objectId] = { type: 'solidBrush', color: this._emfPlusArgbToColor(argb) };
      console.log('EMF+ SolidBrush #' + objectId, this.emfPlusObjects[objectId].color);
    } else if (objectType === 0x07 && data.length >= 12) {
      // EmfPlusPenData：PenDataFlags(4) + PenUnit(4) + PenWidth(4 float) + [可选]
      const penDataFlags = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
      const penWidth = this._emfPlusReadFloat(data, 12);
      let color = '#000000';
      // PenDataSolidBrush 标志位 = 0x4：其后紧跟 EmfPlusSolidBrushData（ARGB）
      if (penDataFlags & 0x4 && data.length >= 16) {
        const argb = this._emfPlusReadArgb(data, 16);
        color = this._emfPlusArgbToColor(argb);
      }
      this.emfPlusObjects[objectId] = { type: 'pen', color, width: penWidth || 1 };
      console.log('EMF+ Pen #' + objectId, color, 'width:', penWidth);
    } else {
      console.log('EMF+ Object #' + objectId, 'type 0x' + objectType.toString(16));
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

  // EmfPlusFillRects：BrushId(4) + Count(4) + RectF[Count](16 each)
  processEmfPlusFillRectangles(flags, data) {
    if (data.length < 8) return;
    const brushId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const count = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
    const color = this._emfPlusResolveBrush(flags, brushId);
    this.ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 16;
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

  // EmfPlusDrawRects：PenId(4) + Count(4) + RectF[Count]
  processEmfPlusDrawRectangles(flags, data) {
    if (data.length < 8) return;
    const penId = (data[0] & 0xFF) | ((data[1] & 0xFF) << 8) | ((data[2] & 0xFF) << 16) | ((data[3] & 0xFF) << 24);
    const count = (data[4] & 0xFF) | ((data[5] & 0xFF) << 8) | ((data[6] & 0xFF) << 16) | ((data[7] & 0xFF) << 24);
    const pen = this._emfPlusResolvePen(penId);
    this.ctx.strokeStyle = pen.color;
    this.ctx.lineWidth = pen.width;
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 16;
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