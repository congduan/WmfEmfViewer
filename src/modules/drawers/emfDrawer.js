// EMF绘制模块
const CoordinateTransformer = require('../../utils/coordinateTransformer');
const GdiObjectManager = require('../../utils/gdiObjectManager');

// EMF 记录分派表：记录类型 -> 处理方法名（processEmfRecordType 中调用 this[方法名](data)）。
// 值为 null 表示已识别但无需处理/暂不支持（与原 switch 的空分支等价，不打未知记录日志）。
// 记录编号依据 MS-EMF 规范 2.1.1 节 EMR_RECORD_TYPE 枚举。
const EMF_RECORD_HANDLERS = {
  // ========== 基础记录 ==========
  0x00000001: 'processEmfHeader',           // EMR_HEADER
  0x0000000E: null,                         // EMR_EOF

  // ========== 绘图记录 (Drawing Records) ==========
  0x00000002: 'processEmfPolyBezier',       // EMR_POLYBEZIER
  0x00000003: 'processEmfPolygon',          // EMR_POLYGON
  0x00000004: 'processEmfPolyline',         // EMR_POLYLINE
  0x00000005: 'processEmfPolyBezierTo',     // EMR_POLYBEZIERTO
  0x00000006: 'processEmfPolylineTo',       // EMR_POLYLINETO
  0x00000007: 'processEmfPolyPolyline',     // EMR_POLYPOLYLINE
  0x00000008: 'processEmfPolyPolygon',      // EMR_POLYPOLYGON
  0x0000001B: 'processEmfMoveToEx',         // EMR_MOVETOEX
  0x00000036: 'processEmfLineTo',           // EMR_LINETO
  0x00000029: 'processEmfAngleArc',         // EMR_ANGLEARC
  0x0000002A: 'processEmfEllipse',          // EMR_ELLIPSE
  0x0000002B: 'processEmfRectangle',        // EMR_RECTANGLE
  0x0000002C: 'processEmfRoundRect',        // EMR_ROUNDRECT
  0x0000002D: 'processEmfArc',              // EMR_ARC
  0x00000037: 'processEmfArcTo',            // EMR_ARCTO
  0x0000002E: 'processEmfChord',            // EMR_CHORD
  0x0000002F: 'processEmfPie',              // EMR_PIE
  0x00000038: 'processEmfPolyDraw',         // EMR_POLYDRAW

  // ========== 路径记录 (Path Records) ==========
  0x0000003B: 'processEmfBeginPath',        // EMR_BEGINPATH
  0x0000003C: 'processEmfEndPath',          // EMR_ENDPATH
  0x0000003D: 'processEmfCloseFigure',      // EMR_CLOSEFIGURE
  0x0000003E: 'processEmfFillPath',         // EMR_FILLPATH
  0x0000003F: 'processEmfStrokeAndFillPath', // EMR_STROKEANDFILLPATH
  0x00000040: 'processEmfStrokePath',       // EMR_STROKEPATH
  0x00000041: 'processEmfFlattenPath',      // EMR_FLATTENPATH
  0x00000042: 'processEmfWidenPath',        // EMR_WIDENPATH
  0x00000044: 'processEmfAbortPath',        // EMR_ABORTPATH

  // ========== 状态记录 (State Records) ==========
  0x00000009: 'processEmfSetWindowExtEx',   // EMR_SETWINDOWEXTEX
  0x0000000A: 'processEmfSetWindowOrgEx',   // EMR_SETWINDOWORGEX
  0x0000000B: 'processEmfSetViewportExtEx', // EMR_SETVIEWPORTEXTEX
  0x0000000C: 'processEmfSetViewportOrgEx', // EMR_SETVIEWPORTORGEX
  0x0000000D: 'processEmfSetBrushOrgEx',    // EMR_SETBRUSHORGEX
  0x0000000F: 'processEmfSetPixelV',        // EMR_SETPIXELV
  0x00000010: 'processEmfSetMapperFlags',   // EMR_SETMAPPERFLAGS
  0x00000011: 'processEmfSetMapMode',       // EMR_SETMAPMODE
  0x00000012: 'processEmfSetBkMode',        // EMR_SETBKMODE
  0x00000013: 'processEmfSetPolyFillMode',  // EMR_SETPOLYFILLMODE
  0x00000014: 'processEmfSetRop2',          // EMR_SETROP2
  0x00000015: 'processEmfSetStretchBltMode', // EMR_SETSTRETCHBLTMODE
  0x00000016: 'processEmfSetTextAlign',     // EMR_SETTEXTALIGN
  0x00000017: 'processEmfSetColorAdjustment', // EMR_SETCOLORADJUSTMENT
  0x00000018: 'processEmfSetTextColor',     // EMR_SETTEXTCOLOR
  0x00000019: 'processEmfSetBkColor',       // EMR_SETBKCOLOR
  0x0000001A: 'processEmfOffsetClipRgn',    // EMR_OFFSETCLIPRGN
  0x0000001C: 'processEmfSetMetaRgn',       // EMR_SETMETARGN
  0x0000001D: 'processEmfExcludeClipRect',  // EMR_EXCLUDECLIPRECT
  0x0000001E: 'processEmfIntersectClipRect', // EMR_INTERSECTCLIPRECT
  0x0000001F: 'processEmfScaleViewportExtEx', // EMR_SCALEVIEWPORTEXTEX
  0x00000020: 'processEmfScaleWindowExtEx', // EMR_SCALEWINDOWEXTEX
  0x00000021: 'processEmfSaveDC',           // EMR_SAVEDC
  0x00000022: 'processEmfRestoreDC',        // EMR_RESTOREDC
  0x00000023: 'processEmfSetWorldTransform', // EMR_SETWORLDTRANSFORM
  0x00000024: 'processEmfModifyWorldTransform', // EMR_MODIFYWORLDTRANSFORM
  0x00000039: 'processEmfSetArcDirection',  // EMR_SETARCDIRECTION
  0x0000003A: 'processEmfSetMiterLimit',    // EMR_SETMITERLIMIT

  // ========== 对象记录 (Object Records) ==========
  0x00000025: 'processEmfSelectObject',     // EMR_SELECTOBJECT
  0x00000026: 'processEmfCreatePen',        // EMR_CREATEPEN
  0x00000027: 'processEmfCreateBrushIndirect', // EMR_CREATEBRUSHINDIRECT
  0x00000028: 'processEmfDeleteObject',     // EMR_DELETEOBJECT
  0x0000005D: 'processEmfCreateMonoBrush',  // EMR_CREATEMONOBRUSH
  0x0000005F: 'processEmfExtCreatePen',     // EMR_EXTCREATEPEN
  0x00000052: 'processEmfExtCreateFontIndirectW', // EMR_EXTCREATEFONTINDIRECTW
  0x00000063: 'processEmfCreateColorSpaceW', // EMR_CREATECOLORSPACE

  // ========== 调色板记录 (Palette Records) ==========
  0x00000030: 'processEmfSelectPalette',    // EMR_SELECTPALETTE
  0x00000031: 'processEmfCreatePalette',    // EMR_CREATEPALETTE
  0x00000032: 'processEmfSetPaletteEntries', // EMR_SETPALETTEENTRIES
  0x00000033: 'processEmfResizePalette',    // EMR_RESIZEPALETTE
  0x00000034: 'processEmfRealizePalette',   // EMR_REALIZEPALETTE
  0x00000035: 'processEmfExtFloodFill',     // EMR_EXTFLOODFILL

  // ========== 位图记录 (Bitmap Records) ==========
  0x0000004C: 'processEmfBitBlt',           // EMR_BITBLT
  0x0000004D: 'processEmfStretchBlt',       // EMR_STRETCHBLT
  0x00000051: 'processEmfBitBlt',           // EMR_STRETCHDIBITS（布局与 BITBLT 兼容）
  0x00000072: 'processEmfBitBlt',           // EMR_ALPHABLEND（dwRop 位置为 BLENDFUNCTION）
  0x00000074: 'processEmfStretchBlt',       // EMR_TRANSPARENTBLT（透明色参数暂忽略）

  // ========== 文本记录 (Text Records) ==========
  0x00000053: 'processEmfExtTextOutA',      // EMR_EXTTEXTOUTA
  0x00000054: 'processEmfExtTextOutW',      // EMR_EXTTEXTOUTW
  0x0000006C: 'processEmfSmallTextOut',     // EMR_SMALLTEXTOUT

  // ========== 16 位绘图记录 ==========
  0x00000055: 'processEmfPolyBezier16',     // EMR_POLYBEZIER16
  0x00000056: 'processEmfPolygon16',        // EMR_POLYGON16
  0x00000057: 'processEmfPolyline16',       // EMR_POLYLINE16
  0x00000058: 'processEmfPolyBezierTo16',   // EMR_POLYBEZIERTO16
  0x00000059: 'processEmfPolyLineTo16',     // EMR_POLYLINETO16
  0x0000005A: 'processEmfPolyPolyline16',   // EMR_POLYPOLYLINE16
  0x0000005B: 'processEmfPolyPolygon16',    // EMR_POLYPOLYGON16
  0x0000005C: 'processEmfPolyDraw16',       // EMR_POLYDRAW16

  // ========== 裁剪记录 ==========
  0x00000043: 'processEmfSelectClipPath',   // EMR_SELECTCLIPPATH
  0x0000004B: null,                         // EMR_EXTSELECTCLIPRGN（暂跳过）

  // ========== 已识别但无需处理 ==========
  0x00000046: null, // EMR_GDICOMMENT（含 EMF+ 内嵌数据，EMF 模式跳过）
  0x00000047: null, // EMR_FILLRGN（区域绘制依赖 region 对象，暂跳过）
  0x00000048: null, // EMR_FRAMERGN
  0x00000049: null, // EMR_INVERTRGN
  0x0000004A: null, // EMR_PAINTRGN
  0x0000004E: null, // EMR_MASKBLT
  0x0000004F: null, // EMR_PLGBLT
  0x00000050: null, // EMR_SETDIBITSTODEVICE
  0x0000006D: null, // EMR_FORCEUFIMAPPING（仅影响字体匹配）
  0x0000006E: null, // EMR_NAMEDESCAPE
  0x00000076: null  // EMR_GRADIENTFILL
};

