// EMF绘制模块
const CoordinateTransformer = require('../../utils/coordinateTransformer');
const GdiObjectManager = require('../../utils/gdiObjectManager');
const EmfPlusParser = require('../parsers/emfPlusParser');
const EmfPlusDrawer = require('./emfPlusDrawer');

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
  0x0000005E: 'processEmfCreateDibPatternBrushPT', // EMR_CREATEDIBPATTERNBRUSHPT
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
  // 五种记录字段布局各不相同（MS-EMF 2.3.1），必须分别解析，
  // 位图数据一律按 offBmiSrc/offBitsSrc 精确定位（相对记录起始，含 8 字节 EMR 头）。
  0x0000004C: 'processEmfBitBlt',           // EMR_BITBLT
  0x0000004D: 'processEmfStretchBlt',       // EMR_STRETCHBLT
  0x00000051: 'processEmfStretchDibBits',   // EMR_STRETCHDIBITS
  0x00000072: 'processEmfAlphaBlend',       // EMR_ALPHABLEND
  0x00000074: 'processEmfTransparentBlt',   // EMR_TRANSPARENTBLT

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
  0x00000046: 'processEmfGdiComment', // EMR_GDICOMMENT（含 EMF+ 内嵌数据时派发）
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
    this._penIsBlack = true;    // 当前是否默认黑色 pen（未显式选彩色笔）
    this._penStockBlack = true; // 是否 stock BLACK_PEN（1px）：fill 形状用同色描边
    this._penNull = false;      // NULL_PEN 不描边
    this.textColor = '#000000'; // 文本颜色（SetTextColor）
    this.dcStateStack = []; // SaveDC/RestoreDC 状态栈
    this.currentPos = { x: 0, y: 0 }; // 当前位置（逻辑/窗口坐标），MoveToEx/LineTo/Poly*To 使用
    this._emfPlusDrawer = null; // 惰性创建的内嵌 EMF+ 播放器（与标准 EMF 记录共享 ctx）
  }

  draw(metafileData, options = {}) {
    console.log('Drawing EMF with header:', metafileData.header);
    console.log('Number of records:', metafileData.records.length);

    // 获取view尺寸，默认为800x600
    const viewWidth = options.viewWidth || 800;
    const viewHeight = options.viewHeight || 600;

    // 设置Canvas大小和坐标转换
    // 设备空间模型：canvas = EMF 设备坐标系（header rclBounds 内容设备包围盒）。
    // 坐标经 window→viewport 仿射映射（若文件声明了 SETMAPMODE/EXT/ORG）进入该空间，
    // 不再 scaleToFit 放大——外部 rsvg/view 按需缩放显示，1px 描边在任一端恒定 1px。
    let canvasWidth, canvasHeight;
    if (metafileData.header.bounds) {
      const bounds = metafileData.header.bounds;
      const bW = Math.abs(bounds.right - bounds.left);
      const bH = Math.abs(bounds.bottom - bounds.top);
      canvasWidth = Math.max(1, Math.round(bW));
      canvasHeight = Math.max(1, Math.round(bH));
      // device→canvas：header rclBounds 原点平移到画布 (0,0)，使内容铺满 canvas
      //（各参考实现均在根层 translate(-bounds.left, -bounds.top)）
      this.coordinateTransformer.setDeviceOrg(bounds.left, bounds.top);
      // 初始 window/viewport 均视为 identity（1:1 设备），随后若文件有
      // SETWINDOWEXTEX / SETVIEWPORTEXTEX 记录会覆盖为文件的 window/viewport 映射。
      this.coordinateTransformer.setWindowOrg(0, 0);
      this.coordinateTransformer.setWindowExt(canvasWidth, canvasHeight);
      this.coordinateTransformer.setViewportOrg(0, 0);
      this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
      this._fileWindowExtX = canvasWidth;
      this._fileWindowExtY = canvasHeight;
      this._fileViewportExtX = canvasWidth;
      this._fileViewportExtY = canvasHeight;
      console.log('Canvas(device):', canvasWidth, 'x', canvasHeight);
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

    // 计算 pxPerMm（来自 EMF header.szlDevice / szlMillimeters），
    // 供 MM_LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS 等固定比例模式使用。
    // GDI 默认：1 inch = 25.4 mm, 1 mm = pxPerMm 像素。
    if (metafileData.header.szlDevice && metafileData.header.szlMillimeters) {
      const mmX = metafileData.header.szlMillimeters.cx || metafileData.header.szlMillimeters.cy || 1;
      const pxX = metafileData.header.szlDevice.cx || metafileData.header.szlDevice.cy || 1;
      this.coordinateTransformer.setPxPerMm(pxX / mmX);
    }

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

    // 设置默认绘制样式（GDI 默认：BLACK_PEN = 1px 黑色，WHITE_BRUSH 填充）
    this.ctx.strokeStyle = '#000000'; // 黑色描边
    this.ctx.fillStyle = '#ffffff'; // 白色填充
    this.ctx.lineWidth = 1;
    this.fillColor = '#ffffff';
    this.strokeColor = '#000000';
    console.log('Drawing styles set');

    // 重置路径状态
    this.currentPath = [];
    this.pathState = 'idle';
    this.currentPos = { x: 0, y: 0 };

    // 处理每个记录
    const debugLogs = globalThis.__WMF_DEBUG__;
    for (let i = 0; i < metafileData.records.length; i++) {
      const record = metafileData.records[i];
      // 距上次 GDI+ GDICOMMENT 距离计数：用于判定紧跟 GDI+ 块的"绘图区背景"
      // 类 STROKEFILL（见 test-000 实证：LO 与 ref 都不画这种 fill，仅描边）。
      this._recSinceGdiC = (this._recSinceGdiC == null ? 999 : this._recSinceGdiC) + 1;
      if (record.type === 0x46) this._recSinceGdiC = 0;
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
      this._penNull = isNullPen;
      this._penIsBlack = isNullPen || /^(#000000|#000|black)$/i.test(obj.color || '');
      // 显式创建的笔（非 stock）：不再视为"默认黑笔"
      if (!obj._isStockPen) this._penStockBlack = false;
      this.ctx.strokeStyle = isNullPen ? 'transparent' : obj.color;
      if (!isNullPen) {
        // 线宽按当前 window→viewport 缩放换算到像素；cosmetic(PS_COSMETIC=0x10) 固定 1px
        const scale = this.coordinateTransformer.getScale();
        const w = obj.width || 1;
        this.ctx.lineWidth = Math.max(1, Math.round(w * Math.abs(scale.x || 1)));
        // Pen Style → SVG stroke-dasharray
        // PS_SOLID=0 / PS_DASH=1 / PS_DOT=2 / PS_DASHDOT=3 / PS_DASHDOTDOT=4
        const ps = obj.style & 0xF;
        let dash = [];
        if (ps === 1) dash = [3 * w, 1 * w];                // PS_DASH
        else if (ps === 2) dash = [1 * w, 1 * w];           // PS_DOT
        else if (ps === 3) dash = [3 * w, 1 * w, 1 * w, 1 * w];              // PS_DASHDOT
        else if (ps === 4) dash = [3 * w, 1 * w, 1 * w, 1 * w, 1 * w, 1 * w]; // PS_DASHDOTDOT
        if (typeof this.ctx.setLineDash === 'function') this.ctx.setLineDash(dash);
      } else {
        // NULL_PEN：清空 dash 避免残留
        if (typeof this.ctx.setLineDash === 'function') this.ctx.setLineDash([]);
      }
    } else if (obj.type === 'brush') {
      // DIB Pattern Brush（BS_PATTERN/BS_DIBPATTERN）以 url(...) 形式 fill
      this.ctx.fillStyle = obj.url || (obj.color === 'transparent' ? 'transparent' : obj.color);
    } else if (obj.type === 'font' && obj.faceName) {
      // 字体对象：构建 canvas font 字符串（尺寸按缩放换算）
      const scale = this.coordinateTransformer.getScale();
      const size = Math.max(1, Math.round(Math.abs(obj.height || 12) * Math.abs(scale.y || 1)));
      const weight = (obj.weight || 400) >= 700 ? 'bold ' : '';
      const italic = obj.italic ? 'italic ' : '';
      this.ctx.font = `${italic}${weight}${size}px "${obj.faceName || 'sans-serif'}"`;
    }
  }

  // 填充形状收尾：fill 后描边。默认黑色 1px pen（Excel 色块场景）时改为填充同色
  // 1px 描边（对齐参考实现：彩色 fill 边缘无黑框）；显式彩色/宽笔保持原样描边。
  _afterFillShape() {
    if (this._penNull) return;
    if (this._penStockBlack) {
      const f = this.ctx.fillStyle;
      const s = this.ctx.strokeStyle;
      const w = this.ctx.lineWidth;
      this.ctx.strokeStyle = f;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.strokeStyle = s;
      this.ctx.lineWidth = w;
    } else {
      this.ctx.stroke();
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
      if (obj.type === 'pen') this._penStockBlack = obj.width === 1 && /^(#000000|black)$/i.test(obj.color || '');
      obj._isStockPen = true;
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
    this._afterFillShape();
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

    // 从当前位置起步（GDI PolyBezierTo 语义）
    this.ctx.beginPath();
    const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.moveTo(start.x, start.y);
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
    const last = points[points.length - 1];
    if (last) {
      // 记录逻辑坐标终点
      this.currentPos = {
        x: this.readLongFromData(data, 20 + (count - 1) * 8),
        y: this.readLongFromData(data, 24 + (count - 1) * 8)
      };
    }
  }

  processEmfPolylineTo(data) {
    // EMR_POLYLINETO: Bounds(16) + Count(4) + Points[]
    // 使用当前位置作为起点
    if (data.length < 20) return;

    const count = this.readDwordFromData(data, 16);
    console.log('Processing EMF PolylineTo, count:', count);

    if (data.length < 20 + count * 8) return;

    this.ctx.beginPath();
    const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.moveTo(start.x, start.y);
    for (let i = 0; i < count; i++) {
      const x = this.readLongFromData(data, 20 + i * 8);
      const y = this.readLongFromData(data, 24 + i * 8);
      const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
      this.ctx.lineTo(transformed.x, transformed.y);
    }
    this.ctx.stroke();
    this.currentPos = {
      x: this.readLongFromData(data, 20 + (count - 1) * 8),
      y: this.readLongFromData(data, 24 + (count - 1) * 8)
    };
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

    // 读取所有点并绘制：所有子多边形合并到同一条 path（nonzero 填充规则下，
    // 反向缠绕的内圈会形成"环"——这是 GDI 用 POLYPOLYGON 画同心环/带孔图形的标准手法）。
    // 若逐个子多边形单独 fill，内圈会被实心覆盖，环消失。
    let pointOffset = 24 + numberOfPolygons * 4;
    this.ctx.beginPath();
    for (let i = 0; i < numberOfPolygons; i++) {
      const count = counts[i];

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
    }
    this.ctx.fill();
    this._afterFillShape();
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
    this._afterFillShape();
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
    this.ctx.beginPath();
    const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.moveTo(start.x, start.y);
    for (let i = 0; i + 2 < points.length; i += 3) {
      this.ctx.bezierCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[i + 2].x, points[i + 2].y);
    }
    this.ctx.stroke();
    this.currentPos = {
      x: this.readInt16FromData(data, 20 + (count - 1) * 4),
      y: this.readInt16FromData(data, 20 + (count - 1) * 4 + 2)
    };
  }

  processEmfPolyLineTo16(data) {
    // EMR_POLYLINETO16: 从当前位置连线
    if (data.length < 20) return;
    const count = this.readDwordFromData(data, 16);
    if (count < 1 || data.length < 20 + count * 4) return;
    const points = this.readPoints16(data, 20, count);
    this.ctx.beginPath();
    const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.moveTo(start.x, start.y);
    points.forEach(p => this.ctx.lineTo(p.x, p.y));
    this.ctx.stroke();
    this.currentPos = {
      x: this.readInt16FromData(data, 20 + (count - 1) * 4),
      y: this.readInt16FromData(data, 20 + (count - 1) * 4 + 2)
    };
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
    // 所有子多边形合并到同一条 path（nonzero 填充，反向缠绕的内圈形成环）。
    // 逐个子多边形单独 fill 会把内圈实心覆盖，导致同心环/带孔图形丢失。
    let pointOffset = 24 + nPolys * 4;
    this.ctx.beginPath();
    for (let i = 0; i < nPolys; i++) {
      const count = this.readDwordFromData(data, 24 + i * 4);
      const points = this.readPoints16(data, pointOffset, count);
      pointOffset += count * 4;
      points.forEach((p, j) => (j === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y)));
      this.ctx.closePath();
    }
    this.ctx.fill();
    this._afterFillShape();
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

  // 处理 EMR_GDICOMMENT：EMF+ 数据经此内嵌于标准 EMF 记录流（Windows 按记录序交织播放）。
  // data（record.data，已剥离 8 字节 EMR 头）布局：[DataSize(4)] [CommentIdentifier(4)] [EMF+ 记录...]
  processEmfGdiComment(data) {
    if (!data || data.length < 8) return;
    if (this.readDwordFromData(data, 4) !== 0x2B464D45) return; // 非 EMF+ 注释
    try {
      const parser = new EmfPlusParser(data); // parseEmfPlusRecords 只依赖入参
      const emfPlusRecords = parser.parseEmfPlusRecords(data);
      if (emfPlusRecords.length === 0) return;
      if (!this._emfPlusDrawer) {
        this._emfPlusDrawer = new EmfPlusDrawer(this.ctx);
        // 共享坐标变换：EMF+ 记录与 EMF 记录共享同一设备坐标系
        //（window/viewport/世界变换等由外层 EMF 记录维护，内嵌 EMF+ 沿用）
        this._emfPlusDrawer.coordinateTransformer = this.coordinateTransformer;
      }
      for (const rec of emfPlusRecords) {
        this._emfPlusDrawer.processEmfPlusRecordType(rec.type, rec.flags, rec.data);
      }
    } catch (e) {
      console.log('EMF+ GDIComment playback failed:', e.message);
    }
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
    // 文件声明的 viewport ext 直接进入 transformer（GDI 语义：window→viewport
    // 仿射映射把逻辑坐标变换到设备坐标）。canvas 本身即设备空间（见 draw()），
    // 二者一致时 1:1 正确；此前把它强制为 canvas 尺寸的 hack 会使声明了
    // 自定义 viewport 的 EMF（如 MM_ISOTROPIC 大 window/小 viewport）缩放错误。
    this._fileViewportExtX = x || 1;
    this._fileViewportExtY = y || 1;
    this.coordinateTransformer.setViewportExt(x, y);
  }

  processEmfSetViewportOrgEx(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    console.log('EMF SetViewportOrgEx:', x, y);
    // 文件 vpOrg 就是设备坐标偏移，直接使用（设备空间与 canvas 一致）
    this.coordinateTransformer.setViewportOrg(x, y);
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
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    // GDI 语义：MoveToEx 仅更新"当前位置"，不立即产生绘制动作。
    // 实际的 moveTo 由后续 LineTo/Poly*To 在自身 beginPath 中完成，
    // 否则 moveTo 会累积进共享路径段导致 SVG 体积二次方膨胀。
    this.currentPos = { x, y };
    console.log('EMF MoveToEx:', x, y);
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
    } else if ((objectHandle >>> 0) >= 0x80000000) {
      // readDwordFromData 返回 signed int32；stock 句柄高位 0x80000000+ 会变负，需无符号化比较
      this.applyStockObject(objectHandle >>> 0);
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
    this.ctx.fill();  // GDI ELLIPSE = 当前画刷填充 + 画笔描边
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
    this.ctx.fill();  // GDI RECTANGLE = 当前画刷填充 + 画笔描边
    this.ctx.stroke();
  }

  processEmfLineTo(data) {
    if (data.length < 8) return;
    const x = this.readLongFromData(data, 0);
    const y = this.readLongFromData(data, 4);
    const from = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
    const to = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    // 每条线独立 beginPath，避免路径段跨记录累积
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    this.currentPos = { x, y };
    console.log('EMF LineTo:', x, y);
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
    // Excel 图表常见模式：GDICOMMENT 块之后紧随的 STROKEFILL 用灰色刷铺满整个绘图区
    // 作为图表背景（test-000 等），LO 与 libemf2svg 都不画此 fill（实测：LO 输出无灰、
    // ref 输出仅露 4.1K 灰像素），仅描边才符合 Excel 实际显示。此处按此行为跳过 fill。
    const skipFill = (this._recSinceGdiC || 999) < 30 && this._isGrayFillStyle();
    if (skipFill) {
      console.log('  skip fill (GDI+ 后绘图区背景)');
    } else {
      this.ctx.fill();
    }
    this.ctx.stroke();
    this.pathState = 'idle';
  }

  // 当前 ctx.fillStyle 是否为纯灰色（R===G===B），用于识别绘图区背景 fill
  _isGrayFillStyle() {
    const s = this.ctx && this.ctx.fillStyle;
    if (!s || typeof s !== 'string') return false;
    if (s.startsWith('#') && s.length === 7) {
      const r = parseInt(s.slice(1, 3), 16);
      const g = parseInt(s.slice(3, 5), 16);
      const b = parseInt(s.slice(5, 7), 16);
      return r === g && g === b;
    }
    return false;
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
    //   EMR(8) + ihFont(DWORD) + LOGFONTW(直接跟随 ihFont)
    // LOGFONTW: lfHeight(0,LONG) lfWidth(4) lfEscapement(8) lfOrientation(12)
    //           lfWeight(16,LONG) lfItalic(20,BYTE) lfUnderline(21) lfStrikeOut(22) lfCharSet(23)
    //           lfFaceName(28, 32xUTF-16)
    const ihFont = this.readDwordFromData(data, 0);
    if ((ihFont & 0x80000000) !== 0) return;
    const lfOff = 4; // LOGFONTW 直接跟随 ihFont（data 内偏移 4）
    if (lfOff + 92 > data.length) return;

    const height = this.readLongFromData(data, lfOff);
    const width = this.readLongFromData(data, lfOff + 4);
    const escapement = this.readLongFromData(data, lfOff + 8);
    const orientation = this.readLongFromData(data, lfOff + 12);
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
    console.log('EMF ExtCreateFontIndirectW: ih=', ihFont, 'height:', height, 'width:', width, 'weight:', weight, 'face:', faceName, 'escapement:', escapement);
    this.gdiObjectManager.createObjectAt(ihFont, {
      type: 'font', height, width, weight, italic, underline, strikeOut, faceName, charset,
      escapement, orientation,
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
          // 文字渲染对齐参考实现：用「原始逻辑坐标 + 原始字号 + transform 矩阵」，
          // 缩放/平移/旋转统一由 SVG transform 承担（而非预乘进坐标与字号）。
          // 这样世界变换矩阵、window→viewport 缩放、lfEscapement 旋转都能正确作用于文字。
          const curFont = this.gdiObjectManager && this.gdiObjectManager.currentFont;
          const rawHeight = curFont && curFont.height ? Math.abs(curFont.height) : 12;
          const escapement = curFont && curFont.escapement ? curFont.escapement : 0; // 0.1°
          // 用原始字号覆盖 ctx.font（applyGdiObject 设置的是已乘 scale 的字号，matrix 模式下需还原）
          const savedFont = this.ctx.font;
          {
            const weight = (curFont && curFont.weight >= 700) ? 'bold ' : '';
            const italic = (curFont && curFont.italic) ? 'italic ' : '';
            const face = (curFont && curFont.faceName) ? curFont.faceName : 'sans-serif';
            this.ctx.font = `${italic}${weight}${rawHeight}px "${face}"`;
          }
          // 完整变换矩阵（world × viewport × device），叠加 lfEscapement 旋转（绕逻辑参考点）。
          let matrix = this.coordinateTransformer.getSvgMatrix();
          if (escapement !== 0) {
            // GDI lfEscapement：单位 0.1°，正值对应 SVG 顺时针（ref 输出 rotate(-escapement/10)）。
            const deg = -escapement / 10;
            const rad = deg * Math.PI / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            // 先绕逻辑参考点 (x, y) 旋转，再套 matrix（列向量约定：rot 先应用，故 R * M 顺序为 matrix 后乘）。
            // 旋转（绕原点，列向量）R = [cos -sin; sin cos]；绕 (px,py) = translate(px,py)·R·translate(-px,-py)。
            const px = x, py = y;
            // rotAround 矩阵（列向量）：x' = cos*(x-px) - sin*(y-py) + px
            const r = { a: cos, b: sin, c: -sin, d: cos, e: px - px * cos + py * sin, f: py - px * sin - py * cos };
            // 合成：先 rotAround（R），再 matrix（M）=> 最终 = M · R
            matrix = {
              a: matrix.a * r.a + matrix.c * r.b,
              b: matrix.b * r.a + matrix.d * r.b,
              c: matrix.a * r.c + matrix.c * r.d,
              d: matrix.b * r.c + matrix.d * r.d,
              e: matrix.a * r.e + matrix.c * r.f + matrix.e,
              f: matrix.b * r.e + matrix.d * r.f + matrix.f,
            };
          }
          this.ctx.fillText(text, x, y, matrix);
          this.ctx.font = savedFont;
          this.ctx.fillStyle = savedFillStyle;
          console.log('  Rendered text:', text.substring(0, 50));
        }
      } catch (error) {
        console.log('  Error reading text:', error.message);
      }
    }
  }

  // ---- 位图记录公共工具 ----
  // 五种 BLT 记录的位图数据按 offBmiSrc/offBitsSrc 精确定位。
  // 注意：这些偏移相对记录起始（含 8 字节 EMR 头），而 record.data 已剥离头部，
  // 因此 data 内偏移 = 文件声明值 - 8。

  // 解码 DIB（BITMAPINFOHEADER + 调色板 + 像素位）为 RGBA。
  // 支持 1/4/8/16/24/32bpp、BI_RGB 未压缩、BI_RLE8/BI_RLE4、top-down（biHeight<0）。
  _decodeDib(data, offBmi, cbBmi, offBits, cbBits, opts = {}) {
    try {
      const bmi = offBmi - 8;   // data 内偏移
      const bits = offBits - 8;
      if (bmi < 0 || bmi + 40 > data.length) return null;
      const biSize = this.readDwordFromData(data, bmi);
      const biWidth = this.readLongFromData(data, bmi + 4);
      const biHeightRaw = this.readLongFromData(data, bmi + 8);
      const biPlanes = data[bmi + 12] | (data[bmi + 13] << 8);
      const biBitCount = data[bmi + 14] | (data[bmi + 15] << 8);
      const biCompression = this.readDwordFromData(data, bmi + 16);
      const biClrUsed = this.readDwordFromData(data, bmi + 32);
      if (biPlanes !== 1 || biWidth <= 0 || biWidth > 20000 || Math.abs(biHeightRaw) > 20000) return null;
      const width = biWidth;
      const height = Math.abs(biHeightRaw);
      const topDown = biHeightRaw < 0;
      // 像素量保护：超出上限（1.5M 像素）的位图跳过，防内存/输出膨胀
      if (width * height > 1572864) return null;

      const palCount = biBitCount <= 8 ? (biClrUsed || (1 << biBitCount)) : 0;
      const palette = [];
      for (let i = 0; i < palCount; i++) {
        const o = bmi + biSize + i * 4;
        if (o + 4 > data.length) break;
        palette.push([data[o + 2], data[o + 1], data[o], 255]); // BGR -> RGB
      }

      const out = new Uint8ClampedArray(width * height * 4);
      const end = Math.min(data.length, bits + cbBits);
      const transparent = opts.transparentColor;
      const tr = transparent !== undefined ? (transparent & 0xFF) : -1;
      const tg = transparent !== undefined ? ((transparent >> 8) & 0xFF) : -1;
      const tb = transparent !== undefined ? ((transparent >> 16) & 0xFF) : -1;
      const useAlpha = !!opts.alphaFromPixels;
      const constantAlpha = opts.constantAlpha !== undefined ? opts.constantAlpha : 255;

      const putPx = (x, y, r, g, b, a) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        if (r === tr && g === tg && b === tb) a = 0; // 透明色键
        if (constantAlpha < 255) a = (a * constantAlpha) / 255;
        const o = (y * width + x) * 4;
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
      };

      if (biCompression === 0 || biCompression === 3) { // BI_RGB / BI_BITFIELDS
        const rowSize = Math.ceil((width * biBitCount) / 32) * 4;
        for (let y = 0; y < height; y++) {
          const srcY = topDown ? y : (height - 1 - y);
          const rowOff = bits + srcY * rowSize;
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 255;
            if (biBitCount === 1) {
              const o = rowOff + (x >> 3);
              if (o >= end) continue;
              const idx = (data[o] >> (7 - (x & 7))) & 1;
              const c = palette[idx] || [0, 0, 0, 255];
              r = c[0]; g = c[1]; b = c[2];
            } else if (biBitCount === 4) {
              const o = rowOff + (x >> 1);
              if (o >= end) continue;
              const idx = (x & 1) === 0 ? (data[o] >> 4) : (data[o] & 0x0F);
              const c = palette[idx] || [0, 0, 0, 255];
              r = c[0]; g = c[1]; b = c[2];
            } else if (biBitCount === 8) {
              const o = rowOff + x;
              if (o >= end) continue;
              const c = palette[data[o]] || [0, 0, 0, 255];
              r = c[0]; g = c[1]; b = c[2];
            } else if (biBitCount === 16) {
              const o = rowOff + x * 2;
              if (o + 2 > end) continue;
              const v = data[o] | (data[o + 1] << 8);
              r = ((v >> 10) & 0x1F) * 255 / 31;
              g = ((v >> 5) & 0x1F) * 255 / 31;
              b = (v & 0x1F) * 255 / 31;
            } else if (biBitCount === 24) {
              const o = rowOff + x * 3;
              if (o + 3 > end) continue;
              b = data[o]; g = data[o + 1]; r = data[o + 2];
            } else if (biBitCount === 32) {
              const o = rowOff + x * 4;
              if (o + 4 > end) continue;
              b = data[o]; g = data[o + 1]; r = data[o + 2];
              a = useAlpha ? data[o + 3] : 255; // BI_RGB 时 alpha 通道无意义，视为不透明
            }
            putPx(x, y, r, g, b, a);
          }
        }
      } else if (biCompression === 1 || biCompression === 2) { // BI_RLE8 / BI_RLE4
        let pos = bits;
        let x = 0, y = height - 1; // RLE 数据按 bottom-up 顺序，从图像底部行开始
        const horiz = biCompression === 2 ? 2 : 1; // 每像素字节数（RLE4 半字节，按字节推进再展开）
        while (pos + 2 <= end && y >= 0) {
          const b0 = data[pos], b1 = data[pos + 1];
          pos += 2;
          if (b0 > 0) { // 编码模式：b0 个 palette[b1] 像素
            for (let i = 0; i < b0; i++) {
              let r, g, b;
              if (biCompression === 1) {
                const c = palette[b1] || [0, 0, 0, 255];
                r = c[0]; g = c[1]; b = c[2];
              } else {
                const idx = (i & 1) === 0 ? (b1 >> 4) : (b1 & 0x0F);
                const c = palette[idx] || [0, 0, 0, 255];
                r = c[0]; g = c[1]; b = c[2];
              }
              putPx(x + i, y, r, g, b, 255);
            }
            x += b0;
          } else if (b1 === 0) { // 行结束
            x = 0; y--;
          } else if (b1 === 1) { // 位图结束
            break;
          } else if (b1 === 2) { // delta
            if (pos + 2 > end) break;
            x += data[pos]; y -= data[pos + 1];
            pos += 2;
          } else { // 绝对模式：b1 字节原始数据（字对齐）
            const nbytes = biCompression === 1 ? b1 : Math.ceil(b1 / 2);
            if (pos + nbytes > end) break;
            for (let i = 0; i < b1; i++) {
              let idx;
              if (biCompression === 1) idx = data[pos + i];
              else idx = (i & 1) === 0 ? (data[pos + (i >> 1)] >> 4) : (data[pos + (i >> 1)] & 0x0F);
              const c = palette[idx] || [0, 0, 0, 255];
              putPx(x + i, y, c[0], c[1], c[2], 255);
            }
            x += b1;
            pos += nbytes + ((nbytes & 1) ? 1 : 0); // 字对齐填充
          }
        }
      } else {
        return null; // BI_JPEG/BI_PNG 等暂不支持
      }

      return { width, height, data: out };
    } catch (e) {
      console.log('DIB decode failed:', e.message);
      return null;
    }
  }

  // 将解码后的 DIB 绘制到目标矩形（支持缩放）
  _drawDecodedDib(dib, destX, destY, destW, destH) {
    if (!dib || destW === 0 || destH === 0) return;
    const t1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
    const t2 = this.coordinateTransformer.transform(destX + Math.abs(destW), destY + Math.abs(destH), this.ctx.canvas.width, this.ctx.canvas.height);
    const x = Math.min(t1.x, t2.x);
    const y = Math.min(t1.y, t2.y);
    const w = Math.abs(t2.x - t1.x);
    const h = Math.abs(t2.y - t1.y);
    if (w <= 0 || h <= 0) return;

    // 镜像语义：目标宽/高为负时翻转源图
    if (destW < 0 || destH < 0) {
      const flipped = this.ctx.createImageData(dib.width, dib.height);
      for (let sy = 0; sy < dib.height; sy++) {
        for (let sx = 0; sx < dib.width; sx++) {
          const dx2 = destW < 0 ? dib.width - 1 - sx : sx;
          const dy2 = destH < 0 ? dib.height - 1 - sy : sy;
          for (let k = 0; k < 4; k++) {
            flipped.data[(dy2 * dib.width + dx2) * 4 + k] = dib.data[(sy * dib.width + sx) * 4 + k];
          }
        }
      }
      dib = flipped;
    }

    // 浏览器/真实 canvas：临时 canvas + drawImage；SvgContext：putImageData（SVG image 天然缩放）
    const canvasCtor = (typeof document === 'undefined' && this.ctx.canvas)
      ? this.ctx.canvas.constructor
      : null;
    const isRealCanvasCtor = typeof canvasCtor === 'function' && canvasCtor.name !== 'Object';
    const tempCanvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : (isRealCanvasCtor ? new canvasCtor(dib.width, dib.height) : null);

    if (tempCanvas) {
      tempCanvas.width = dib.width;
      tempCanvas.height = dib.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(this._wrapImageData(dib), 0, 0);
      this.ctx.drawImage(tempCanvas, x, y, w, h);
    } else {
      this.ctx.putImageData(this._wrapImageData(dib), x, y, w, h);
    }
    console.log('  DIB drawn at:', x, y, w, h, '(source', dib.width, 'x', dib.height + ')');
  }

  _wrapImageData(dib) {
    // 保证对象满足 ImageData 接口（ctx.putImageData 兼容）
    if (typeof ImageData !== 'undefined') {
      try { return new ImageData(dib.data, dib.width, dib.height); } catch (e) { /* fallthrough */ }
    }
    return { width: dib.width, height: dib.height, data: dib.data };
  }

  processEmfBitBlt(data) {
    // EMR_BITBLT (MS-EMF 2.3.1.1)，data 内偏移（已剥离 8 字节记录头）：
    // Bounds(0..15) xDest(16) yDest(20) cxDest(24) cyDest(28) dwRop(32) xSrc(36) ySrc(40)
    // XformSrc(44..67) BkColorSrc(68) UsageSrc(72) offBmiSrc(76) cbBmiSrc(80)
    // offBitsSrc(84) cbBitsSrc(88)
    if (data.length < 92) return;
    const xDest = this.readLongFromData(data, 16);
    const yDest = this.readLongFromData(data, 20);
    const cxDest = this.readLongFromData(data, 24);
    const cyDest = this.readLongFromData(data, 28);
    const dwRop = this.readDwordFromData(data, 32);
    const offBmi = this.readDwordFromData(data, 76);
    const cbBmi = this.readDwordFromData(data, 80);
    const offBits = this.readDwordFromData(data, 84);
    const cbBits = this.readDwordFromData(data, 88);
    console.log('EMF BitBlt: dest=(', xDest, yDest, ')', cxDest, 'x', cyDest, 'rop=0x' + dwRop.toString(16));

    if (dwRop === 0x00000042) { // BLACKNESS
      this._fillBltRect(xDest, yDest, cxDest, cyDest, '#000000'); return;
    }
    if (dwRop === 0x00FF0062) { // WHITENESS
      this._fillBltRect(xDest, yDest, cxDest, cyDest, '#ffffff'); return;
    }
    // 无 DIB 或解码失败：不绘制（避免灰色占位块覆盖后续内容）
    const dib = (offBmi && cbBmi) ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
    if (dib) {
      this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
    }
  }

  processEmfStretchBlt(data) {
    // EMR_STRETCHBLT (MS-EMF 2.3.1.6)，data 内偏移：
    // Bounds(0..15) xDest(16) yDest(20) cxDest(24) cyDest(28) dwRop(32) xSrc(36) ySrc(40)
    // XformSrc(44..67) BkColorSrc(68) UsageSrc(72) offBmiSrc(76) cbBmiSrc(80)
    // offBitsSrc(84) cbBitsSrc(88) cxSrc(92) cySrc(96)
    if (data.length < 100) return;
    const xDest = this.readLongFromData(data, 16);
    const yDest = this.readLongFromData(data, 20);
    const cxDest = this.readLongFromData(data, 24);
    const cyDest = this.readLongFromData(data, 28);
    const dwRop = this.readDwordFromData(data, 32);
    const xSrc = this.readLongFromData(data, 36);
    const ySrc = this.readLongFromData(data, 40);
    const offBmi = this.readDwordFromData(data, 76);
    const cbBmi = this.readDwordFromData(data, 80);
    const offBits = this.readDwordFromData(data, 84);
    const cbBits = this.readDwordFromData(data, 88);
    const cxSrc = this.readLongFromData(data, 92);
    const cySrc = this.readLongFromData(data, 96);
    console.log('EMF StretchBlt: dest=(', xDest, yDest, ')', cxDest, 'x', cyDest, 'src=(', xSrc, ySrc, ')', cxSrc, 'x', cySrc);

    if (dwRop === 0x00000042) { this._fillBltRect(xDest, yDest, cxDest, cyDest, '#000000'); return; }
    if (dwRop === 0x00FF0062) { this._fillBltRect(xDest, yDest, cxDest, cyDest, '#ffffff'); return; }
    const dib = (offBmi && cbBmi) ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
    if (dib) {
      // 源矩形裁剪：按 cxSrc/cySrc 与源偏移取子图（简化：整图贴到目标大小）
      this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
    }
  }

  processEmfStretchDibBits(data) {
    // EMR_STRETCHDIBITS (MS-EMF 2.3.1.8)，data 内偏移：
    // Bounds(0..15) xDest(16) yDest(20) xSrc(24) ySrc(28) cxSrc(32) cySrc(36)
    // offBmiSrc(40) cbBmiSrc(44) offBitsSrc(48) cbBitsSrc(52) iUsageSrc(56) dwRop(60)
    // cxDest(64) cyDest(68)
    if (data.length < 72) return;
    const xDest = this.readLongFromData(data, 16);
    const yDest = this.readLongFromData(data, 20);
    const xSrc = this.readLongFromData(data, 24);
    const ySrc = this.readLongFromData(data, 28);
    const cxSrc = this.readDwordFromData(data, 32);
    const cySrc = this.readDwordFromData(data, 36);
    const offBmi = this.readDwordFromData(data, 40);
    const cbBmi = this.readDwordFromData(data, 44);
    const offBits = this.readDwordFromData(data, 48);
    const cbBits = this.readDwordFromData(data, 52);
    const dwRop = this.readDwordFromData(data, 60);
    let cxDest = this.readLongFromData(data, 64);
    let cyDest = this.readLongFromData(data, 68);
    // cxDest/cyDest 为符号扩展的源尺寸（MS-EMF 2.2.9：负值表示翻转）
    if (cxDest === 0 && cxSrc) cxDest = cxSrc;
    if (cyDest === 0 && cySrc) cyDest = cySrc;
    console.log('EMF StretchDIBits: dest=(', xDest, yDest, ')', cxDest, 'x', cyDest, 'src=(', xSrc, ySrc, ')', cxSrc, 'x', cySrc);

    if (dwRop === 0x00000042) { this._fillBltRect(xDest, yDest, cxDest, cyDest, '#000000'); return; }
    if (dwRop === 0x00FF0062) { this._fillBltRect(xDest, yDest, cxDest, cyDest, '#ffffff'); return; }
    const dib = (offBmi && cbBmi) ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
    if (dib) {
      // 源矩形子图裁剪（cxSrc/cySrc 可能小于整图）
      let use = dib;
      if ((cxSrc > 0 && cxSrc < dib.width) || (cySrc > 0 && cySrc < dib.height)) {
        const sw = cxSrc > 0 ? cxSrc : dib.width;
        const sh = cySrc > 0 ? cySrc : dib.height;
        const sub = this.ctx.createImageData(sw, sh);
        for (let yy = 0; yy < sh; yy++) {
          for (let xx = 0; xx < sw; xx++) {
            const sx = xSrc + xx, sy = ySrc + yy;
            if (sx < 0 || sx >= dib.width || sy < 0 || sy >= dib.height) continue;
            for (let k = 0; k < 4; k++) {
              sub.data[(yy * sw + xx) * 4 + k] = dib.data[(sy * dib.width + sx) * 4 + k];
            }
          }
        }
        use = { width: sw, height: sh, data: sub.data };
      }
      this._drawDecodedDib(use, xDest, yDest, cxDest, cyDest);
    }
  }

  processEmfAlphaBlend(data) {
    // EMR_ALPHABLEND (MS-EMF 2.3.1.2)，data 内偏移：
    // Bounds(0..15) xDest(16) yDest(20) cxDest(24) cyDest(28) BLENDFUNCTION(32)
    // xSrc(36) ySrc(40) XformSrc(44..67) BkColorSrc(68) UsageSrc(72)
    // offBmiSrc(76) cbBmiSrc(80) offBitsSrc(84) cbBitsSrc(88)
    if (data.length < 92) return;
    const xDest = this.readLongFromData(data, 16);
    const yDest = this.readLongFromData(data, 20);
    const cxDest = this.readLongFromData(data, 24);
    const cyDest = this.readLongFromData(data, 28);
    const blendFn = this.readDwordFromData(data, 32);
    const offBmi = this.readDwordFromData(data, 76);
    const cbBmi = this.readDwordFromData(data, 80);
    const offBits = this.readDwordFromData(data, 84);
    const cbBits = this.readDwordFromData(data, 88);
    const alphaFormat = blendFn & 0xFF;                 // 1 = AC_SRC_ALPHA
    const constantAlpha = (blendFn >>> 16) & 0xFF;      // SourceConstantAlpha
    console.log('EMF AlphaBlend: dest=(', xDest, yDest, ')', cxDest, 'x', cyDest, 'alphaFmt=', alphaFormat, 'constA=', constantAlpha);

    const dib = (offBmi && cbBmi) ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits,
      { alphaFromPixels: alphaFormat === 1, constantAlpha }) : null;
    if (dib) {
      this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
    }
  }

  processEmfTransparentBlt(data) {
    // EMR_TRANSPARENTBLT (MS-EMF 2.3.1.11)，data 内偏移：
    // Bounds(0..15) xDest(16) yDest(20) cxDest(24) cyDest(28) TransparentColor(32)
    // xSrc(36) ySrc(40) XformSrc(44..67) BkColorSrc(68) UsageSrc(72)
    // offBmiSrc(76) cbBmiSrc(80) offBitsSrc(84) cbBitsSrc(88) cxSrc(92) cySrc(96)
    if (data.length < 100) return;
    const xDest = this.readLongFromData(data, 16);
    const yDest = this.readLongFromData(data, 20);
    const cxDest = this.readLongFromData(data, 24);
    const cyDest = this.readLongFromData(data, 28);
    const transparentColor = this.readDwordFromData(data, 32);
    const offBmi = this.readDwordFromData(data, 76);
    const cbBmi = this.readDwordFromData(data, 80);
    const offBits = this.readDwordFromData(data, 84);
    const cbBits = this.readDwordFromData(data, 88);
    console.log('EMF TransparentBlt: dest=(', xDest, yDest, ')', cxDest, 'x', cyDest, 'colorKey=0x' + transparentColor.toString(16));

    const dib = (offBmi && cbBmi) ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits,
      { transparentColor }) : null;
    if (dib) {
      this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
    }
  }

  // BLT 无位图时的纯色填充（BLACKNESS/WHITENESS 或占位）
  _fillBltRect(x, y, w, h, color) {
    const t1 = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
    const t2 = this.coordinateTransformer.transform(x + Math.abs(w), y + Math.abs(h), this.ctx.canvas.width, this.ctx.canvas.height);
    const rx = Math.min(t1.x, t2.x), ry = Math.min(t1.y, t2.y);
    const rw = Math.abs(t2.x - t1.x), rh = Math.abs(t2.y - t1.y);
    if (rw <= 0 || rh <= 0) return;
    const saved = this.ctx.fillStyle;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(rx, ry, rw, rh);
    this.ctx.fillStyle = saved;
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
      currentPos: { x: this.currentPos.x, y: this.currentPos.y },
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
      worldM11: ct.worldM11, worldM12: ct.worldM12,
      worldM21: ct.worldM21, worldM22: ct.worldM22,
      worldDx: ct.worldDx, worldDy: ct.worldDy,
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
    if (state.currentPos) this.currentPos = { x: state.currentPos.x, y: state.currentPos.y };
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
    ct.worldM11 = state.worldM11; ct.worldM12 = state.worldM12;
    ct.worldM21 = state.worldM21; ct.worldM22 = state.worldM22;
    ct.worldDx = state.worldDx; ct.worldDy = state.worldDy;
  }

  // 读取 XFORM（MS-EMF 2.2.13，6 个 4 字节浮点：eM11 eM12 eM21 eM22 eDx eDy）
  _readXForm(data, off) {
    if (!data || off + 24 > data.length) return null;
    return {
      eM11: this.readFloatFromData(data, off),
      eM12: this.readFloatFromData(data, off + 4),
      eM21: this.readFloatFromData(data, off + 8),
      eM22: this.readFloatFromData(data, off + 12),
      eDx: this.readFloatFromData(data, off + 16),
      eDy: this.readFloatFromData(data, off + 20)
    };
  }

  readFloatFromData(data, offset) {
    if (offset + 4 > data.length) return 0;
    const b = data;
    const v = (b[offset] | (b[offset + 1] << 8) | (b[offset + 2] << 16) | (b[offset + 3] << 24)) >>> 0;
    // IEEE-754 单精度解析
    const sign = (v & 0x80000000) ? -1 : 1;
    const exp = (v >>> 23) & 0xFF;
    const frac = v & 0x7FFFFF;
    if (exp === 255) return frac ? NaN : sign * Infinity;
    if (exp === 0) return frac === 0 ? sign * 0 : sign * frac * Math.pow(2, -149);
    return sign * (1 + frac / 0x800000) * Math.pow(2, exp - 127);
  }

  processEmfSetWorldTransform(data) {
    // EMR_SETWORLDTRANSFORM (MS-EMF 2.3.3.20)：XForm(24B)
    if (data.length < 24) return;
    const xf = this._readXForm(data, 0);
    if (!xf) return;
    console.log('EMF SetWorldTransform:', xf);
    this.coordinateTransformer.setWorldTransform(xf);
  }

  processEmfModifyWorldTransform(data) {
    // EMR_MODIFYWORLDTRANSFORM (MS-EMF 2.3.3.14)：XForm(24B) + iMode(4B)
    if (data.length < 28) return;
    const xf = this._readXForm(data, 0);
    if (!xf) return;
    const mode = this.readDwordFromData(data, 24);
    console.log('EMF ModifyWorldTransform mode:', mode, xf);
    this.coordinateTransformer.modifyWorldTransform(xf, mode);
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
    this.ctx.fill();  // GDI ROUNDRECT = 当前画刷填充 + 画笔描边
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

  // EMR_CREATEDIBPATTERNBRUSHPT (0x5E, MS-EMF 2.3.5.4)：
  //   EMR(8) | ihBrush(4) | iUsage(4) | offBmi(4) | cbBmi(4) | offBits(4) | cbBits(4) | <DIB>
  // 解析 DIB 为 RGBA 位图并注册为 SVG <pattern>，使 poly fill 走 pattern 填充（对齐参考）。
  processEmfCreateDibPatternBrushPT(data) {
    if (data.length < 24) return;
    const ihBrush = this.readDwordFromData(data, 0);
    if ((ihBrush & 0x80000000) !== 0) return;
    const iUsage = this.readDwordFromData(data, 4);
    const offBmi = this.readDwordFromData(data, 8);
    const cbBmi = this.readDwordFromData(data, 12);
    const offBits = this.readDwordFromData(data, 16);
    const cbBits = this.readDwordFromData(data, 20);
    if (!offBmi || !cbBmi || !offBits || !cbBits) return;
    // DIB 调色板颜色转换：iUsage=0 (RGB) 由 _decodeDib 内部直接读 0x00BBGGRR
    // iUsage=1 (PAL_COLORS) 调色板是 16-bit 索引到逻辑调色板
    // iUsage=2 (PAL_INDICES) 同 16-bit 索引
    const dib = this._decodeDib(data, offBmi, cbBmi, offBits, cbBits, { iUsage });
    if (!dib) {
      console.log('EMF CreateDibPatternBrushPT: DIB decode failed');
      return;
    }
    const url = this.ctx.addPattern(dib, { orgX: 0, orgY: 0 });
    if (!url) return;
    this.gdiObjectManager.createObjectAt(ihBrush, { type: 'pattern', url, width: dib.width, height: Math.abs(dib.height) });
    console.log('EMF CreateDibPatternBrushPT: ih=', ihBrush, 'size=', dib.width, 'x', dib.height);
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
}

module.exports = EmfDrawer;