class EmfDrawer {
  constructor(ctx) {
    this.ctx = ctx;
    this.coordinateTransformer = new CoordinateTransformer();
    this.gdiObjectManager = new GdiObjectManager();
    // 注：EMF 对象统一存 gdiObjectManager（按文件句柄 createObjectAt），不再另设对象表
    this.currentPath = []; // 当前路径点集合
    this.pathState = 'idle'; // 路径状态：idle, active, completed
    this.fillColor = '#000000'; // 默认填充颜色
    this.strokeColor = '#000000'; // 默认描边颜色
    this.lineWidth = 1; // 默认线宽
    this.arcDirection = 0x01; // 弧方向：默认 AD_COUNTERCLOCKWISE (1)
    this.textColor = '#000000'; // 文本颜色（SetTextColor）
    this.dcStateStack = []; // SaveDC/RestoreDC 状态栈
  }

  draw(metafileData, options = {}) {
    console.log('Drawing EMF with header:', metafileData.header);
    console.log('Number of records:', metafileData.records.length);

    // 获取view尺寸，默认为800x600
    const viewWidth = options.viewWidth || 800;
    const viewHeight = options.viewHeight || 600;

    // 设置Canvas大小和坐标转换
    let canvasWidth, canvasHeight;
    if (metafileData.header.bounds) {
      const bounds = metafileData.header.bounds;
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;

      // 在保持宽高比的情况下，尽可能占满view
      const scaleToFit = Math.min(
        viewWidth / width,
        viewHeight / height
      );
      canvasWidth = Math.round(width * scaleToFit);
      canvasHeight = Math.round(height * scaleToFit);

      // 设置窗口范围用于坐标转换
      this.coordinateTransformer.setWindowOrg(bounds.left, bounds.top);
      this.coordinateTransformer.setWindowExt(width, height);
      this.coordinateTransformer.setViewportOrg(0, 0);
      this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);

      console.log('Window:', { org: [bounds.left, bounds.top], ext: [width, height] });
      console.log('Viewport:', { org: [0, 0], ext: [canvasWidth, canvasHeight] });
      console.log('View size:', { viewWidth, viewHeight });
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

    // 缓存 canvas 实际尺寸供 setViewport*Ex 换算 vpOrg 使用
    this._canvasW = canvasWidth;
    this._canvasH = canvasHeight;

    // 初始化文件声明的 window/viewport 范围（1:1 兜底，
    // 后续 SETWINDOWEXTEX/SETVIEWPORTEXTEX 会覆盖）
    const _initW = (metafileData.header.bounds && (metafileData.header.bounds.right - metafileData.header.bounds.left)) || canvasWidth;
    const _initH = (metafileData.header.bounds && (metafileData.header.bounds.bottom - metafileData.header.bounds.top)) || canvasHeight;
    this._fileWindowExtX = _initW;
    this._fileWindowExtY = _initH;
    this._fileViewportExtX = _initW;
    this._fileViewportExtY = _initH;

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
    const debugLogs = globalThis.__WMF_DEBUG__;
    for (let i = 0; i < metafileData.records.length; i++) {
      const record = metafileData.records[i];
      if (debugLogs) {
        console.log('Processing EMF record', i, ':', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
      }
      this.processEmfRecordType(record.type, record.data);
    }

    // 处理剩余的路径
    this.finishPath();

    console.log('EMF drawing completed');
  }

  processEmfRecordType(recordType, data) {
    // 查表分派：记录类型 -> 处理方法名，映射见文件顶部 EMF_RECORD_HANDLERS
    const handlerName = EMF_RECORD_HANDLERS[recordType];
    if (handlerName !== undefined) {
      if (handlerName !== null) {
        this[handlerName](data);
      }
      return;
    }
    console.log('Unknown EMF record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
    this.tryProcessAsCoordinates(data);
  }

  // 辅助方法：从数据中读取DWORD（4字节无符号整数）
  readDwordFromData(data, offset) {
    if (offset + 4 > data.length) return 0;
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
  }

  // 辅助方法：从数据中读取有符号LONG（4字节有符号整数）
  readLongFromData(data, offset) {
    if (offset + 4 > data.length) return 0;
    const value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    // 转换为有符号整数
    return value > 0x7FFFFFFF ? value - 0x100000000 : value;
  }

  // 辅助方法：将RGB颜色值转换为十六进制字符串
  rgbToHex(rgb) {
    const r = (rgb & 0xFF).toString(16).padStart(2, '0');
    const g = ((rgb >> 8) & 0xFF).toString(16).padStart(2, '0');
    const b = ((rgb >> 16) & 0xFF).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // 应用GDI对象样式
  applyGdiObject(obj) {
    if (obj.type === 'pen') {
      // PS_NULL(5)/NULL_PEN：不描边
      const isNullPen = obj.style === 5 || obj.color === 'transparent';
      this.ctx.strokeStyle = isNullPen ? 'transparent' : obj.color;
      if (!isNullPen) {
        // 线宽按当前 window→viewport 缩放换算到像素；cosmetic(PS_COSMETIC=0x10) 固定 1px
        const scale = this.coordinateTransformer.getScale();
        const w = obj.width || 1;
        this.ctx.lineWidth = Math.max(1, Math.round(w * Math.abs(scale.x || 1)));
      }
    } else if (obj.type === 'brush') {
      // BS_NULL/BS_HOLLOW(1) 或显式 transparent：填充透明
      this.ctx.fillStyle = obj.color === 'transparent' ? 'transparent' : obj.color;
    } else if (obj.type === 'font' && obj.faceName) {
      // 字体对象：构建 canvas font 字符串（尺寸按缩放换算）
      const scale = this.coordinateTransformer.getScale();
      const size = Math.max(1, Math.round(Math.abs(obj.height || 12) * Math.abs(scale.y || 1)));
      const weight = (obj.weight || 400) >= 700 ? 'bold ' : '';
      const italic = obj.italic ? 'italic ' : '';
      this.ctx.font = `${italic}${weight}${size}px "${obj.faceName || 'sans-serif'}"`;
    }
  }

  // 应用Stock对象（Windows预定义对象，GetStockObject 枚举 + ENHMETA_STOCK_OBJECT(0x80000000)）
  applyStockObject(handle) {
    const stockObjects = {
      0x80000000: { type: 'brush', color: '#ffffff' },        // WHITE_BRUSH
      0x80000001: { type: 'brush', color: '#c0c0c0' },        // LTGRAY_BRUSH
      0x80000002: { type: 'brush', color: '#808080' },        // GRAY_BRUSH
      0x80000003: { type: 'brush', color: '#404040' },        // DKGRAY_BRUSH
      0x80000004: { type: 'brush', color: '#000000' },        // BLACK_BRUSH
      0x80000005: { type: 'brush', color: 'transparent' },    // NULL_BRUSH (HOLLOW)
      0x80000006: { type: 'pen', color: '#ffffff', width: 1 },   // WHITE_PEN
      0x80000007: { type: 'pen', color: '#000000', width: 1 },   // BLACK_PEN
      0x80000008: { type: 'pen', color: 'transparent', width: 0 }, // NULL_PEN
      0x8000000d: { type: 'font', height: -12, weight: 700, faceName: 'System' },      // SYSTEM_FONT
      0x80000011: { type: 'font', height: -12, weight: 400, faceName: 'MS Shell Dlg' } // DEFAULT_GUI_FONT
    };

    const obj = stockObjects[handle];
    if (obj) {
      this.applyGdiObject(obj);
    }
  }

  // 以下是具体的EMF处理方法
  processEmfHeader(data) {
    console.log('Processing EMF header');
  }

  processEmfPolyBezier(data) {
    // EMR_POLYBEZIER: Bounds(16) + Count(4) + Points[]
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF PolyBezier, count:', count);

    if (data.length < 20 + count * 8) return;

    if (count >= 4 && count % 3 === 1) { // 贝塞尔曲线需要 1+3n 个点
      const points = [];
      for (let i = 0; i < count; i++) {
        const x = this.readLongFromData(data, 20 + i * 8);
        const y = this.readLongFromData(data, 24 + i * 8);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        points.push(transformed);
      }

      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 3) {
        if (i + 2 < points.length) {
          this.ctx.bezierCurveTo(
            points[i].x, points[i].y,
            points[i + 1].x, points[i + 1].y,
            points[i + 2].x, points[i + 2].y
          );
        }
      }
      this.ctx.stroke();
    }
  }

  processEmfPolygon(data) {
    // EMR_POLYGON: Bounds(16) + Count(4) + Points[]
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF Polygon, count:', count);

    if (data.length < 20 + count * 8) return;

    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

      if (i === 0) {
        this.ctx.moveTo(transformed.x, transformed.y);
      } else {
        this.ctx.lineTo(transformed.x, transformed.y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }

  processEmfPolyline(data) {
    // EMR_POLYLINE: Bounds(16) + Count(4) + Points[]
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF Polyline, count:', count);

    if (data.length < 20 + count * 8) return;

    this.ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

      if (i === 0) {
        this.ctx.moveTo(transformed.x, transformed.y);
      } else {
        this.ctx.lineTo(transformed.x, transformed.y);
      }
    }
    this.ctx.stroke();
  }

  processEmfPolyBezierTo(data) {
    // EMR_POLYBEZIERTO: Bounds(16) + Count(4) + Points[]
    // 使用当前位置作为起点，绘制贝塞尔曲线
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF PolyBezierTo, count:', count);

    if (data.length < 20 + count * 8 || count % 3 !== 0) return;

    const points = [];
    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
      points.push(transformed);
    }

    for (let i = 0; i < points.length; i += 3) {
      if (i + 2 < points.length) {
        this.ctx.bezierCurveTo(
          points[i].x, points[i].y,
          points[i + 1].x, points[i + 1].y,
          points[i + 2].x, points[i + 2].y
        );
      }
    }
    this.ctx.stroke();
  }

  processEmfPolylineTo(data) {
    // EMR_POLYLINETO: Bounds(16) + Count(4) + Points[]
    // 使用当前位置作为起点
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF PolylineTo, count:', count);

    if (data.length < 20 + count * 8) return;

    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
      this.ctx.lineTo(transformed.x, transformed.y);
    }
    this.ctx.stroke();
  }

  processEmfPolyPolyline(data) {
    // EMR_POLYPOLYLINE: Bounds(16) + NumberOfPolylines(4) + Count(4) + PolylineCounts[] + Points[]
    if (data.length < 24) return;

    const numberOfPolylines = this.readDwordFromData(data, 16);
    const totalCount = this.readDwordFromData(data, 20);
    console.log('Processing EMF PolyPolyline, polylines:', numberOfPolylines, 'total points:', totalCount);

    if (data.length < 24 + numberOfPolylines * 4 + totalCount * 8) return;

    // 读取每条折线的点数
    const counts = [];
    for (let i = 0; i < numberOfPolylines; i++) {
      counts.push(this.readDwordFromData(data, 24 + i * 4));
    }

    // 读取所有点并绘制每条折线
    let pointOffset = 24 + numberOfPolylines * 4;
    for (let i = 0; i < numberOfPolylines; i++) {
      const count = counts[i];
      this.ctx.beginPath();

      for (let j = 0; j < count; j++) {
        const x = this.readLongFromData(data, pointOffset);
        const y = this.readLongFromData(data, pointOffset + 4);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

        if (j === 0) {
          this.ctx.moveTo(transformed.x, transformed.y);
        } else {
          this.ctx.lineTo(transformed.x, transformed.y);
        }
        pointOffset += 8;
      }
      this.ctx.stroke();
    }
  }

  processEmfPolyPolygon(data) {
    // EMR_POLYPOLYGON: Bounds(16) + NumberOfPolygons(4) + Count(4) + PolygonCounts[] + Points[]
    if (data.length < 24) return;

    const numberOfPolygons = this.readDwordFromData(data, 16);
    const totalCount = this.readDwordFromData(data, 20);
    console.log('Processing EMF PolyPolygon, polygons:', numberOfPolygons, 'total points:', totalCount);

    if (data.length < 24 + numberOfPolygons * 4 + totalCount * 8) return;

    // 读取每个多边形的点数
    const counts = [];
    for (let i = 0; i < numberOfPolygons; i++) {
      counts.push(this.readDwordFromData(data, 24 + i * 4));
    }

    // 读取所有点并绘制每个多边形
    let pointOffset = 24 + numberOfPolygons * 4;
    for (let i = 0; i < numberOfPolygons; i++) {
      const count = counts[i];
      this.ctx.beginPath();

      for (let j = 0; j < count; j++) {
        const x = this.readLongFromData(data, pointOffset);
        const y = this.readLongFromData(data, pointOffset + 4);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

        if (j === 0) {
          this.ctx.moveTo(transformed.x, transformed.y);
        } else {
          this.ctx.lineTo(transformed.x, transformed.y);
        }
        pointOffset += 8;
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  // ============ EMR_*16 系列（16 位坐标变体，MS-EMF 2.3.5）============
  // 与 32 位版本结构相同，区别仅在于 aPoints 每点 4 字节（x/y 为 16 位有符号整数）

  readInt16FromData(data, offset) {
    if (offset + 2 > data.length) return 0;
    const value = data[offset] | (data[offset + 1] << 8);
    return value > 0x7FFF ? value - 0x10000 : value;
  }

  readPoints16(data, offset, count) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const x = this.readInt16FromData(data, offset + i * 4);
      const y = this.readInt16FromData(data, offset + i * 4 + 2);
      points.push(this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height));
    }
    return points;
  }

  processEmfPolyBezier16(data) {
    // EMR_POLYBEZIER16: Bounds(16) + Count(4) + aPoints[](每点4字节)
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 4 || count % 3 !== 1 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 3) {
      if (i + 2 < points.length) {
        this.ctx.bezierCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[i + 2].x, points[i + 2].y);
      }
    }
    this.ctx.stroke();
  }

  processEmfPolygon16(data) {
    // EMR_POLYGON16: Bounds(16) + Count(4) + aPoints[](每点4字节)
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 3 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    this.ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y)));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }

  processEmfPolyline16(data) {
    // EMR_POLYLINE16: Bounds(16) + Count(4) + aPoints[](每点4字节)
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 2 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    this.ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y)));
    this.ctx.stroke();
  }

  processEmfPolyBezierTo16(data) {
    // EMR_POLYBEZIERTO16: 从当前位置起画贝塞尔，Count 为 3 的倍数
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 3 || count % 3 !== 0 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    for (let i = 0; i + 2 < points.length; i += 3) {
      this.ctx.bezierCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[i + 2].x, points[i + 2].y);
    }
    this.ctx.stroke();
  }

  processEmfPolyLineTo16(data) {
    // EMR_POLYLINETO16: 从当前位置连线
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 1 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    points.forEach(p => this.ctx.lineTo(p.x, p.y));
    this.ctx.stroke();
  }

  processEmfPolyPolyline16(data) {
    // EMR_POLYPOLYLINE16: Bounds(16) + nPolys(4) + cTotal(4) + aPolyCounts[] + aPoints[]
    if (data.length < 24) return;
    const nPolys = this.readDwordFromData(data, 16);
    const cTotal = this.readDwordFromData(data, 20);
    if (data.length < 24 + nPolys * 4 + cTotal * 4) return;
    let pointOffset = 24 + nPolys * 4;
    for (let i = 0; i < nPolys; i++) {
      const count = this.readDwordFromData(data, 24 + i * 4);
      const points = this.readPoints16(data, pointOffset, count);
      pointOffset += count * 4;
      this.ctx.beginPath();
      points.forEach((p, j) => (j === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y)));
      this.ctx.stroke();
    }
  }

  processEmfPolyPolygon16(data) {
    // EMR_POLYPOLYGON16: Bounds(16) + nPolys(4) + cTotal(4) + aPolyCounts[] + aPoints[]
    if (data.length < 24) return;
    const nPolys = this.readDwordFromData(data, 16);
    const cTotal = this.readDwordFromData(data, 20);
    if (data.length < 24 + nPolys * 4 + cTotal * 4) return;
    let pointOffset = 24 + nPolys * 4;
    for (let i = 0; i < nPolys; i++) {
      const count = this.readDwordFromData(data, 24 + i * 4);
      const points = this.readPoints16(data, pointOffset, count);
      pointOffset += count * 4;
      this.ctx.beginPath();
      points.forEach((p, j) => (j === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y)));
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  processEmfPolyDraw16(data) {
    // EMR_POLYDRAW16: Bounds(16) + cTotal(4) + aPoints[](4字节/点) + aTypes[](1字节/点)
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (data.length < 20 + count * 5) return;
    for (let i = 0; i < count; i++) {
      const p = this.readPoints16(data, 20 + i * 4, 1)[0];
      const type = data[20 + count * 4 + i];
      // type: 1=MOVETO, 2=LINETO, 4=BEZIERTO, 128=CLOSEFIGURE（BEZIERTO 此处按 LINETO 近似）
      if (type & 1) {
        this.ctx.moveTo(p.x, p.y);
      } else if (type & 6) {
        this.ctx.lineTo(p.x, p.y);
      }
      if (type & 128) {
        this.ctx.closePath();
      }
    }
    this.ctx.stroke();
  }

  processEmfExtCreatePen(data) {
    // EMR_EXTCREATEPEN (MS-EMF 2.3.7.4):
    // ihPen(0) offBmi(4) cbBmi(8) offBits(12) cbBits(16)
    // elpPenStyle(20) elpWidth(24) elpBrushStyle(28) elpColor(32) elpHatch(36) ...
    if (data.length < 40) return;
    const ihPen = this.readDwordFromData(data, 0);
    if ((ihPen & 0x80000000) !== 0) return; // ENHMETA_STOCK_OBJECT
    const style = this.readDwordFromData(data, 20);
    const width = this.readDwordFromData(data, 24);
    const brushStyle = this.readDwordFromData(data, 28);
    const color = this.readDwordFromData(data, 32);
    const elpHatch = this.readLongFromData(data, 36);
    // BS_HATCHED 时 elpHatch 为颜色别名（[MS-EMF] 2.2.20）
    let penColor;
    if (brushStyle === 2 && (elpHatch === 8 || elpHatch === 9)) penColor = this.textColor;
    else if (brushStyle === 2 && (elpHatch === 10 || elpHatch === 11)) penColor = this.fillColor;
    else penColor = this.rgbToHex(color);
    // 按文件句柄存入对象表（统一从 gdiObjectManager 查询）
    this.gdiObjectManager.createObjectAt(ihPen, { type: 'pen', style, width, color: penColor });
    console.log('EMR_EXTCREATEPEN: ih=', ihPen, 'style:', style, 'width:', width, 'color:', penColor);
  }

  processEmfSmallTextOut(data) {
    // EMR_SMALLTEXTOUT (MS-EMF 2.3.5.9):
    // 无 Bounds 字段！布局（record.data 已剥离 8 字节 EMR 头）：
    // x(0) y(4) cChars(8) fuOptions(12) iGraphicsMode(16) exScale(20) eyScale(24)
    // [rclRectangle(28..43) 若无 ETO_NO_RECT] 字符串紧随其后
    // 字符宽度：ETO_SMALL_CHARS(0x200)=2字节，否则 1 字节
    if (data.length < 28) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    const cChars = this.readDwordFromData(data, 8);
    const options = this.readDwordFromData(data, 12);
    const ETO_NO_RECT = 0x0100;
    const ETO_SMALL_CHARS = 0x0200;
    const charWidth = (options & ETO_SMALL_CHARS) ? 2 : 1;
    let stringOffset = (options & ETO_NO_RECT) ? 28 : 44;
    if (cChars === 0 || stringOffset + cChars * charWidth > data.length) return;

    let text = '';
    for (let i = 0; i < cChars; i++) {
      if (charWidth === 2) {
        text += String.fromCharCode(data[stringOffset + i * 2] | (data[stringOffset + i * 2 + 1] << 8));
      } else {
        text += String.fromCharCode(data[stringOffset + i]);
      }
    }

    // ETO_OPAQUE：先用背景色填充矩形
    if (options & 0x0002 && !(options & ETO_NO_RECT) && data.length >= 44) {
      const bg1 = this.coordinateTransformer.transform(this.readLongFromData(data, 28), this.readLongFromData(data, 32), this.ctx.canvas.width, this.ctx.canvas.height);
      const bg2 = this.coordinateTransformer.transform(this.readLongFromData(data, 36), this.readLongFromData(data, 40), this.ctx.canvas.width, this.ctx.canvas.height);
      const bgW = Math.abs(bg2.x - bg1.x);
      const bgH = Math.abs(bg2.y - bg1.y);
      if (bgW > 0 && bgH > 0) {
        const savedFillStyle = this.ctx.fillStyle;
        this.ctx.fillStyle = this.fillColor;
        this.ctx.fillRect(Math.min(bg1.x, bg2.x), Math.min(bg1.y, bg2.y), bgW, bgH);
        this.ctx.fillStyle = savedFillStyle;
      }
    }

    const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    const savedFillStyle = this.ctx.fillStyle;
    this.ctx.fillStyle = this.textColor;
    this.ctx.fillText(text, transformed.x, transformed.y);
    this.ctx.fillStyle = savedFillStyle;
    console.log('EMR_SMALLTEXTOUT:', x, y, 'text:', text.substring(0, 50));
  }

  processEmfSetWindowExtEx(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF SetWindowExtEx:', x, y);
    // 记录文件声明的窗口范围；transformer 的 windowExt 保持为文件声明值，
    // 由 setViewportExtEx 决定 transform 输出的目标画布（保持为 canvas 尺寸）。
    this._fileWindowExtX = x || 1;
    this._fileWindowExtY = y || 1;
    this.coordinateTransformer.setWindowExt(this._fileWindowExtX, this._fileWindowExtY);
  }

  processEmfSetWindowOrgEx(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF SetWindowOrgEx:', x, y);
    this.coordinateTransformer.setWindowOrg(x, y);
  }

  processEmfSetViewportExtEx(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF SetViewportExtEx:', x, y);
    // 关键：transformer 的 viewportExt 始终是 canvas 尺寸，文件声明的 vpExt
    // 只用于视口原点的比例换算。直接用 x,y 覆盖 viewportExt 会导致所有坐标
    // 被压缩到文件设备尺寸区域，绘制在 canvas 左上角。
    this._fileViewportExtX = x || 1;
    this._fileViewportExtY = y || 1;
    if (this._canvasW && this._canvasH) {
      this.coordinateTransformer.setViewportExt(this._canvasW, this._canvasH);
    }
  }

  processEmfSetViewportOrgEx(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF SetViewportOrgEx:', x, y);
    // 文件 vpOrg 是"文件设备单位"，需按 fileVpExt → canvas 的比例换算到 canvas 像素。
    const sx = this._fileViewportExtX ? (this._canvasW || 0) / this._fileViewportExtX : 1;
    const sy = this._fileViewportExtY ? (this._canvasH || 0) / this._fileViewportExtY : 1;
    this.coordinateTransformer.setViewportOrg(x * sx, y * sy);
  }

  processEmfSetBrushOrgEx(data) {
    if (data.length < 8) return;
    const x = this.readDwordFromData(data, 0);
    const y = this.readDwordFromData(data, 4);
    console.log('EMF SetBrushOrgEx:', x, y);
  }

  processEmfSetMapMode(data) {
    if (data.length < 4) return;
    const mode = this.readDwordFromData(data, 0);
    this.coordinateTransformer.setMapMode(mode);
    console.log('EMF SetMapMode:', mode);
  }

  processEmfSetTextColor(data) {
    if (data.length < 4) return;
    const color = this.readDwordFromData(data, 0);
    // 文本颜色：仅在绘制文本时应用到 fillStyle，避免覆盖画刷颜色
    this.textColor = this.rgbToHex(color);
    console.log('EMF SetTextColor:', color, '->', this.textColor);
  }

  processEmfSetBkColor(data) {
    if (data.length < 4) return;
    const color = this.readDwordFromData(data, 0);
    this.fillColor = this.rgbToHex(color);
    this.ctx.fillStyle = this.fillColor;
    console.log('EMF SetBkColor:', color, '->', this.fillColor);
  }

  processEmfMoveToEx(data) {
    if (data.length < 8) return;
    const x = this.readDwordFromData(data, 0);
    const y = this.readDwordFromData(data, 4);
    const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.moveTo(transformed.x, transformed.y);
    console.log('EMF MoveToEx:', x, y, '->', transformed.x, transformed.y);
  }

  processEmfRestoreDC(data) {
    if (data.length < 4) return;
    const savedDC = this.readDwordFromData(data, 0);
    // nSavedDC：0 = 最近一次 SaveDC，1 = 前一次，依此类推
    const count = Math.min((savedDC >>> 0) + 1, this.dcStateStack.length);
    let restored = null;
    for (let i = 0; i < count; i++) {
      if (this.dcStateStack.length > 0) {
        restored = this.dcStateStack.pop();
      }
      this.ctx.restore();
    }
    if (restored) {
      this._restoreDcState(restored);
    }
    console.log('EMF RestoreDC:', savedDC, 'count:', count);
  }

  processEmfSelectObject(data) {
    if (data.length < 4) return;
    const objectHandle = this.readDwordFromData(data, 0);
    console.log('EMF SelectObject:', objectHandle);

    const obj = this.gdiObjectManager.selectObject(objectHandle);
    if (obj) {
      this.applyGdiObject(obj);
    } else if (objectHandle >= 0x80000000) {
      this.applyStockObject(objectHandle);
    }
  }

  processEmfCreatePen(data) {
    if (data.length < 20) return;
    // EMR_CREATEPEN (MS-EMF 2.3.5.10):
    //   ihPen(0) + iPenStyle(4) + xWidth(8) + yWidth(12, LOGPEN POINT 的 y，忽略) + Colorref(16)
    // 旧实现从 offset 0 读 style/color，整体错位 4 字节导致颜色全错。
    const ihPen = this.readDwordFromData(data, 0);
    if ((ihPen & 0x80000000) !== 0) return; // ENHMETA_STOCK_OBJECT，不创建
    const penStyle = this.readDwordFromData(data, 4);
    const width = this.readLongFromData(data, 8);
    const color = this.readDwordFromData(data, 16);
    console.log('EMF CreatePen: ih=', ihPen, 'style:', penStyle, 'width:', width, 'color:', color.toString(16));

    const penColor = this.rgbToHex(color);
    this.gdiObjectManager.createObjectAt(ihPen, { type: 'pen', style: penStyle, width, color: penColor });
  }

  processEmfCreateBrushIndirect(data) {
    if (data.length < 16) return;
    // EMR_CREATEBRUSHINDIRECT (MS-EMF 2.3.5.9):
    //   ihBrush(0) + lbStyle(4) + lbColor(8) + lbHatch(12)
    // 旧实现漏读 ihBrush，整体错位 4 字节（把 hatch 当 color，渲染全黑）。
    const ihBrush = this.readDwordFromData(data, 0);
    if ((ihBrush & 0x80000000) !== 0) return;
    const brushStyle = this.readDwordFromData(data, 4);
    const color = this.readDwordFromData(data, 8);
    const hatch = this.readLongFromData(data, 12);
    console.log('EMF CreateBrushIndirect: ih=', ihBrush, 'style:', brushStyle, 'color:', color.toString(16), 'hatch:', hatch);

    // BS_HATCHED 时 lbHatch 为颜色别名（[MS-EMF] 2.1.17 / HS_* 枚举）：
    //   8/9 (SOLIDTEXTCLR/DITHEREDTEXTCLR) -> 文本色; 10/11 (SOLIDBKCLR/...) -> 背景色
    let brushColor = this.rgbToHex(color);
    if (brushStyle === 2 /* BS_HATCHED */) {
      if (hatch === 8 || hatch === 9) brushColor = this.textColor;
      else if (hatch === 10 || hatch === 11) brushColor = this.fillColor;
    }
    // BS_NULL/BS_HOLLOW(1)：空心笔刷，填充应为透明
    this.gdiObjectManager.createObjectAt(ihBrush, {
      type: 'brush',
      style: brushStyle,
      color: brushStyle === 1 ? 'transparent' : brushColor
    });
  }

  processEmfEllipse(data) {
    if (data.length < 16) return;
    const left = this.readDwordFromData(data, 0);
    const top = this.readDwordFromData(data, 4);
    const right = this.readDwordFromData(data, 8);
    const bottom = this.readDwordFromData(data, 12);
    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.beginPath();
    this.ctx.ellipse(
      (transformedLeftTop.x + transformedRightBottom.x) / 2,
      (transformedLeftTop.y + transformedRightBottom.y) / 2,
      (transformedRightBottom.x - transformedLeftTop.x) / 2,
      (transformedRightBottom.y - transformedLeftTop.y) / 2,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.stroke();
  }

  processEmfRectangle(data) {
    if (data.length < 16) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
    const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
    const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
    const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
    console.log('EMF Rectangle:', x, y, width, height);
    this.ctx.beginPath();
    this.ctx.rect(x, y, width, height);
    this.ctx.stroke();
  }

  processEmfLineTo(data) {
    if (data.length < 8) return;
    const x = this.readDwordFromData(data, 0);
    const y = this.readDwordFromData(data, 4);
    const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.lineTo(transformed.x, transformed.y);
    this.ctx.stroke();
    console.log('EMF LineTo:', x, y, '->', transformed.x, transformed.y);
  }

  processEmfBeginPath(data) {
    console.log('EMF BeginPath');
    this.ctx.beginPath();
    this.pathState = 'active';
  }

  processEmfEndPath(data) {
    console.log('EMF EndPath');
    this.pathState = 'completed';
  }

  processEmfStrokeAndFillPath(data) {
    console.log('EMF StrokeAndFillPath');
    this.ctx.fill();
    this.ctx.stroke();
    this.pathState = 'idle';
  }

  processEmfStrokePath(data) {
    console.log('EMF StrokePath');
    this.ctx.stroke();
    this.pathState = 'idle';
  }

  processEmfAbortPath(data) {
    console.log('EMF AbortPath');
    this.pathState = 'idle';
  }

  processEmfSetBkMode(data) {
    if (data.length < 4) return;
    const mode = this.readDwordFromData(data, 0);
    console.log('EMF SetBkMode:', mode);
    // 1 = TRANSPARENT, 2 = OPAQUE
  }

  processEmfSetRop2(data) {
    if (data.length < 4) return;
    const rop2 = this.readDwordFromData(data, 0);
    console.log('EMF SetRop2:', rop2);
    // ROP2 mode for binary raster operations
  }

  processEmfSetStretchBltMode(data) {
    if (data.length < 4) return;
    const mode = this.readDwordFromData(data, 0);
    console.log('EMF SetStretchBltMode:', mode);
    // Stretch mode for bitmap operations
  }

  processEmfSetTextAlign(data) {
    if (data.length < 4) return;
    const align = this.readDwordFromData(data, 0);
    console.log('EMF SetTextAlign:', align);
    // 水平对齐：TA_LEFT=0x0000, TA_RIGHT=0x0002, TA_CENTER=0x0006
    const horiz = align & 0x0006;
    if (horiz === 0x0002) {
      this.ctx.textAlign = 'right';
    } else if (horiz === 0x0006) {
      this.ctx.textAlign = 'center';
    } else {
      this.ctx.textAlign = 'left';
    }
    // 垂直对齐：TA_TOP=0x0000, TA_BOTTOM=0x0008, TA_BASELINE=0x0018
    const vert = align & 0x0018;
    if (vert === 0x0008) {
      this.ctx.textBaseline = 'bottom';
    } else if (vert === 0x0018) {
      this.ctx.textBaseline = 'alphabetic';
    } else {
      this.ctx.textBaseline = 'top';
    }
  }

  processEmfDeleteObject(data) {
    if (data.length < 4) return;
    const objectHandle = this.readDwordFromData(data, 0);
    console.log('EMF DeleteObject:', objectHandle);
    this.gdiObjectManager.deleteObject(objectHandle);
  }

  processEmfExtCreateFontIndirectW(data) {
    if (data.length < 12) return;
    // EMR_EXTCREATEFONTINDIRECTW (MS-EMF 2.3.5.7):
    //   ihFont(0) + offString(4) + LOGFONTW(从 offString 起)
    // LOGFONTW: lfHeight(0,LONG) lfWidth(4) lfEscapement(8) lfOrientation(12)
    //           lfWeight(16,LONG) lfItalic(20,BYTE) lfUnderline(21) lfStrikeOut(22) lfCharSet(23)
    //           lfFaceName(28, 32xUTF-16)
    const ihFont = this.readDwordFromData(data, 0);
    if ((ihFont & 0x80000000) !== 0) return;
    const offString = this.readDwordFromData(data, 4);
    const lfOff = offString - 8; // offString 相对记录起始（含 8 字节 EMR 头）
    if (lfOff < 0 || lfOff + 92 > data.length) return;

    const height = this.readLongFromData(data, lfOff);
    const weight = this.readLongFromData(data, lfOff + 16);
    const italic = data[lfOff + 20];
    const underline = data[lfOff + 21];
    const strikeOut = data[lfOff + 22];
    const charset = data[lfOff + 23];
    let faceName = '';
    for (let i = 0; i < 32; i++) {
      const ch = data[lfOff + 28 + i * 2] | (data[lfOff + 28 + i * 2 + 1] << 8);
      if (ch === 0) break;
      faceName += String.fromCharCode(ch);
    }
    console.log('EMF ExtCreateFontIndirectW: ih=', ihFont, 'height:', height, 'weight:', weight, 'face:', faceName);
    this.gdiObjectManager.createObjectAt(ihFont, {
      type: 'font', height, width: 0, weight, italic, underline, strikeOut, faceName, charset
    });
  }

  processEmfExtTextOutA(data) {
    // ANSI版本的文本输出
    this.processEmfTextOut(data, false);
  }

  processEmfExtTextOutW(data) {
    // Unicode版本的文本输出
    this.processEmfTextOut(data, true);
  }

  processEmfTextOut(data, isUnicode) {
    if (data.length < 76) return;

    // EMR_EXTTEXTOUTW/A 结构（record.data 已剥离 8 字节 EMR 头）
    // rclBounds (16), iGraphicsMode (4), exScale (4), eyScale (4)
    // EmrText 结构从偏移 28 开始：
    //   ptlReference.x = 28, ptlReference.y = 32, nChars = 36,
    //   offString = 40, Options = 44, rcl = 48, offDx = 64
    const x = this.readLongFromData(data, 28);  // Reference point X
    const y = this.readLongFromData(data, 32);  // Reference point Y
    const stringLength = this.readDwordFromData(data, 36);  // Number of characters
    const offString = this.readDwordFromData(data, 40);  // Offset to string
    const options = this.readDwordFromData(data, 44);  // Options (ETO_*)

    // offString 相对记录起始（含 8 字节 EMR 头），而 record.data 不含头
    const stringOffset = offString - 8;

    console.log(`EMF ExtTextOut${isUnicode ? 'W' : 'A'}:`, x, y, 'length:', stringLength, 'offString:', offString, 'options:', options);

    if (stringLength > 0 && stringOffset >= 0 && stringOffset < data.length) {
      let text = '';
      try {
        if (isUnicode && stringOffset + stringLength * 2 <= data.length) {
          // Unicode text (UTF-16LE)
          for (let i = 0; i < stringLength; i++) {
            const charCode = data[stringOffset + i * 2] | (data[stringOffset + i * 2 + 1] << 8);
            if (charCode > 0) {
              text += String.fromCharCode(charCode);
            }
          }
        } else if (!isUnicode && stringOffset + stringLength <= data.length) {
          // ANSI text
          for (let i = 0; i < stringLength; i++) {
            text += String.fromCharCode(data[stringOffset + i]);
          }
        }

        // 绘制文本
        if (text.length > 0) {
          const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
          const savedFillStyle = this.ctx.fillStyle;

          // ETO_OPAQUE (0x0002)：用背景色（SetBkColor 设置的 fillColor）填充 rcl 矩形
          if ((options & 0x0002) !== 0 && data.length >= 64) {
            const rclLeft = this.readLongFromData(data, 48);
            const rclTop = this.readLongFromData(data, 52);
            const rclRight = this.readLongFromData(data, 56);
            const rclBottom = this.readLongFromData(data, 60);
            const bg1 = this.coordinateTransformer.transform(rclLeft, rclTop, this.ctx.canvas.width, this.ctx.canvas.height);
            const bg2 = this.coordinateTransformer.transform(rclRight, rclBottom, this.ctx.canvas.width, this.ctx.canvas.height);
            const bgX = Math.min(bg1.x, bg2.x);
            const bgY = Math.min(bg1.y, bg2.y);
            const bgW = Math.abs(bg2.x - bg1.x);
            const bgH = Math.abs(bg2.y - bg1.y);
            if (bgW > 0 && bgH > 0) {
              this.ctx.fillStyle = this.fillColor;
              this.ctx.fillRect(bgX, bgY, bgW, bgH);
            }
          }

          // 文本使用 SetTextColor 设置的颜色
          this.ctx.fillStyle = this.textColor;
          this.ctx.fillText(text, transformed.x, transformed.y);
          this.ctx.fillStyle = savedFillStyle;
          console.log('  Rendered text:', text.substring(0, 50));
        }
      } catch (error) {
        console.log('  Error reading text:', error.message);
      }
    }
  }

  processEmfBitBlt(data) {
    if (data.length < 100) return;
    // EMR_BITBLT 结构 (MS-EMF 2.3.1.1)
    // Bounds (16 bytes, offset 0-15): 目标矩形边界
    // xDest (4 bytes, offset 16): 目标X坐标
    // yDest (4 bytes, offset 20): 目标Y坐标  
    // cxDest (4 bytes, offset 24): 目标宽度
    // cyDest (4 bytes, offset 28): 目标高度

    const boundsLeft = this.readLongFromData(data, 0);
    const boundsTop = this.readLongFromData(data, 4);
    const boundsRight = this.readLongFromData(data, 8);
    const boundsBottom = this.readLongFromData(data, 12);

    const destX = this.readLongFromData(data, 16);
    const destY = this.readLongFromData(data, 20);
    const destWidth = this.readLongFromData(data, 24);
    const destHeight = this.readLongFromData(data, 28);

    // 使用 bounds 来计算实际宽高（如果 cx/cy 为0）
    const actualWidth = destWidth > 0 ? destWidth : (boundsRight - boundsLeft);
    const actualHeight = destHeight > 0 ? destHeight : (boundsBottom - boundsTop);

    console.log('EMF BitBlt: dest=', destX, destY, 'size=', actualWidth, 'x', actualHeight);

    // 尝试渲染嵌入的位图数据
    // 搜索 BITMAPINFOHEADER (biSize=40)
    try {
      let bmiOffset = -1;
      // 在记录数据中搜索 BITMAPINFOHEADER
      for (let i = 40; i < Math.min(data.length - 40, 200); i += 4) {
        const biSize = this.readDwordFromData(data, i);
        if (biSize === 40 || biSize === 108 || biSize === 124) {
          const biWidth = this.readLongFromData(data, i + 4);
          const biHeight = this.readLongFromData(data, i + 8);
          const biPlanes = data[i + 12] | (data[i + 13] << 8);
          const biBitCount = data[i + 14] | (data[i + 15] << 8);

          // 验证header合理性
          if (biPlanes === 1 && biWidth > 0 && biWidth < 20000 && Math.abs(biHeight) < 20000 &&
            (biBitCount === 1 || biBitCount === 4 || biBitCount === 8 || biBitCount === 16 ||
              biBitCount === 24 || biBitCount === 32)) {
            bmiOffset = i;
            break;
          }
        }
      }

      if (bmiOffset >= 0) {
        const biSize = this.readDwordFromData(data, bmiOffset);
        const biWidth = this.readLongFromData(data, bmiOffset + 4);
        const biHeight = this.readLongFromData(data, bmiOffset + 8);
        const biBitCount = data[bmiOffset + 14] | (data[bmiOffset + 15] << 8);
        const biCompression = this.readDwordFromData(data, bmiOffset + 16);

        console.log('  Bitmap:', biWidth, 'x', biHeight, 'bits:', biBitCount, 'compression:', biCompression);

        // 计算位图数据偏移
        let colorTableSize = 0;
        if (biBitCount <= 8) {
          const biClrUsed = this.readDwordFromData(data, bmiOffset + 32);
          colorTableSize = (biClrUsed || (1 << biBitCount)) * 4;
        }
        const bitsOffset = bmiOffset + biSize + colorTableSize;
        const bitsSize = data.length - bitsOffset;

        console.log('  Color table:', colorTableSize, 'bytes, Bitmap data offset:', bitsOffset, 'size:', bitsSize);

        // 如果是未压缩位图，尝试渲染
        if (biCompression === 0 && bitsOffset < data.length) {
          this.renderBitmap(destX, destY, actualWidth, actualHeight,
            biWidth, biHeight, biBitCount, data, bitsOffset, bitsSize, bmiOffset + biSize);
          return;
        }
      }
    } catch (error) {
      console.log('  Failed to render bitmap:', error.message);
    }

    // 降级：绘制一个占位符矩形表示图像位置
    const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformed2 = this.coordinateTransformer.transform(destX + actualWidth, destY + actualHeight, this.ctx.canvas.width, this.ctx.canvas.height);

    const w = Math.abs(transformed2.x - transformed1.x);
    const h = Math.abs(transformed2.y - transformed1.y);

    if (w > 0 && h > 0) {
      const savedFillStyle = this.ctx.fillStyle;
      const savedStrokeStyle = this.ctx.strokeStyle;

      this.ctx.fillStyle = '#f0f0f0';
      this.ctx.strokeStyle = '#cccccc';
      this.ctx.fillRect(transformed1.x, transformed1.y, w, h);
      this.ctx.strokeRect(transformed1.x, transformed1.y, w, h);

      this.ctx.fillStyle = savedFillStyle;
      this.ctx.strokeStyle = savedStrokeStyle;
    }
  }

  processEmfStretchBlt(data) {
    if (data.length < 100) return;
    // EMR_STRETCHBLT 结构 (MS-EMF 2.3.1.6)
    // STRETCHBLT 记录通常比较小，不包含位图数据，只是引用
    // 对于小的STRETCHBLT记录，绘制占位符

    const boundsLeft = this.readLongFromData(data, 0);
    const boundsTop = this.readLongFromData(data, 4);
    const boundsRight = this.readLongFromData(data, 8);
    const boundsBottom = this.readLongFromData(data, 12);

    const destX = this.readLongFromData(data, 16);
    const destY = this.readLongFromData(data, 20);
    const destWidth = this.readLongFromData(data, 24);
    const destHeight = this.readLongFromData(data, 28);

    // 使用 bounds 来计算实际宽高（如果 cx/cy 为0）
    const actualWidth = destWidth > 0 ? destWidth : (boundsRight - boundsLeft);
    const actualHeight = destHeight > 0 ? destHeight : (boundsBottom - boundsTop);

    console.log('EMF StretchBlt: dest=', destX, destY, 'size=', actualWidth, 'x', actualHeight, 'data.length=', data.length);

    // 如果记录足够大(>1000字节)，可能包含位图数据，尝试搜索
    if (data.length > 1000) {
      try {
        let bmiOffset = -1;
        // 在记录数据中搜索 BITMAPINFOHEADER
        for (let i = 40; i < Math.min(data.length - 40, 200); i += 4) {
          const biSize = this.readDwordFromData(data, i);
          if (biSize === 40 || biSize === 108 || biSize === 124) {
            const biWidth = this.readLongFromData(data, i + 4);
            const biHeight = this.readLongFromData(data, i + 8);
            const biPlanes = data[i + 12] | (data[i + 13] << 8);
            const biBitCount = data[i + 14] | (data[i + 15] << 8);

            // 验证header合理性
            if (biPlanes === 1 && biWidth > 0 && biWidth < 20000 && Math.abs(biHeight) < 20000 &&
              (biBitCount === 1 || biBitCount === 4 || biBitCount === 8 || biBitCount === 16 ||
                biBitCount === 24 || biBitCount === 32)) {
              bmiOffset = i;
              break;
            }
          }
        }

        if (bmiOffset >= 0) {
          const biSize = this.readDwordFromData(data, bmiOffset);
          const biWidth = this.readLongFromData(data, bmiOffset + 4);
          const biHeight = this.readLongFromData(data, bmiOffset + 8);
          const biBitCount = data[bmiOffset + 14] | (data[bmiOffset + 15] << 8);
          const biCompression = this.readDwordFromData(data, bmiOffset + 16);

          console.log('  Bitmap:', biWidth, 'x', biHeight, 'bits:', biBitCount, 'compression:', biCompression);

          // 计算位图数据偏移
          let colorTableSize = 0;
          if (biBitCount <= 8) {
            const biClrUsed = this.readDwordFromData(data, bmiOffset + 32);
            colorTableSize = (biClrUsed || (1 << biBitCount)) * 4;
          }
          const bitsOffset = bmiOffset + biSize + colorTableSize;
          const bitsSize = data.length - bitsOffset;

          console.log('  Bitmap data offset:', bitsOffset, 'size:', bitsSize);

          // 如果是未压缩位图，尝试渲染
          if (biCompression === 0 && bitsOffset < data.length) {
            this.renderBitmap(destX, destY, actualWidth, actualHeight,
              biWidth, biHeight, biBitCount, data, bitsOffset, bitsSize, bmiOffset + biSize);
            return;
          }
        }
      } catch (error) {
        console.log('  Failed to render bitmap:', error.message);
      }
    }

    // 降级：绘制一个占位符矩形表示图像位置
    const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformed2 = this.coordinateTransformer.transform(destX + actualWidth, destY + actualHeight, this.ctx.canvas.width, this.ctx.canvas.height);

    const w = Math.abs(transformed2.x - transformed1.x);
    const h = Math.abs(transformed2.y - transformed1.y);

    if (w > 0 && h > 0) {
      const savedFillStyle = this.ctx.fillStyle;
      const savedStrokeStyle = this.ctx.strokeStyle;

      this.ctx.fillStyle = '#f0f0f0';
      this.ctx.strokeStyle = '#cccccc';
      this.ctx.fillRect(transformed1.x, transformed1.y, w, h);
      this.ctx.strokeRect(transformed1.x, transformed1.y, w, h);

      this.ctx.fillStyle = savedFillStyle;
      this.ctx.strokeStyle = savedStrokeStyle;
    }
  }

  processEmfCreateMonoBrush(data) {
    console.log('EMF CreateMonoBrush');
    // 创建单色画刷，简化处理
    this.gdiObjectManager.createBrush(0, '#000000');
  }

  processEmfCreateColorSpaceW(data) {
    console.log('EMF CreateColorSpaceW');
    // 创建颜色空间，简化处理，大多数情况可以忽略
  }

  processEmfText(data) {
    // 保持向后兼容
    this.processEmfTextOut(data, true);
  }

  // === 新增的EMF记录处理方法 ===

  processEmfSetPixelV(data) {
    // EMR_SETPIXELV: Point(8) + Color(4)
    if (data.length < 12) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    const color = this.readDwordFromData(data, 8);
    const hexColor = this.rgbToHex(color);
    const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

    this.ctx.fillStyle = hexColor;
    this.ctx.fillRect(transformed.x, transformed.y, 1, 1);
    console.log('EMF SetPixelV:', x, y, hexColor);
  }

  processEmfSetMapperFlags(data) {
    if (data.length < 4) return;
    const flags = this.readDwordFromData(data, 0);
    console.log('EMF SetMapperFlags:', flags);
  }

  processEmfSetPolyFillMode(data) {
    if (data.length < 4) return;
    const mode = this.readDwordFromData(data, 0);
    console.log('EMF SetPolyFillMode:', mode);
    // 1 = ALTERNATE, 2 = WINDING
    if (mode === 1) {
      this.ctx.fillRule = 'evenodd';
    } else if (mode === 2) {
      this.ctx.fillRule = 'nonzero';
    }
  }

  processEmfSetColorAdjustment(data) {
    console.log('EMF SetColorAdjustment');
    // 颜色调整，浏览器Canvas中不常用
  }

  processEmfOffsetClipRgn(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF OffsetClipRgn:', x, y);
    // Canvas中裁剪区域偏移不直接支持
  }

  processEmfSetMetaRgn(data) {
    console.log('EMF SetMetaRgn');
    // 设置元区域
  }

  processEmfExcludeClipRect(data) {
    if (data.length < 16) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    console.log('EMF ExcludeClipRect:', left, top, right, bottom);
    // Canvas不直接支持排除裁剪
  }

  processEmfIntersectClipRect(data) {
    if (data.length < 16) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(
      transformedLeftTop.x,
      transformedLeftTop.y,
      transformedRightBottom.x - transformedLeftTop.x,
      transformedRightBottom.y - transformedLeftTop.y
    );
    this.ctx.clip();
    console.log('EMF IntersectClipRect:', left, top, right, bottom);
  }

  processEmfScaleViewportExtEx(data) {
    if (data.length < 16) return;
    const xNum = this.readLongFromData(data, 0);
    const xDenom = this.readLongFromData(data, 4);
    const yNum = this.readLongFromData(data, 8);
    const yDenom = this.readLongFromData(data, 12);
    console.log('EMF ScaleViewportExtEx:', xNum, xDenom, yNum, yDenom);
    // 需要更新坐标转换器的viewport范围
  }

  processEmfScaleWindowExtEx(data) {
    if (data.length < 16) return;
    const xNum = this.readLongFromData(data, 0);
    const xDenom = this.readLongFromData(data, 4);
    const yNum = this.readLongFromData(data, 8);
    const yDenom = this.readLongFromData(data, 12);
    console.log('EMF ScaleWindowExtEx:', xNum, xDenom, yNum, yDenom);
    // 需要更新坐标转换器的window范围
  }

  processEmfSaveDC(data) {
    this.ctx.save();
    this.dcStateStack.push(this._captureDcState());
    console.log('EMF SaveDC');
  }

  // 快照当前设备上下文状态（GDI 对象 + 坐标变换 + 绘制样式）
  _captureDcState() {
    const ct = this.coordinateTransformer;
    return {
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      lineWidth: this.lineWidth,
      arcDirection: this.arcDirection,
      textColor: this.textColor,
      objectTable: this.gdiObjectManager
        ? new Map(this.gdiObjectManager.objectTable)
        : null,
      mapMode: ct.mapMode,
      windowOrgX: ct.windowOrgX,
      windowOrgY: ct.windowOrgY,
      windowExtX: ct.windowExtX,
      windowExtY: ct.windowExtY,
      viewportOrgX: ct.viewportOrgX,
      viewportOrgY: ct.viewportOrgY,
      viewportExtX: ct.viewportExtX,
      viewportExtY: ct.viewportExtY,
    };
  }

  // 恢复设备上下文状态
  _restoreDcState(state) {
    if (!state) return;
    this.fillColor = state.fillColor;
    this.strokeColor = state.strokeColor;
    this.lineWidth = state.lineWidth;
    this.arcDirection = state.arcDirection;
    if (state.textColor) this.textColor = state.textColor;
    if (this.gdiObjectManager && state.objectTable) {
      this.gdiObjectManager.objectTable = new Map(state.objectTable);
    }
    const ct = this.coordinateTransformer;
    ct.mapMode = state.mapMode;
    ct.windowOrgX = state.windowOrgX;
    ct.windowOrgY = state.windowOrgY;
    ct.windowExtX = state.windowExtX;
    ct.windowExtY = state.windowExtY;
    ct.viewportOrgX = state.viewportOrgX;
    ct.viewportOrgY = state.viewportOrgY;
    ct.viewportExtX = state.viewportExtX;
    ct.viewportExtY = state.viewportExtY;
  }

  processEmfSetWorldTransform(data) {
    if (data.length < 24) return;
    // XFORM结构：M11, M12, M21, M22, Dx, Dy (每个4字节float)
    console.log('EMF SetWorldTransform');
    // Canvas中的transform需要从XFORM转换
  }

  processEmfModifyWorldTransform(data) {
    if (data.length < 28) return;
    console.log('EMF ModifyWorldTransform');
    // 修改世界坐标变换
  }

  processEmfAngleArc(data) {
    if (data.length < 20) return;
    const centerX = this.readLongFromData(data, 0);
    const centerY = this.readLongFromData(data, 4);
    const radius = this.readDwordFromData(data, 8);
    const startAngle = this.readDwordFromData(data, 12); // 以度为单位
    const sweepAngle = this.readDwordFromData(data, 16); // 以度为单位

    const transformed = this.coordinateTransformer.transform(centerX, centerY, this.ctx.canvas.width, this.ctx.canvas.height);
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + sweepAngle) * Math.PI) / 180;

    this.ctx.beginPath();
    this.ctx.arc(transformed.x, transformed.y, radius, startRad, endRad, sweepAngle < 0);
    this.ctx.stroke();
    console.log('EMF AngleArc:', centerX, centerY, radius, startAngle, sweepAngle);
  }

  processEmfRoundRect(data) {
    if (data.length < 24) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    const cornerWidth = this.readLongFromData(data, 16);
    const cornerHeight = this.readLongFromData(data, 20);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const width = transformedRightBottom.x - transformedLeftTop.x;
    const height = transformedRightBottom.y - transformedLeftTop.y;
    const rx = cornerWidth / 2;
    const ry = cornerHeight / 2;

    this.ctx.beginPath();
    this.ctx.roundRect(transformedLeftTop.x, transformedLeftTop.y, width, height, [rx]);
    this.ctx.stroke();
    console.log('EMF RoundRect:', left, top, right, bottom);
  }

  // 计算部分椭圆弧的起止角（画布角度）。
  // GDI 坐标 Y 轴向下，"逆时针"（AD_COUNTERCLOCKWISE，
  // 默认）在屏幕上即逆时针 = 画布 anticlockwise=true（沿角度递减方向）；
  // GDI 顺时针（AD_CLOCKWISE）= 画布 anticlockwise=false。
  _calcArcAngles(cx, cy, rx, ry, startX, startY, endX, endY) {
    const st = this.coordinateTransformer.transform(startX, startY, this.ctx.canvas.width, this.ctx.canvas.height);
    const en = this.coordinateTransformer.transform(endX, endY, this.ctx.canvas.width, this.ctx.canvas.height);
    const startAngle = Math.atan2((st.y - cy) / ry, (st.x - cx) / rx);
    const endAngle = Math.atan2((en.y - cy) / ry, (en.x - cx) / rx);
    // 画布会按 anticlockwise 标志沿对应方向自动取 (start-end) mod 2π 的扫过量
    return {
      startAngle,
      endAngle,
      anticlockwise: this.arcDirection !== 0x02,
    };
  }

  processEmfArc(data) {
    if (data.length < 32) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    const startX = this.readLongFromData(data, 16);
    const startY = this.readLongFromData(data, 20);
    const endX = this.readLongFromData(data, 24);
    const endY = this.readLongFromData(data, 28);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
    const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
    const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
    const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;

    if (radiusX === 0 || radiusY === 0) return;

    const { startAngle, endAngle, anticlockwise } = this._calcArcAngles(centerX, centerY, radiusX, radiusY, startX, startY, endX, endY);
    const full = Math.abs(endAngle - startAngle) < 1e-6;

    this.ctx.beginPath();
    if (full) {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    } else {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, startAngle, endAngle, anticlockwise);
    }
    this.ctx.stroke();
    console.log('EMF Arc:', left, top, right, bottom);
  }

  processEmfChord(data) {
    // EMR_CHORD结构与EMR_ARC相同，用弦连接起止点
    if (data.length < 32) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    const startX = this.readLongFromData(data, 16);
    const startY = this.readLongFromData(data, 20);
    const endX = this.readLongFromData(data, 24);
    const endY = this.readLongFromData(data, 28);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
    const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
    const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
    const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;

    if (radiusX === 0 || radiusY === 0) return;

    const { startAngle, endAngle, anticlockwise } = this._calcArcAngles(centerX, centerY, radiusX, radiusY, startX, startY, endX, endY);
    const full = Math.abs(endAngle - startAngle) < 1e-6;

    this.ctx.beginPath();
    if (full) {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    } else {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, startAngle, endAngle, anticlockwise);
    }
    this.ctx.closePath(); // 弦
    this.ctx.fill();
    this.ctx.stroke();
    console.log('EMF Chord:', left, top, right, bottom);
  }

  processEmfPie(data) {
    // EMR_PIE结构与EMR_ARC相同，用半径连接圆心闭合
    if (data.length < 32) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);
    const startX = this.readLongFromData(data, 16);
    const startY = this.readLongFromData(data, 20);
    const endX = this.readLongFromData(data, 24);
    const endY = this.readLongFromData(data, 28);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
    const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
    const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
    const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;

    if (radiusX === 0 || radiusY === 0) return;

    const { startAngle, endAngle, anticlockwise } = this._calcArcAngles(centerX, centerY, radiusX, radiusY, startX, startY, endX, endY);
    const full = Math.abs(endAngle - startAngle) < 1e-6;

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    if (full) {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    } else {
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, startAngle, endAngle, anticlockwise);
    }
    this.ctx.closePath(); // 回到圆心
    this.ctx.fill();
    this.ctx.stroke();
    console.log('EMF Pie:', left, top, right, bottom);
  }

  processEmfSelectPalette(data) {
    if (data.length < 4) return;
    const paletteHandle = this.readDwordFromData(data, 0);
    console.log('EMF SelectPalette:', paletteHandle);
  }

  processEmfCreatePalette(data) {
    console.log('EMF CreatePalette');
    // 调色板创建，Canvas中不常用
  }

  processEmfSetPaletteEntries(data) {
    console.log('EMF SetPaletteEntries');
  }

  processEmfResizePalette(data) {
    console.log('EMF ResizePalette');
  }

  processEmfRealizePalette(data) {
    console.log('EMF RealizePalette');
  }

  processEmfExtFloodFill(data) {
    if (data.length < 16) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    const color = this.readDwordFromData(data, 8);
    const fillType = this.readDwordFromData(data, 12);
    console.log('EMF ExtFloodFill:', x, y, color, fillType);
    // Canvas不直接支持填充操作
  }

  processEmfArcTo(data) {
    // EMR_ARCTO与EMR_ARC结构相同，但会移动当前位置
    if (data.length < 32) return;
    const left = this.readLongFromData(data, 0);
    const top = this.readLongFromData(data, 4);
    const right = this.readLongFromData(data, 8);
    const bottom = this.readLongFromData(data, 12);

    const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
    const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
    const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
    const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
    const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
    const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;

    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    console.log('EMF ArcTo:', left, top, right, bottom);
  }

  processEmfPolyDraw(data) {
    // EMR_POLYDRAW: Bounds(16) + Count(4) + Points[] + Types[]
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    console.log('EMF PolyDraw, count:', count);

    if (data.length < 20 + count * 8 + count) return;

    // 读取点和类型
    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const type = data[20 + count * 8 + i];
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);

      // type: 1=MOVETO, 2=LINETO, 4=BEZIERTO, 128=CLOSEFIGURE
      if (type & 1) {
        this.ctx.moveTo(transformed.x, transformed.y);
      } else if (type & 2) {
        this.ctx.lineTo(transformed.x, transformed.y);
      }
      if (type & 128) {
        this.ctx.closePath();
      }
    }
    this.ctx.stroke();
  }

  processEmfSetArcDirection(data) {
    if (data.length < 4) return;
    const direction = this.readDwordFromData(data, 0);
    this.arcDirection = direction; // 1 = counterclockwise, 2 = clockwise
    console.log('EMF SetArcDirection:', direction);
  }

  processEmfSetMiterLimit(data) {
    if (data.length < 4) return;
    const miterLimit = this.readDwordFromData(data, 0);
    this.ctx.miterLimit = miterLimit;
    console.log('EMF SetMiterLimit:', miterLimit);
  }

  processEmfCloseFigure(data) {
    this.ctx.closePath();
    console.log('EMF CloseFigure');
  }

  processEmfFillPath(data) {
    this.ctx.fill();
    this.pathState = 'idle';
    console.log('EMF FillPath');
  }

  processEmfFlattenPath(data) {
    console.log('EMF FlattenPath');
    // 将路径中的曲线转换为直线
  }

  processEmfWidenPath(data) {
    console.log('EMF WidenPath');
    // 扩展路径边界
  }

  processEmfSelectClipPath(data) {
    if (data.length < 4) return;
    const mode = this.readDwordFromData(data, 0);
    console.log('EMF SelectClipPath, mode:', mode);
    // 1=AND, 2=OR, 3=XOR, 4=DIFF, 5=COPY
    if (mode === 5) {
      this.ctx.clip();
    }
  }

  tryProcessAsCoordinates(data) {
    // 尝试将数据解析为坐标点
    if (data.length < 16) return;

    const points = [];
    for (let i = 0; i < data.length - 8; i += 8) {
      const x = this.readDwordFromData(data, i);
      const y = this.readDwordFromData(data, i + 4);

      // 检查坐标值是否合理
      if (Math.abs(x) < 50000 && Math.abs(y) < 50000) {
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        points.push(transformed);
      }
    }

    // 如果有足够的点，绘制折线
    if (points.length >= 3) {
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.ctx.lineTo(points[i].x, points[i].y);
      }
      this.ctx.stroke();
      console.log('Drew polyline with', points.length, 'points from unknown record');
    }
  }

  finishPath() {
    // 完成路径绘制
    if (this.pathState === 'active' || this.pathState === 'completed') {
      this.ctx.stroke();
      this.pathState = 'idle';
    }
  }

  // 渲染DIB位图数据到Canvas
  renderBitmap(destX, destY, destWidth, destHeight, biWidth, biHeight, biBitCount, data, bitsOffset, bitsSize, colorTableOffset) {
    try {
      // 行字节数按 DWORD（4 字节）对齐
      const rowSize = Math.ceil((biWidth * biBitCount) / 32) * 4;
      const absHeight = Math.abs(biHeight);
      const isBottomUp = biHeight > 0;

      // 创建ImageData
      const imageData = this.ctx.createImageData(biWidth, absHeight);
      const pixels = imageData.data;

      // 读取调色板（1/4/8bpp 时有效），条目为 BGR(A)
      const palette = [];
      if (biBitCount <= 8 && colorTableOffset !== undefined) {
        const count = 1 << biBitCount;
        for (let i = 0; i < count; i++) {
          const o = colorTableOffset + i * 4;
          if (o + 4 > data.length) break;
          palette.push([data[o + 2], data[o + 1], data[o], 255]);
        }
      }

      // 读取位图数据（按位深解码）
      for (let y = 0; y < absHeight; y++) {
        const srcY = isBottomUp ? (absHeight - 1 - y) : y;
        const srcRowOffset = bitsOffset + srcY * rowSize;

        for (let x = 0; x < biWidth; x++) {
          const dstOffset = (y * biWidth + x) * 4;
          let r = 0, g = 0, b = 0, a = 255;

          if (biBitCount === 1) {
            const byteIdx = srcRowOffset + (x >> 3);
            if (byteIdx < bitsOffset + bitsSize) {
              const bit = 7 - (x & 7);
              const idx = (data[byteIdx] >> bit) & 1;
              const c = palette[idx] || [0, 0, 0, 255];
              r = c[0]; g = c[1]; b = c[2];
            }
          } else if (biBitCount === 4) {
            const byteIdx = srcRowOffset + (x >> 1);
            if (byteIdx < bitsOffset + bitsSize) {
              const idx = (x & 1) === 0 ? (data[byteIdx] >> 4) : (data[byteIdx] & 0x0F);
              const c = palette[idx] || [0, 0, 0, 255];
              r = c[0]; g = c[1]; b = c[2];
            }
          } else if (biBitCount === 8) {
            const idx = data[srcRowOffset + x];
            const c = palette[idx] || [0, 0, 0, 255];
            r = c[0]; g = c[1]; b = c[2];
          } else if (biBitCount === 16) {
            // RGB555：b[0-4] g[5-9] r[10-14]
            const o = srcRowOffset + x * 2;
            if (o + 2 <= bitsOffset + bitsSize) {
              const v = data[o] | (data[o + 1] << 8);
              r = ((v >> 10) & 0x1F) * 255 / 31;
              g = ((v >> 5) & 0x1F) * 255 / 31;
              b = (v & 0x1F) * 255 / 31;
            }
          } else if (biBitCount === 24) {
            const o = srcRowOffset + x * 3;
            if (o + 3 <= bitsOffset + bitsSize) {
              b = data[o]; g = data[o + 1]; r = data[o + 2];
            }
          } else if (biBitCount === 32) {
            const o = srcRowOffset + x * 4;
            if (o + 4 <= bitsOffset + bitsSize) {
              b = data[o]; g = data[o + 1]; r = data[o + 2]; a = data[o + 3];
            }
          }

          pixels[dstOffset] = r | 0;
          pixels[dstOffset + 1] = g | 0;
          pixels[dstOffset + 2] = b | 0;
          pixels[dstOffset + 3] = a;
        }
      }

      // 创建临时canvas
      // 注意：SvgContext 的 mock canvas 是普通对象，constructor 为 Object，不可用于创建画布
      const canvasCtor = (typeof document === 'undefined' && this.ctx.canvas)
        ? this.ctx.canvas.constructor
        : null;
      const isRealCanvasCtor = typeof canvasCtor === 'function' && canvasCtor.name !== 'Object';
      const tempCanvas = typeof document !== 'undefined'
        ? document.createElement('canvas')
        : (isRealCanvasCtor ? new canvasCtor(biWidth, absHeight) : null);

      if (tempCanvas) {
        tempCanvas.width = biWidth;
        tempCanvas.height = absHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);

        // 转换坐标并绘制到目标canvas
        const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformed2 = this.coordinateTransformer.transform(destX + destWidth, destY + destHeight, this.ctx.canvas.width, this.ctx.canvas.height);

        const w = Math.abs(transformed2.x - transformed1.x);
        const h = Math.abs(transformed2.y - transformed1.y);

        console.log('  Rendering bitmap to:', transformed1.x, transformed1.y, w, h);
        this.ctx.drawImage(tempCanvas, transformed1.x, transformed1.y, w, h);
      } else {
        // 如果无法创建临时canvas（Node环境），直接使用putImageData
        const transformed = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.putImageData(imageData, transformed.x, transformed.y);
      }
    } catch (error) {
      console.error('Error rendering bitmap:', error.message);
    }
  }
}

module.exports = EmfDrawer;