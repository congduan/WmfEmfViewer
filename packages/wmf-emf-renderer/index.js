"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/utils/fileTypeDetector.js
var require_fileTypeDetector = __commonJS({
  "src/utils/fileTypeDetector.js"(exports2, module2) {
    "use strict";
    var FileTypeDetector2 = class {
      /**
       * @param {Uint8Array|ArrayBuffer|number[]} data 元文件二进制数据
       */
      constructor(data) {
        this.data = new Uint8Array(data);
      }
      /**
       * 按签名检测文件格式。
       * - Placeable WMF: 头 4 字节 D7 CD C6 9A
       * - 标准 WMF: 头 DWORD 为 0x00090001 / 0x00090000
       * - EMF/EMF+: 头 offset 40 处 dSignature 为 0x464D4520 (" EMF")，
       *   并通过扫描 EMR_COMMENT 判别 EMF+
       * @returns {MetafileType}
       */
      detect() {
        if (this.data.length < 4) return "unknown";
        if (this.data[0] === 215 && this.data[1] === 205 && this.data[2] === 198 && this.data[3] === 154) {
          return "placeable-wmf";
        }
        const signature = this.readDwordAt(0);
        if (signature === 589825 || signature === 589824) {
          return "wmf";
        }
        if (this.data.length >= 88) {
          const dSignature = this.readDwordAt(40);
          if (dSignature === 1179469088) {
            return "emf";
          }
        }
        return "unknown";
      }
      /**
       * 检查是否为 EMF+ 文件：扫描 EMR_GDICOMMENT (0x46) 记录。
       * [MS-EMF] 2.3.4.7 布局：记录头(8) + DataSize(4) + CommentIdentifier(4) + 数据，
       * CommentIdentifier = 0x2B464D45 ("EMF+") 时携带 EMF+ 记录流。
       * 兼容无 DataSize 的变体（CommentIdentifier 紧跟记录头）。
       * @returns {boolean}
       */
      isEmfPlusFile() {
        try {
          if (this.data.length < 88) return false;
          const headerSize = this.readDwordAt(4);
          let offset = headerSize;
          while (offset + 12 <= this.data.length) {
            const type = this.readDwordAt(offset);
            const size = this.readDwordAt(offset + 4);
            if (size < 8 || offset + size > this.data.length) break;
            if (type === 70 && size >= 12) {
              if (size >= 16 && this.readDwordAt(offset + 12) === 726027589) {
                return true;
              }
              if (this.readDwordAt(offset + 8) === 726027589) {
                return true;
              }
            }
            if (type === 14) break;
            offset += size;
          }
          return false;
        } catch (error) {
          return false;
        }
      }
      /**
       * 从指定偏移读取 4 字节小端无符号整数（DWORD）。
       * @param {number} offset
       * @returns {number}
       */
      readDwordAt(offset) {
        if (offset + 4 > this.data.length) {
          return 0;
        }
        const value = this.data[offset] & 255 | (this.data[offset + 1] & 255) << 8 | (this.data[offset + 2] & 255) << 16 | (this.data[offset + 3] & 255) << 24;
        return value >>> 0;
      }
    };
    module2.exports = FileTypeDetector2;
  }
});

// src/utils/coordinateTransformer.js
var require_coordinateTransformer = __commonJS({
  "src/utils/coordinateTransformer.js"(exports2, module2) {
    "use strict";
    var MAP_MODE = {
      /** 逻辑单位 = 设备像素（默认） */
      MM_TEXT: 1,
      /** 0.1mm */
      MM_LOMETRIC: 2,
      /** 0.01mm */
      MM_HIMETRIC: 3,
      /** 0.01in */
      MM_LOENGLISH: 4,
      /** 0.001in */
      MM_HIENGLISH: 5,
      /** 1/1440in */
      MM_TWIPS: 6,
      /** 等比（各向同性），比例由 window/viewport 决定 */
      MM_ISOTROPIC: 7,
      /** 非等比（各向异性），比例由 window/viewport 决定 */
      MM_ANISOTROPIC: 8
    };
    var CoordinateTransformer2 = class {
      constructor() {
        this.mapMode = MAP_MODE.MM_TEXT;
        this.windowOrgX = 0;
        this.windowOrgY = 0;
        this.windowExtX = 800;
        this.windowExtY = 600;
        this.viewportOrgX = 0;
        this.viewportOrgY = 0;
        this.viewportExtX = 800;
        this.viewportExtY = 600;
        this.pxPerMm = 96 / 25.4;
        this.worldM11 = 1;
        this.worldM12 = 0;
        this.worldM21 = 0;
        this.worldM22 = 1;
        this.worldDx = 0;
        this.worldDy = 0;
        this.deviceOrgX = 0;
        this.deviceOrgY = 0;
      }
      /** @param {number} x @param {number} y 设置 device→canvas 平移 */
      setDeviceOrg(x, y) {
        this.deviceOrgX = x || 0;
        this.deviceOrgY = y || 0;
      }
      /** 设置世界变换（MWT_SET / EMR_SETWORLDTRANSFORM） */
      /** @param {Xform} xform */
      setWorldTransform(xform) {
        if (!xform) return;
        this.worldM11 = xform.eM11;
        this.worldM12 = xform.eM12;
        this.worldM21 = xform.eM21;
        this.worldM22 = xform.eM22;
        this.worldDx = xform.eDx;
        this.worldDy = xform.eDy;
      }
      /**
       * 修改世界变换。mode（[MS-EMF] 2.1.25）：
       * 1=MWT_IDENTITY, 2=MWT_LEFTMULTIPLY(新*旧), 3=MWT_RIGHTMULTIPLY(旧*新), 4=MWT_SET
       * @param {Xform} xform
       * @param {number} mode
       */
      modifyWorldTransform(xform, mode) {
        if (!xform) return;
        const m = {
          a11: this.worldM11,
          a12: this.worldM12,
          a21: this.worldM21,
          a22: this.worldM22,
          dx: this.worldDx,
          dy: this.worldDy
        };
        const b = {
          a11: xform.eM11,
          a12: xform.eM12,
          a21: xform.eM21,
          a22: xform.eM22,
          dx: xform.eDx,
          dy: xform.eDy
        };
        let r;
        switch (mode) {
          case 1:
            r = { a11: 1, a12: 0, a21: 0, a22: 1, dx: 0, dy: 0 };
            break;
          case 2:
            r = this._mul(b, m);
            break;
          case 4:
            r = b;
            break;
          case 3:
          // MWT_RIGHTMULTIPLY：先应用当前（旧），再应用传入（新）
          default:
            r = this._mul(m, b);
            break;
        }
        this.worldM11 = r.a11;
        this.worldM12 = r.a12;
        this.worldM21 = r.a21;
        this.worldM22 = r.a22;
        this.worldDx = r.dx;
        this.worldDy = r.dy;
      }
      // 行向量约定下 3x3 矩阵乘法：C = A * B（点先经 A 再经 B）
      /** @param {MulMatrix} a @param {MulMatrix} b @returns {MulMatrix} */
      _mul(a, b) {
        return {
          a11: a.a11 * b.a11 + a.a12 * b.a21,
          a12: a.a11 * b.a12 + a.a12 * b.a22,
          a21: a.a21 * b.a11 + a.a22 * b.a21,
          a22: a.a21 * b.a12 + a.a22 * b.a22,
          dx: a.dx * b.a11 + a.dy * b.a21 + b.dx,
          dy: a.dx * b.a12 + a.dy * b.a22 + b.dy
        };
      }
      /** @param {number} x @param {number} y @returns {Point} */
      _applyWorld(x, y) {
        return {
          x: x * this.worldM11 + y * this.worldM21 + this.worldDx,
          y: x * this.worldM12 + y * this.worldM22 + this.worldDy
        };
      }
      /**
       * 获取当前视口/窗口缩放比例。
       * @returns {Point}
       */
      getScale() {
        if (this.windowExtX !== 0 && this.windowExtY !== 0) {
          return {
            x: this.viewportExtX / this.windowExtX,
            y: this.viewportExtY / this.windowExtY
          };
        }
        return { x: 1, y: 1 };
      }
      /**
       * 逻辑坐标 -> 设备坐标。
       * 公式: 设备坐标 = (逻辑坐标 - windowOrg) * (viewportExt / windowExt) + viewportOrg
       * @param {number} x
       * @param {number} y
       * @param {number} [canvasWidth] 预留参数（兼容旧调用签名，未参与计算）
       * @param {number} [canvasHeight] 预留参数（兼容旧调用签名，未参与计算）
       * @returns {Point}
       */
      transform(x, y, canvasWidth, canvasHeight) {
        if (this.worldM11 !== 1 || this.worldM12 !== 0 || this.worldM21 !== 0 || this.worldM22 !== 1 || this.worldDx !== 0 || this.worldDy !== 0) {
          const w = this._applyWorld(x, y);
          x = w.x;
          y = w.y;
        }
        let cx = x - this.windowOrgX;
        let cy = y - this.windowOrgY;
        const vp = this._getViewportScale();
        cx = cx * vp.sx + this.viewportOrgX;
        cy = cy * vp.sy + this.viewportOrgY;
        return { x: cx - this.deviceOrgX, y: cy - this.deviceOrgY };
      }
      /**
       * 计算 window→viewport 的缩放因子（sx/sy）。
       * MM_TEXT/ISOTROPIC/ANISOTROPIC 用 viewportExt/windowExt 比值；
       * 固定比例模式（LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS）用 pxPerMm 换算，
       * 且 Y 轴在固定比例模式下向上（负缩放，GDI 语义）。
       * @returns {{sx: number, sy: number}}
       */
      _getViewportScale() {
        switch (this.mapMode) {
          case MAP_MODE.MM_TEXT:
          case MAP_MODE.MM_ISOTROPIC:
          case MAP_MODE.MM_ANISOTROPIC:
            if (this.windowExtX !== 0 && this.windowExtY !== 0) {
              return {
                sx: this.viewportExtX / this.windowExtX,
                sy: this.viewportExtY / this.windowExtY
              };
            }
            return { sx: 1, sy: 1 };
          case MAP_MODE.MM_LOMETRIC: {
            const f = this.pxPerMm * 0.1;
            return { sx: f, sy: -f };
          }
          case MAP_MODE.MM_HIMETRIC: {
            const f = this.pxPerMm * 0.01;
            return { sx: f, sy: -f };
          }
          case MAP_MODE.MM_LOENGLISH: {
            const f = this.pxPerMm * 25.4 * 0.01;
            return { sx: f, sy: -f };
          }
          case MAP_MODE.MM_HIENGLISH: {
            const f = this.pxPerMm * 25.4 * 1e-3;
            return { sx: f, sy: -f };
          }
          case MAP_MODE.MM_TWIPS: {
            const f = this.pxPerMm * 25.4 / 1440;
            return { sx: f, sy: -f };
          }
          default:
            if (this.windowExtX !== 0 && this.windowExtY !== 0) {
              return {
                sx: this.viewportExtX / this.windowExtX,
                sy: this.viewportExtY / this.windowExtY
              };
            }
            return { sx: 1, sy: 1 };
        }
      }
      /**
       * 返回把“逻辑坐标 → 设备坐标（canvas）”的完整仿射变换，按 SVG `matrix(a b c d e f)`
       * 列向量约定输出（x' = a*x + c*y + e, y' = b*x + d*y + f）。
       * 合成顺序：先世界变换（world，行向量 [x y 1]·M），再 window→viewport 缩放/平移，
       * 最后减 deviceOrg（把 header rclBounds 原点平移到画布原点）。
       * 供文字渲染等需要“原始逻辑坐标 + 原始字号 + transform 矩阵”对齐参考实现的场景使用。
       * @returns {{a:number,b:number,c:number,d:number,e:number,f:number}}
       */
      getSvgMatrix() {
        const vp = this._getViewportScale();
        const sx = vp.sx, sy = vp.sy;
        const a = this.worldM11 * sx;
        const b = this.worldM12 * sy;
        const c = this.worldM21 * sx;
        const d = this.worldM22 * sy;
        const e = this.worldDx * sx + this.viewportOrgX - this.deviceOrgX - this.windowOrgX * sx;
        const f = this.worldDy * sy + this.viewportOrgY - this.deviceOrgY - this.windowOrgY * sy;
        return { a, b, c, d, e, f };
      }
      /** @param {number} mode */
      setMapMode(mode) {
        this.mapMode = mode;
      }
      /**
       * 设置每毫米的设备像素数（来自 EMF header.szlDevice.cx / szlMillimeters.cx）。
       * 仅影响 MM_LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS 固定比例模式。
       * @param {number} px
       */
      setPxPerMm(px) {
        if (px && px > 0) this.pxPerMm = px;
      }
      /** @param {number} x @param {number} y */
      setWindowOrg(x, y) {
        this.windowOrgX = x;
        this.windowOrgY = y;
      }
      /** @param {number} x @param {number} y */
      setWindowExt(x, y) {
        this.windowExtX = x;
        this.windowExtY = y;
      }
      /** @param {number} x @param {number} y */
      setViewportOrg(x, y) {
        this.viewportOrgX = x;
        this.viewportOrgY = y;
      }
      /** @param {number} x @param {number} y */
      setViewportExt(x, y) {
        this.viewportExtX = x;
        this.viewportExtY = y;
      }
    };
    module2.exports = CoordinateTransformer2;
  }
});

// src/utils/mathTypeMtefParser.js
var require_mathTypeMtefParser = __commonJS({
  "src/utils/mathTypeMtefParser.js"(exports2, module2) {
    "use strict";
    var MTEF_END = 0;
    var MTEF_LINE = 1;
    var MTEF_CHAR = 2;
    var MTEF_TMPL = 3;
    var MTEF_PILE = 4;
    var MTEF_MATRIX = 5;
    var MTEF_EMBELL = 6;
    var MTEF_RULER = 7;
    var MTEF_FONT_STYLE_DEF = 8;
    var MTEF_SIZE = 9;
    var MTEF_FULL = 10;
    var MTEF_SUB = 11;
    var MTEF_SUB2 = 12;
    var MTEF_SYM = 13;
    var MTEF_SUBSYM = 14;
    var MTEF_COLOR = 15;
    var MTEF_COLOR_DEF = 16;
    var MTEF_FONT_DEF = 17;
    var MTEF_EQN_PREFS = 18;
    var MTEF_ENCODING_DEF = 19;
    var OPT_NUDGE = 8;
    var OPT_CHAR_ENC_CHAR8 = 4;
    var OPT_CHAR_ENC_CHAR16 = 16;
    var OPT_CHAR_ENC_NO_MTCODE = 32;
    var OPT_LINE_NULL = 1;
    var OPT_LP_RULER = 2;
    var OPT_LINE_LSPACE = 4;
    var FN_LCGREEK = 4;
    var FN_UCGREEK = 5;
    var FN_SYMBOL = 6;
    var FN_MTEXTRA = 11;
    var MathTypeMtefParser2 = class {
      constructor(data) {
        this.data = new Uint8Array(data);
        this.offset = 0;
        this.charStream = [];
      }
      parse() {
        if (this.data.length === 0) {
          return { chars: [] };
        }
        try {
          this.readByte();
          this.readByte();
          this.readByte();
          this.readByte();
          this.readByte();
          this.readNullTerminatedString();
          this.readByte();
          this.parseObjectList();
        } catch (error) {
        }
        return { chars: this.charStream };
      }
      parseObjectList() {
        while (this.offset < this.data.length) {
          const type = this.readByte();
          switch (type) {
            case MTEF_END:
              return;
            // 子对象列表结束
            case MTEF_LINE: {
              const options = this.readByte();
              this.skipNudgeIfNeeded(options);
              if (options & OPT_LINE_LSPACE) this.readByte();
              if (options & OPT_LP_RULER) this.parseRuler();
              if (!(options & OPT_LINE_NULL)) this.parseObjectList();
              break;
            }
            case MTEF_CHAR:
              this.parseChar();
              break;
            case MTEF_TMPL: {
              const options = this.readByte();
              this.skipNudgeIfNeeded(options);
              this.readByte();
              this.readVariation();
              this.readByte();
              this.parseObjectList();
              break;
            }
            case MTEF_PILE: {
              const options = this.readByte();
              this.skipNudgeIfNeeded(options);
              this.readByte();
              this.readByte();
              if (options & OPT_LP_RULER) this.parseRuler();
              this.parseObjectList();
              break;
            }
            case MTEF_MATRIX: {
              const options = this.readByte();
              this.skipNudgeIfNeeded(options);
              this.readByte();
              this.readByte();
              this.readByte();
              this.readByte();
              this.readByte();
              this.parseObjectList();
              break;
            }
            case MTEF_EMBELL: {
              const options = this.readByte();
              this.skipNudgeIfNeeded(options);
              this.readByte();
              break;
            }
            case MTEF_RULER:
              this.parseRuler();
              break;
            case MTEF_FONT_STYLE_DEF:
            case MTEF_FONT_DEF:
              this.readByte();
              this.readNullTerminatedString();
              break;
            case MTEF_SIZE:
              this.readByte();
              this.readByte();
              break;
            case MTEF_FULL:
            case MTEF_SUB:
            case MTEF_SUB2:
            case MTEF_SYM:
            case MTEF_SUBSYM:
              break;
            case MTEF_COLOR:
              this.readByte();
              break;
            case MTEF_COLOR_DEF: {
              const options = this.readByte();
              const n = options & 1 ? 4 : 3;
              for (let i = 0; i < n; i++) this.readByte();
              if (options & 4) this.readNullTerminatedString();
              break;
            }
            case MTEF_EQN_PREFS:
              this.skipEqnPrefs();
              break;
            case MTEF_ENCODING_DEF:
              this.readNullTerminatedString();
              break;
            default:
              if (type >= 100) {
                this.skipBytes(this.readByte());
              } else {
                return;
              }
          }
        }
      }
      parseChar() {
        const options = this.readByte();
        this.skipNudgeIfNeeded(options);
        const typeface = this.readByte();
        let charValue = 0;
        if (!(options & OPT_CHAR_ENC_NO_MTCODE)) {
          charValue = this.readByte();
        }
        if (options & OPT_CHAR_ENC_CHAR8) {
          charValue = this.readByte();
        }
        if (options & OPT_CHAR_ENC_CHAR16) {
          charValue = this.readWord();
        }
        let fontKind = "text";
        if (typeface === FN_SYMBOL || typeface === FN_LCGREEK || typeface === FN_UCGREEK) {
          fontKind = "symbol";
        } else if (typeface === FN_MTEXTRA) {
          fontKind = "mtextra";
        }
        this.charStream.push({ char: String.fromCharCode(charValue & 255), fontKind });
      }
      // variation：首字节高位为 1 时占 2 字节
      readVariation() {
        const b = this.readByte();
        if (b & 128) {
          this.readByte();
        }
      }
      skipNudgeIfNeeded(options) {
        if (!(options & OPT_NUDGE)) return;
        const dx = this.readByte();
        const dy = this.readByte();
        if (dx === 128 || dy === 128) {
          this.readWord();
          this.readWord();
        }
      }
      parseRuler() {
        const nStops = this.readByte();
        for (let i = 0; i < nStops; i++) {
          this.readByte();
          this.readWord();
        }
      }
      // 跳过 EQN_PREFS（mtef-go readEqnPrefs）：
      // options + sizes(count + dimension array) + spaces(count + dimension array) + styles(count)
      skipEqnPrefs() {
        this.readByte();
        const sizes = this.readByte();
        this.readDimensionArray(sizes);
        const spaces = this.readByte();
        this.readDimensionArray(spaces);
        const styles = this.readByte();
        for (let i = 0; i < styles; i++) {
          const c = this.readByte();
          if (c !== 0) this.readByte();
        }
      }
      // 维度数组：以 nibble 0x0F 作为数组项结束标记，直到 count 项
      readDimensionArray(count) {
        let items = 0;
        while (items < count) {
          const ch = this.readByte();
          if ((ch & 15) === 15) items++;
          if ((ch & 240) === 240) items++;
        }
      }
      readByte() {
        if (this.offset >= this.data.length) return 0;
        return this.data[this.offset++];
      }
      readWord() {
        if (this.offset + 1 >= this.data.length) {
          this.offset = this.data.length;
          return 0;
        }
        const value = this.data[this.offset] | this.data[this.offset + 1] << 8;
        this.offset += 2;
        return value;
      }
      readNullTerminatedString() {
        let out = "";
        while (this.offset < this.data.length) {
          const b = this.data[this.offset++];
          if (b === 0) break;
          if (b >= 32 && b <= 126) {
            out += String.fromCharCode(b);
          }
        }
        return out;
      }
      skipBytes(count) {
        this.offset = Math.min(this.data.length, this.offset + count);
      }
    };
    module2.exports = MathTypeMtefParser2;
  }
});

// src/utils/gdiObjectManager.js
var require_gdiObjectManager = __commonJS({
  "src/utils/gdiObjectManager.js"(exports2, module2) {
    "use strict";
    var GdiObjectManager2 = class {
      constructor() {
        this.objectTable = /* @__PURE__ */ new Map();
      }
      createPen(style, width, color) {
        return this.createObject({
          type: "pen",
          style,
          width,
          color
        });
      }
      createBrush(style, color) {
        return this.createObject({
          type: "brush",
          style,
          color
        });
      }
      createFont(height, width, weight, italic, underline, strikeOut, faceName, charset = 0) {
        return this.createObject({
          type: "font",
          height,
          width,
          weight,
          italic,
          underline,
          strikeOut,
          faceName,
          charset
        });
      }
      createObject(obj) {
        let handle = 0;
        while (this.objectTable.has(handle)) handle++;
        this.objectTable.set(handle, obj);
        return handle;
      }
      // 按文件声明的句柄存储（EMF 用）
      createObjectAt(handle, obj) {
        this.objectTable.set(handle, obj);
        return handle;
      }
      selectObject(handle) {
        const obj = this.objectTable.get(handle);
        if (obj) {
          if (obj.type === "font") this._currentFont = obj;
          else if (obj.type === "pen") this._currentPen = obj;
          else if (obj.type === "brush") this._currentBrush = obj;
        }
        return obj;
      }
      /** 当前选中的字体对象（processEmfTextOut 用于读取 lfEscapement/lfOrientation 做文字旋转） */
      get currentFont() {
        return this._currentFont;
      }
      deleteObject(handle) {
        this.objectTable.delete(handle);
      }
      getStockObject(stockIndex) {
        const stockColors = {
          2147483653: "#ffffff",
          // NULL_BRUSH
          2147483652: "#000000",
          // BLACK_BRUSH
          2147483651: "#808080",
          // DKGRAY_BRUSH
          2147483650: "#c0c0c0",
          // LTGRAY_BRUSH
          2147483649: "#ffffff",
          // WHITE_BRUSH
          2147483655: "#000000",
          // BLACK_PEN
          2147483654: "#ffffff",
          // WHITE_PEN
          2147483656: "transparent"
          // NULL_PEN
        };
        return stockColors[stockIndex];
      }
      clear() {
        this.objectTable.clear();
      }
    };
    module2.exports = GdiObjectManager2;
  }
});

// src/modules/parsers/baseParser.js
var require_baseParser = __commonJS({
  "src/modules/parsers/baseParser.js"(exports2, module2) {
    "use strict";
    var BaseParser2 = class {
      constructor(data) {
        this.data = new Uint8Array(data);
        this.offset = 0;
      }
      // 重置解析器状态
      reset() {
        this.offset = 0;
      }
      // 设置当前偏移量
      setOffset(offset) {
        this.offset = offset;
      }
      // 获取当前偏移量
      getOffset() {
        return this.offset;
      }
      // 读取BYTE值
      readByte() {
        if (this.offset >= this.data.length) {
          return 0;
        }
        const value = this.data[this.offset];
        this.offset += 1;
        return value & 255;
      }
      // 读取WORD值
      readWord() {
        if (this.offset + 2 > this.data.length) {
          return 0;
        }
        const value = this.data[this.offset] & 255 | (this.data[this.offset + 1] & 255) << 8;
        this.offset += 2;
        return value >>> 0;
      }
      // 读取DWORD值（无符号32位）
      readDword() {
        if (this.offset + 4 > this.data.length) {
          return 0;
        }
        const value = this.data[this.offset] & 255 | (this.data[this.offset + 1] & 255) << 8 | (this.data[this.offset + 2] & 255) << 16 | (this.data[this.offset + 3] & 255) << 24;
        this.offset += 4;
        return value >>> 0;
      }
      // 读取LONG值（有符号32位）
      readLong() {
        if (this.offset + 4 > this.data.length) {
          return 0;
        }
        const value = this.data[this.offset] & 255 | (this.data[this.offset + 1] & 255) << 8 | (this.data[this.offset + 2] & 255) << 16 | (this.data[this.offset + 3] & 255) << 24;
        this.offset += 4;
        return value | 0;
      }
      // 读取SHORT值（有符号16位）
      readShort() {
        if (this.offset + 2 > this.data.length) {
          return 0;
        }
        const value = this.data[this.offset] & 255 | (this.data[this.offset + 1] & 255) << 8;
        this.offset += 2;
        return value > 32767 ? value - 65536 : value;
      }
      // 读取指定长度的字节
      // 性能：subarray 返回零拷贝视图，避免大文件的整份内存复制
      // （下游对 record.data 只读，已确认无写操作）
      readBytes(length) {
        if (this.offset + length > this.data.length) {
          length = this.data.length - this.offset;
        }
        const bytes = this.data.subarray(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
      }
      // 读取DWORD值（从指定偏移量，不改变当前偏移）
      readDwordAt(offset) {
        if (offset + 4 > this.data.length) {
          return 0;
        }
        const value = this.data[offset] & 255 | (this.data[offset + 1] & 255) << 8 | (this.data[offset + 2] & 255) << 16 | (this.data[offset + 3] & 255) << 24;
        return value >>> 0;
      }
      // 读取WORD值（从指定偏移量，不改变当前偏移）
      readWordAt(offset) {
        if (offset + 2 > this.data.length) {
          return 0;
        }
        return (this.data[offset] & 255 | (this.data[offset + 1] & 255) << 8) >>> 0;
      }
    };
    module2.exports = BaseParser2;
  }
});

// src/modules/parsers/wmfParser.js
var require_wmfParser = __commonJS({
  "src/modules/parsers/wmfParser.js"(exports2, module2) {
    "use strict";
    var BaseParser2 = require_baseParser();
    var WMF_FUNCTIONS = {
      0: "META_EOF",
      259: "META_SETMAPMODE",
      523: "META_SETWINDOWORG",
      524: "META_SETWINDOWEXT",
      525: "META_SETVIEWPORTORG",
      526: "META_SETVIEWPORTEXT",
      513: "META_SETBKCOLOR",
      258: "META_SETBKMODE",
      521: "META_SETTEXTCOLOR",
      260: "META_SETROP2",
      262: "META_SETPOLYFILLMODE",
      263: "META_SETSTRETCHBLTMODE",
      770: "META_SETTEXTALIGN",
      762: "META_CREATEPENINDIRECT",
      764: "META_CREATEBRUSHINDIRECT",
      763: "META_CREATEFONTINDIRECT",
      300: "META_SELECTCLIPREGION",
      302: "META_SETTEXTALIGN",
      248: "META_CREATEPALETTE",
      505: "META_CREATEPATTERNBRUSH",
      247: "META_CREATEREGION",
      301: "META_SELECTOBJECT",
      496: "META_DELETEOBJECT",
      531: "META_LINETO",
      532: "META_MOVETO",
      1051: "META_RECTANGLE",
      1564: "META_ROUNDRECT",
      1048: "META_ELLIPSE",
      2071: "META_ARC",
      2074: "META_PIE",
      2096: "META_CHORD",
      805: "META_POLYLINE",
      804: "META_POLYGON",
      1336: "META_POLYPOLYGON",
      1313: "META_TEXTOUT",
      2610: "META_EXTTEXTOUT",
      1574: "META_ESCAPE",
      2368: "META_DIBBITBLT",
      2881: "META_DIBSTRETCHBLT",
      3907: "META_STRETCHDIB",
      1049: "META_FILLREGION",
      1046: "META_FLOODFILL",
      552: "META_FILLPOLYGON",
      30: "META_SAVEDC",
      295: "META_RESTOREDC"
    };
    var WmfParser2 = class extends BaseParser2 {
      constructor(data) {
        super(data);
      }
      // 解析Placeable WMF文件头
      // 根据MS-WMF规范 2.3.2.1 META_PLACEABLE Record
      parsePlaceableHeader() {
        this.offset = 0;
        const placeableHeader = {
          key: this.readDword(),
          // 0x9AC6CDD7
          handle: this.readWord(),
          // 必须为0
          left: this.readShort(),
          // 有符号16位整数
          top: this.readShort(),
          // 有符号16位整数
          right: this.readShort(),
          // 有符号16位整数
          bottom: this.readShort(),
          // 有符号16位整数
          inch: this.readWord(),
          // 逻辑单位数/英寸
          reserved: this.readDword(),
          // 必须为0
          checksum: this.readWord()
          // 校验和
        };
        if (placeableHeader.key !== 2596720087) {
          console.warn("Invalid Placeable WMF key:", placeableHeader.key.toString(16));
        }
        return placeableHeader;
      }
      // 解析WMF文件头
      // 根据MS-WMF规范 2.3.2.2 META_HEADER Object
      parseWmfHeader() {
        const header = {
          type: this.readWord(),
          // 文件类型: 1=内存, 2=磁盘
          headerSize: this.readWord(),
          // 头部大小(WORDs): 固定为9
          version: this.readWord(),
          // WMF版本
          size: this.readDword(),
          // 文件大小(WORDs)
          numObjects: this.readWord(),
          // 对象数量
          maxRecord: this.readDword(),
          // 最大记录大小(WORDs)
          reserved: this.readWord()
          // 保留字段，必须为0
        };
        const expectedHeaderSize = 9;
        if (header.headerSize !== expectedHeaderSize) {
          console.warn("Non-standard WMF header size:", header.headerSize, "expected:", expectedHeaderSize);
        }
        return header;
      }
      // 解析WMF记录
      // 根据MS-WMF规范 2.3.1 WMF Records
      // 每条记录格式: Size(DWORD) + Function(WORD) + Parameters
      parseWmfRecord() {
        if (this.offset + 6 > this.data.length) {
          return null;
        }
        const recordStart = this.offset;
        const sizeInWords = this.readDword();
        const functionId = this.readWord();
        if (sizeInWords < 3) {
          console.warn("Invalid WMF record size:", sizeInWords, "at offset:", recordStart);
          return null;
        }
        const dataSize = (sizeInWords - 3) * 2;
        if (this.offset + dataSize > this.data.length) {
          console.warn("WMF record data exceeds file length at offset:", recordStart);
          return null;
        }
        const recordData = this.readBytes(dataSize);
        return {
          size: sizeInWords,
          functionId,
          type: WMF_FUNCTIONS[functionId] || "Unknown",
          data: recordData
        };
      }
      // 解析完整的WMF文件
      parse(fileType) {
        try {
          __wmfEmfRendererLog("Starting WMF parsing...");
          let placeableHeader = null;
          if (fileType === "placeable-wmf") {
            placeableHeader = this.parsePlaceableHeader();
            __wmfEmfRendererLog("Placeable WMF Header:", placeableHeader);
          }
          const startOffset = this.getOffset();
          const header = this.parseWmfHeader();
          __wmfEmfRendererLog("WMF Header:", header);
          if (!header || header.headerSize <= 0) {
            throw new Error("Invalid WMF header");
          }
          const targetOffset = startOffset + header.headerSize * 2;
          if (this.getOffset() < targetOffset) {
            __wmfEmfRendererLog("Skipping extra bytes from", this.getOffset(), "to", targetOffset);
            this.setOffset(targetOffset);
          }
          const records = [];
          __wmfEmfRendererLog("Starting WMF record parsing from offset:", this.getOffset(), "total length:", this.data.length);
          let iterationCount = 0;
          const maxRecords = Math.ceil(this.data.length / 6);
          let lastOffset = -1;
          while (this.getOffset() < this.data.length && iterationCount < maxRecords) {
            if (this.getOffset() === lastOffset) {
              console.warn("Parser made no progress at offset:", this.getOffset(), "stopping");
              break;
            }
            lastOffset = this.getOffset();
            iterationCount++;
            try {
              const record = this.parseWmfRecord();
              if (record) {
                records.push(record);
                if (globalThis.__WMF_DEBUG__) {
                  __wmfEmfRendererLog("Parsed WMF record:", record.functionId, "(0x" + record.functionId.toString(16).padStart(4, "0") + ")", "new offset:", this.getOffset());
                }
              } else {
                __wmfEmfRendererLog("No valid record at offset:", this.getOffset(), "stopping");
                break;
              }
            } catch (error) {
              console.warn("Error parsing WMF record at offset", this.getOffset(), ":", error.message);
              this.setOffset(this.getOffset() + 2);
            }
          }
          __wmfEmfRendererLog("Ended at offset:", this.getOffset(), "parsed", records.length, "records");
          __wmfEmfRendererLog("Total WMF records parsed:", records.length);
          return { header: { ...header, placeableHeader }, records };
        } catch (error) {
          console.error("WMF parsing error:", error.message);
          return {
            header: null,
            records: [],
            error: error.message
          };
        }
      }
    };
    module2.exports = WmfParser2;
  }
});

// src/modules/parsers/emfParser.js
var require_emfParser = __commonJS({
  "src/modules/parsers/emfParser.js"(exports2, module2) {
    "use strict";
    var BaseParser2 = require_baseParser();
    var EMF_FUNCTIONS = {
      1: "EMR_HEADER",
      2: "EMR_POLYBEZIER",
      3: "EMR_POLYGON",
      4: "EMR_POLYLINE",
      5: "EMR_POLYBEZIERTO",
      6: "EMR_POLYLINETO",
      7: "EMR_POLYPOLYLINE",
      8: "EMR_POLYPOLYGON",
      9: "EMR_SETWINDOWEXTEX",
      10: "EMR_SETWINDOWORGEX",
      11: "EMR_SETVIEWPORTEXTEX",
      12: "EMR_SETVIEWPORTORGEX",
      13: "EMR_SETBRUSHORGEX",
      14: "EMR_EOF",
      15: "EMR_SETPIXELV",
      16: "EMR_SETMAPPERFLAGS",
      17: "EMR_SETMAPMODE",
      18: "EMR_SETBKMODE",
      19: "EMR_SETPOLYFILLMODE",
      20: "EMR_SETROP2",
      21: "EMR_SETSTRETCHBLTMODE",
      22: "EMR_SETTEXTALIGN",
      23: "EMR_SETCOLORADJUSTMENT",
      24: "EMR_SETTEXTCOLOR",
      25: "EMR_SETBKCOLOR",
      26: "EMR_OFFSETCLIPRGN",
      27: "EMR_MOVETOEX",
      28: "EMR_SETMETARGN",
      29: "EMR_EXCLUDECLIPRECT",
      30: "EMR_INTERSECTCLIPRECT",
      31: "EMR_SCALEVIEWPORTEXTEX",
      32: "EMR_SCALEWINDOWEXTEX",
      33: "EMR_SAVEDC",
      34: "EMR_RESTOREDC",
      35: "EMR_SETWORLDTRANSFORM",
      36: "EMR_MODIFYWORLDTRANSFORM",
      37: "EMR_SELECTOBJECT",
      38: "EMR_CREATEPEN",
      39: "EMR_CREATEBRUSHINDIRECT",
      40: "EMR_DELETEOBJECT",
      41: "EMR_ANGLEARC",
      42: "EMR_ELLIPSE",
      43: "EMR_RECTANGLE",
      44: "EMR_ROUNDRECT",
      45: "EMR_ARC",
      46: "EMR_CHORD",
      47: "EMR_PIE",
      48: "EMR_SELECTPALETTE",
      49: "EMR_CREATEPALETTE",
      50: "EMR_SETPALETTEENTRIES",
      51: "EMR_RESIZEPALETTE",
      52: "EMR_REALIZEPALETTE",
      53: "EMR_EXTFLOODFILL",
      54: "EMR_LINETO",
      55: "EMR_ARCTO",
      56: "EMR_POLYDRAW",
      57: "EMR_SETARCDIRECTION",
      58: "EMR_SETMITERLIMIT",
      59: "EMR_BEGINPATH",
      60: "EMR_ENDPATH",
      61: "EMR_CLOSEFIGURE",
      62: "EMR_FILLPATH",
      63: "EMR_STROKEANDFILLPATH",
      64: "EMR_STROKEPATH",
      65: "EMR_FLATTENPATH",
      66: "EMR_WIDENPATH",
      67: "EMR_SELECTCLIPPATH",
      68: "EMR_ABORTPATH",
      // 0x45 (69) 保留未使用
      70: "EMR_GDICOMMENT",
      71: "EMR_FILLRGN",
      72: "EMR_FRAMERGN",
      73: "EMR_INVERTRGN",
      74: "EMR_PAINTRGN",
      75: "EMR_EXTSELECTCLIPRGN",
      76: "EMR_BITBLT",
      77: "EMR_STRETCHBLT",
      78: "EMR_MASKBLT",
      79: "EMR_PLGBLT",
      80: "EMR_SETDIBITSTODEVICE",
      81: "EMR_STRETCHDIBITS",
      82: "EMR_EXTCREATEFONTINDIRECTW",
      83: "EMR_EXTTEXTOUTA",
      84: "EMR_EXTTEXTOUTW",
      85: "EMR_POLYBEZIER16",
      86: "EMR_POLYGON16",
      87: "EMR_POLYLINE16",
      88: "EMR_POLYBEZIERTO16",
      89: "EMR_POLYLINETO16",
      90: "EMR_POLYPOLYLINE16",
      91: "EMR_POLYPOLYGON16",
      92: "EMR_POLYDRAW16",
      93: "EMR_CREATEMONOBRUSH",
      94: "EMR_CREATEDIBPATTERNBRUSHPT",
      95: "EMR_EXTCREATEPEN",
      96: "EMR_POLYTEXTOUTA",
      97: "EMR_POLYTEXTOUTW",
      98: "EMR_SETICMMODE",
      99: "EMR_CREATECOLORSPACE",
      100: "EMR_SETCOLORSPACE",
      101: "EMR_DELETECOLORSPACE",
      102: "EMR_GLSRECORD",
      103: "EMR_GLSBOUNDEDRECORD",
      104: "EMR_PIXELFORMAT",
      105: "EMR_DRAWESCAPE",
      106: "EMR_EXTESCAPE",
      107: "EMR_STARTDOC",
      108: "EMR_SMALLTEXTOUT",
      109: "EMR_FORCEUFIMAPPING",
      110: "EMR_NAMEDESCAPE",
      111: "EMR_COLORCORRECTPALETTE",
      112: "EMR_SETICMPROFILEA",
      113: "EMR_SETICMPROFILEW",
      114: "EMR_ALPHABLEND",
      115: "EMR_SETLAYOUT",
      116: "EMR_TRANSPARENTBLT",
      117: "EMR_TRANSPARENTDIB",
      118: "EMR_GRADIENTFILL",
      119: "EMR_SETLINKEDUFIS",
      120: "EMR_SETTEXTJUSTIFICATION"
    };
    var EmfParser2 = class extends BaseParser2 {
      constructor(data) {
        super(data);
      }
      // 解析EMF文件头
      // 根据MS-EMF规范 2.3.4.2 EMR_HEADER Record
      parseEmfHeader() {
        this.offset = 0;
        if (this.data.length < 88) {
          console.error("File too small to be valid EMF");
          return null;
        }
        const header = {
          // EMR 基础记录头 (8字节)
          iType: this.readDword(),
          // 记录类型，必须为0x00000001 (EMR_HEADER)
          nSize: this.readDword(),
          // 记录大小(字节)
          // RECTL Bounds (16字节) - 设备单位边界
          bounds: {
            left: this.readLong(),
            // 有符号32位
            top: this.readLong(),
            right: this.readLong(),
            bottom: this.readLong()
          },
          // RECTL Frame (16字节) - 0.01毫米单位边界
          frame: {
            left: this.readLong(),
            top: this.readLong(),
            right: this.readLong(),
            bottom: this.readLong()
          },
          // EMF签名和版本信息
          dSignature: this.readDword(),
          // 必须为0x464D4520 (" EMF")
          nVersion: this.readDword(),
          // 版本号，通常为0x00010000
          nBytes: this.readDword(),
          // 文件总字节数
          nRecords: this.readDword(),
          // 元文件中记录总数
          nHandles: this.readWord(),
          // 句柄表中的句柄数
          sReserved: this.readWord(),
          // 保留，必须为0
          nDescription: this.readDword(),
          // 描述字符串长度(字符数)
          offDescription: this.readDword(),
          // 描述字符串偏移量
          nPalEntries: this.readDword(),
          // 调色板条目数
          // 参考设备尺寸（像素）
          szlDevice: {
            cx: this.readLong(),
            cy: this.readLong()
          },
          // 参考设备尺寸（毫米）
          szlMillimeters: {
            cx: this.readLong(),
            cy: this.readLong()
          }
        };
        if (header.dSignature !== 1179469088) {
          console.error("Invalid EMF signature:", header.dSignature.toString(16), "expected: 464d4520");
          return null;
        }
        if (header.iType !== 1) {
          console.error("Invalid EMR_HEADER type:", header.iType, "expected: 1");
          return null;
        }
        if (header.nSize < 88) {
          console.error("Invalid EMR_HEADER size:", header.nSize, "expected: >= 88");
          return null;
        }
        __wmfEmfRendererLog("EMF Header validated successfully");
        __wmfEmfRendererLog("  Version:", header.nVersion.toString(16));
        __wmfEmfRendererLog("  Total bytes:", header.nBytes);
        __wmfEmfRendererLog("  Total records:", header.nRecords);
        __wmfEmfRendererLog("  Bounds:", header.bounds);
        __wmfEmfRendererLog("  Device size:", header.szlDevice);
        return header;
      }
      // 解析EMF记录
      // 根据MS-EMF规范 2.3.1 EMF Records
      // 每条记录格式: Type(DWORD) + Size(DWORD) + Parameters
      parseEmfRecord() {
        if (this.offset + 8 > this.data.length) {
          return null;
        }
        const recordStart = this.offset;
        const type = this.readDword();
        const size = this.readDword();
        if (size < 8) {
          console.warn("Invalid EMF record size:", size, "at offset:", recordStart);
          return null;
        }
        if (this.offset + size - 8 > this.data.length) {
          console.warn("EMF record exceeds file length at offset:", recordStart);
          return null;
        }
        const recordData = this.readBytes(size - 8);
        return {
          type,
          typeName: EMF_FUNCTIONS[type] || "Unknown",
          size,
          data: recordData
        };
      }
      // 解析完整的EMF文件
      parse() {
        try {
          const header = this.parseEmfHeader();
          if (!header || header.nSize <= 0) {
            throw new Error("Invalid EMF header");
          }
          this.setOffset(header.nSize);
          const records = [];
          let recordCount = 0;
          while (this.getOffset() < this.data.length && recordCount < header.nRecords) {
            try {
              const record = this.parseEmfRecord();
              if (record) {
                records.push(record);
                if (globalThis.__WMF_DEBUG__) {
                  __wmfEmfRendererLog("Parsed EMF record:", record.type, "(0x" + record.type.toString(16).padStart(8, "0") + ")");
                }
                recordCount++;
              } else {
                console.warn("Failed to parse EMF record at offset:", this.getOffset());
                break;
              }
            } catch (error) {
              console.warn("Error parsing EMF record:", error.message);
              this.setOffset(this.getOffset() + 8);
            }
          }
          __wmfEmfRendererLog("Total EMF records parsed:", records.length);
          return { header, records };
        } catch (error) {
          console.error("EMF parsing error:", error.message);
          return {
            header: null,
            records: [],
            error: error.message
          };
        }
      }
    };
    module2.exports = EmfParser2;
  }
});

// src/modules/parsers/emfPlusParser.js
var require_emfPlusParser = __commonJS({
  "src/modules/parsers/emfPlusParser.js"(exports2, module2) {
    "use strict";
    var BaseParser2 = require_baseParser();
    var EMFPLUS_FUNCTIONS = {
      16385: "EmfPlusHeader",
      16386: "EmfPlusEndOfFile",
      16387: "EmfPlusComment",
      16388: "EmfPlusGetDC",
      16389: "EmfPlusMultiFormatStart",
      16390: "EmfPlusMultiFormatSection",
      16391: "EmfPlusMultiFormatEnd",
      // 0x4008 起依据 [MS-EMFPLUS] 2.1.1 枚举（与 emfPlusDrawer 的分发一致）
      16392: "EmfPlusObject",
      16393: "EmfPlusClear",
      16394: "EmfPlusFillRects",
      16395: "EmfPlusDrawRects",
      16396: "EmfPlusFillPolygon",
      16397: "EmfPlusDrawLines",
      16398: "EmfPlusFillEllipse",
      16399: "EmfPlusDrawEllipse",
      16400: "EmfPlusFillPie",
      16401: "EmfPlusDrawPie",
      16402: "EmfPlusDrawArc",
      16403: "EmfPlusFillRegion",
      16404: "EmfPlusDrawRegion",
      16405: "EmfPlusFillPath",
      16406: "EmfPlusDrawPath",
      16407: "EmfPlusFillClosedCurve",
      16408: "EmfPlusDrawClosedCurve",
      16409: "EmfPlusDrawCurve",
      16410: "EmfPlusDrawBeziers",
      16411: "EmfPlusDrawImage",
      16412: "EmfPlusDrawImagePoints",
      16413: "EmfPlusDrawString",
      16414: "EmfPlusSetRenderingOrigin",
      16415: "EmfPlusSetAntiAliasMode",
      16416: "EmfPlusSetTextRenderingHint",
      16417: "EmfPlusSetCompositingMode",
      16418: "EmfPlusSetCompositingQuality",
      16419: "EmfPlusSave",
      16420: "EmfPlusRestore",
      16421: "EmfPlusBeginContainer",
      16422: "EmfPlusBeginContainerNoParams",
      16423: "EmfPlusEndContainer",
      16424: "EmfPlusSetWorldTransform",
      16425: "EmfPlusResetWorldTransform",
      16426: "EmfPlusMultiplyWorldTransform",
      16427: "EmfPlusTranslateWorldTransform",
      16428: "EmfPlusScaleWorldTransform",
      16429: "EmfPlusRotateWorldTransform",
      16430: "EmfPlusSetPageTransform",
      16431: "EmfPlusResetClip",
      16432: "EmfPlusSetClipRect",
      16433: "EmfPlusSetClipPath",
      16434: "EmfPlusSetClipRegion",
      16435: "EmfPlusOffsetClip",
      16436: "EmfPlusDrawDriverString",
      // 0x4035 起为 Terminal Server 扩展，罕见
      16437: "EmfPlusSerializableObject",
      16438: "EmfPlusSetTSGraphics",
      16439: "EmfPlusSetTSClip"
    };
    var EmfPlusParser2 = class extends BaseParser2 {
      constructor(data) {
        super(data);
      }
      // EMF+ 记录头结构（MS-EMFPLUS 2.3.1，共 12 字节）：
      // Type(2) + Flags(2) + Size(4，含 12 字节头的记录总大小) + DataSize(4，数据字节数)
      parseEmfPlusRecord(emfRecordData) {
        const list = this.parseEmfPlusRecords(emfRecordData);
        return list.length ? list[0] : null;
      }
      // 解析同一 EMR_COMMENT 载荷中的全部 EMF+ 记录。
      // [MS-EMFPLUS] 2.3.1：EMF+ 记录头为 12 字节——
      //   Type(2) + Flags(2) + Size(4，含 12 字节头的记录总大小) + DataSize(4，数据字节数)
      // 旧实现按 8 字节头读取，把 DataSize 误当记录体首字段，整条流错位 4 字节。
      parseEmfPlusRecords(emfRecordData) {
        const results = [];
        if (emfRecordData.length < 16) return results;
        const dataSize = emfRecordData[0] & 255 | (emfRecordData[1] & 255) << 8 | (emfRecordData[2] & 255) << 16 | (emfRecordData[3] & 255) << 24;
        const commentId = emfRecordData[4] & 255 | (emfRecordData[5] & 255) << 8 | (emfRecordData[6] & 255) << 16 | (emfRecordData[7] & 255) << 24;
        if (commentId !== 726027589) return results;
        const end = Math.min(8 + dataSize, emfRecordData.length);
        let offset = 8;
        while (offset + 12 <= end) {
          const type = emfRecordData[offset] & 255 | (emfRecordData[offset + 1] & 255) << 8;
          const flags = emfRecordData[offset + 2] & 255 | (emfRecordData[offset + 3] & 255) << 8;
          const size = emfRecordData[offset + 4] & 255 | (emfRecordData[offset + 5] & 255) << 8 | (emfRecordData[offset + 6] & 255) << 16 | (emfRecordData[offset + 7] & 255) << 24;
          const bodySize = emfRecordData[offset + 8] & 255 | (emfRecordData[offset + 9] & 255) << 8 | (emfRecordData[offset + 10] & 255) << 16 | (emfRecordData[offset + 11] & 255) << 24;
          if (size < 12 || offset + size > end) break;
          const dataLen = Math.max(0, Math.min(bodySize, size - 12, end - offset - 12));
          const recordData = emfRecordData.slice(offset + 12, offset + 12 + dataLen);
          results.push({
            type,
            typeName: EMFPLUS_FUNCTIONS[type] || "Unknown",
            flags,
            size,
            dataSize: dataLen,
            data: recordData
          });
          offset += size;
        }
        return results;
      }
      // 从EMF文件中解析EMF+记录
      parseEmfRecord() {
        if (this.offset + 8 > this.data.length) {
          return null;
        }
        const recordStart = this.offset;
        const type = this.readDword();
        const size = this.readDword();
        if (size < 8) {
          return null;
        }
        if (this.offset + size - 8 > this.data.length) {
          return null;
        }
        const recordData = this.readBytes(size - 8);
        if (type === 70) {
          const emfPlusRecords = this.parseEmfPlusRecords(recordData);
          if (emfPlusRecords.length > 0) {
            return emfPlusRecords.map((r) => ({
              type: r.type,
              typeName: r.typeName,
              flags: r.flags,
              size: r.size,
              data: r.data,
              isEmfPlus: true
            }));
          }
        }
        return {
          type,
          size,
          data: recordData,
          isEmfPlus: false
        };
      }
      // 解析完整的EMF+文件
      parse() {
        try {
          const emfHeader = this.parseEmfHeader();
          if (!emfHeader || emfHeader.nSize <= 0) {
            throw new Error("Invalid EMF header");
          }
          this.setOffset(emfHeader.nSize);
          const records = [];
          let recordCount = 0;
          while (this.getOffset() < this.data.length && recordCount < emfHeader.nRecords) {
            try {
              const record = this.parseEmfRecord();
              if (record) {
                const recordList = Array.isArray(record) ? record : [record];
                for (const r of recordList) {
                  if (r.isEmfPlus) {
                    records.push(r);
                    if (globalThis.__WMF_DEBUG__) {
                      __wmfEmfRendererLog("Parsed EMF+ record:", r.type, "(0x" + r.type.toString(16).padStart(4, "0") + ")", "flags:", r.flags);
                    }
                  } else {
                    if (globalThis.__WMF_DEBUG__) {
                      __wmfEmfRendererLog("Skipped EMF record:", r.type, "(0x" + r.type.toString(16).padStart(8, "0") + ")");
                    }
                  }
                }
                recordCount++;
              } else {
                console.warn("Failed to parse record at offset:", this.getOffset());
                break;
              }
            } catch (error) {
              console.warn("Error parsing record:", error.message);
              this.setOffset(this.getOffset() + 8);
            }
          }
          __wmfEmfRendererLog("Total EMF+ records parsed:", records.length);
          return { header: emfHeader, records };
        } catch (error) {
          console.error("EMF+ parsing error:", error.message);
          return {
            header: null,
            records: [],
            error: error.message
          };
        }
      }
      // 解析EMF文件头（EMF+包含EMF头）
      // 根据MS-EMF规范 2.3.4.2 EMR_HEADER Record
      parseEmfHeader() {
        this.offset = 0;
        if (this.data.length < 88) {
          return null;
        }
        const header = {
          iType: this.readDword(),
          nSize: this.readDword(),
          bounds: {
            left: this.readLong(),
            top: this.readLong(),
            right: this.readLong(),
            bottom: this.readLong()
          },
          frame: {
            left: this.readLong(),
            top: this.readLong(),
            right: this.readLong(),
            bottom: this.readLong()
          },
          dSignature: this.readDword(),
          nVersion: this.readDword(),
          nBytes: this.readDword(),
          nRecords: this.readDword(),
          nHandles: this.readWord(),
          sReserved: this.readWord(),
          nDescription: this.readDword(),
          offDescription: this.readDword(),
          nPalEntries: this.readDword(),
          szlDevice: {
            cx: this.readLong(),
            cy: this.readLong()
          },
          szlMillimeters: {
            cx: this.readLong(),
            cy: this.readLong()
          }
        };
        if (header.dSignature !== 1179469088) {
          return null;
        }
        if (header.iType !== 1) {
          return null;
        }
        return header;
      }
    };
    module2.exports = EmfPlusParser2;
  }
});

// src/modules/drawers/baseDrawer.js
var require_baseDrawer = __commonJS({
  "src/modules/drawers/baseDrawer.js"(exports2, module2) {
    "use strict";
    var CoordinateTransformer2 = require_coordinateTransformer();
    var GdiObjectManager2 = require_gdiObjectManager();
    var BaseDrawer2 = class {
      constructor(ctx) {
        this.ctx = ctx;
        this.coordinateTransformer = new CoordinateTransformer2();
        this.gdiObjectManager = new GdiObjectManager2();
        this.currentPath = [];
        this.pathState = "idle";
        this.fillColor = "#000000";
        this.strokeColor = "#000000";
        this.lineWidth = 1;
      }
      // 初始化画布
      initCanvas(metafileData, options = {}) {
        let canvasWidth, canvasHeight;
        const viewWidth = options.viewWidth || 800;
        const viewHeight = options.viewHeight || 600;
        if (metafileData.header.placeableHeader) {
          const ph = metafileData.header.placeableHeader;
          const inch = ph.inch || 1e3;
          const logicalWidth = Math.abs(ph.right - ph.left);
          const logicalHeight = Math.abs(ph.bottom - ph.top);
          const widthInInch = logicalWidth / inch;
          const heightInInch = logicalHeight / inch;
          let pixelWidth = widthInInch * 96;
          let pixelHeight = heightInInch * 96;
          const scaleToFit = Math.min(
            viewWidth / pixelWidth,
            viewHeight / pixelHeight
          );
          pixelWidth *= scaleToFit;
          pixelHeight *= scaleToFit;
          canvasWidth = Math.round(pixelWidth);
          canvasHeight = Math.round(pixelHeight);
          this.coordinateTransformer.setWindowOrg(ph.left, ph.top);
          this.coordinateTransformer.setWindowExt(logicalWidth, logicalHeight);
          this.coordinateTransformer.setViewportOrg(0, 0);
          this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
          __wmfEmfRendererLog("Canvas initialized with placeableHeader:", {
            logicalWidth,
            logicalHeight,
            widthInInch: widthInInch.toFixed(2),
            heightInInch: heightInInch.toFixed(2),
            canvasWidth,
            canvasHeight,
            viewWidth,
            viewHeight,
            inch
          });
        } else if (metafileData.header.bounds) {
          const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
          const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
          const scaleToFit = Math.min(
            viewWidth / width,
            viewHeight / height
          );
          canvasWidth = Math.round(width * scaleToFit);
          canvasHeight = Math.round(height * scaleToFit);
          this.coordinateTransformer.setWindowExt(width, height);
          this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
        } else {
          canvasWidth = viewWidth;
          canvasHeight = viewHeight;
          this.coordinateTransformer.setWindowExt(canvasWidth, canvasHeight);
          this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
        }
        const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
        this.devicePixelRatio = dpr;
        this.ctx.canvas.width = Math.round(canvasWidth * dpr);
        this.ctx.canvas.height = Math.round(canvasHeight * dpr);
        this.ctx.canvas.style.width = canvasWidth + "px";
        this.ctx.canvas.style.height = canvasHeight + "px";
        this.ctx.scale(dpr, dpr);
        __wmfEmfRendererLog("Canvas size set to:", canvasWidth, "x", canvasHeight, "(DPR:", dpr, ", actual:", this.ctx.canvas.width, "x", this.ctx.canvas.height + ")");
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        __wmfEmfRendererLog("Canvas cleared");
        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.fillColor = "#ffffff";
        this.strokeColor = "#000000";
        __wmfEmfRendererLog("Drawing styles set");
        this.currentPath = [];
        this.pathState = "idle";
      }
      // 处理剩余的路径
      finishPath() {
        __wmfEmfRendererLog("Finishing path");
      }
      // 尝试通用处理逻辑，解析为图形数据
      tryProcessAsCoordinates(data) {
        __wmfEmfRendererLog("Trying to process as coordinates");
      }
      // 以下是一些通用的处理方法，可以在子类中覆盖
      processSetWindowOrg(data) {
        __wmfEmfRendererLog("Processing SetWindowOrg");
      }
      processSetWindowExt(data) {
        __wmfEmfRendererLog("Processing SetWindowExt");
      }
      processSetViewportOrg(data) {
        __wmfEmfRendererLog("Processing SetViewportOrg");
      }
      processSetViewportExt(data) {
        __wmfEmfRendererLog("Processing SetViewportExt");
      }
      processMoveTo(data) {
        __wmfEmfRendererLog("Processing MoveTo");
      }
      processLineTo(data) {
        __wmfEmfRendererLog("Processing LineTo");
      }
      processRectangle(data) {
        __wmfEmfRendererLog("Processing Rectangle");
      }
      processRoundRect(data) {
        __wmfEmfRendererLog("Processing RoundRect");
      }
      processEllipse(data) {
        __wmfEmfRendererLog("Processing Ellipse");
      }
      processArc(data) {
        __wmfEmfRendererLog("Processing Arc");
      }
      processPie(data) {
        __wmfEmfRendererLog("Processing Pie");
      }
      processChord(data) {
        __wmfEmfRendererLog("Processing Chord");
      }
      processPolyline(data) {
        __wmfEmfRendererLog("Processing Polyline");
      }
      processPolygon(data) {
        __wmfEmfRendererLog("Processing Polygon");
      }
      processTextOut(data) {
        __wmfEmfRendererLog("Processing TextOut");
      }
      processGetTextExtent(data) {
        __wmfEmfRendererLog("Processing GetTextExtent");
      }
      processEscape(data) {
        __wmfEmfRendererLog("Processing Escape");
      }
      processCreatePenIndirect(data) {
        __wmfEmfRendererLog("Processing CreatePenIndirect");
      }
      processCreateBrushIndirect(data) {
        __wmfEmfRendererLog("Processing CreateBrushIndirect");
      }
      processSelectObject(data) {
        __wmfEmfRendererLog("Processing SelectObject");
      }
      processDeleteObject(data) {
        __wmfEmfRendererLog("Processing DeleteObject");
      }
      processSetMapMode(data) {
        __wmfEmfRendererLog("Processing SetMapMode");
      }
      processSetTextJustification(data) {
        __wmfEmfRendererLog("Processing SetTextJustification");
      }
      processSetTextColor(data) {
        __wmfEmfRendererLog("Processing SetTextColor");
      }
      processSetBkColor(data) {
        __wmfEmfRendererLog("Processing SetBkColor");
      }
      processSetBkMode(data) {
        __wmfEmfRendererLog("Processing SetBkMode");
      }
      processSetROP2(data) {
        __wmfEmfRendererLog("Processing SetROP2");
      }
      processSetPolyFillMode(data) {
        __wmfEmfRendererLog("Processing SetPolyFillMode");
      }
      processSetStretchBltMode(data) {
        __wmfEmfRendererLog("Processing SetStretchBltMode");
      }
      processSetTextStretch(data) {
        __wmfEmfRendererLog("Processing SetTextStretch");
      }
      processSetWindowOrgEx(data) {
        __wmfEmfRendererLog("Processing SetWindowOrgEx");
      }
      processSetWindowExtEx(data) {
        __wmfEmfRendererLog("Processing SetWindowExtEx");
      }
      processSetViewportOrgEx(data) {
        __wmfEmfRendererLog("Processing SetViewportOrgEx");
      }
      processSetViewportExtEx(data) {
        __wmfEmfRendererLog("Processing SetViewportExtEx");
      }
      processFillRect(data) {
        __wmfEmfRendererLog("Processing FillRect");
      }
      processFrameRect(data) {
        __wmfEmfRendererLog("Processing FrameRect");
      }
      processInvertRect(data) {
        __wmfEmfRendererLog("Processing InvertRect");
      }
      processPaintRect(data) {
        __wmfEmfRendererLog("Processing PaintRect");
      }
      processFillRgn(data) {
        __wmfEmfRendererLog("Processing FillRgn");
      }
      processFrameRgn(data) {
        __wmfEmfRendererLog("Processing FrameRgn");
      }
      processInvertRgn(data) {
        __wmfEmfRendererLog("Processing InvertRgn");
      }
      processPaintRgn(data) {
        __wmfEmfRendererLog("Processing PaintRgn");
      }
      processSetTextAlign(data) {
        __wmfEmfRendererLog("Processing SetTextAlign");
      }
      processCreateFontIndirect(data) {
        __wmfEmfRendererLog("Processing CreateFontIndirect");
      }
      processCreatePalette(data) {
        __wmfEmfRendererLog("Processing CreatePalette");
      }
      processCreatePatternBrush(data) {
        __wmfEmfRendererLog("Processing CreatePatternBrush");
      }
      processCreateRegion(data) {
        __wmfEmfRendererLog("Processing CreateRegion");
      }
      processPolyPolygon(data) {
        __wmfEmfRendererLog("Processing PolyPolygon");
      }
      processExtTextOut(data) {
        __wmfEmfRendererLog("Processing ExtTextOut");
      }
      processDibBitBlt(data) {
        __wmfEmfRendererLog("Processing DibBitBlt");
      }
      processDibStretchBlt(data) {
        __wmfEmfRendererLog("Processing DibStretchBlt");
      }
      processStretchDib(data) {
        __wmfEmfRendererLog("Processing StretchDib");
      }
      processFloodFill(data) {
        __wmfEmfRendererLog("Processing FloodFill");
      }
      processSaveDC(data) {
        __wmfEmfRendererLog("Processing SaveDC");
      }
      processRestoreDC(data) {
        __wmfEmfRendererLog("Processing RestoreDC");
      }
    };
    module2.exports = BaseDrawer2;
  }
});

// src/utils/metafileParser.js
var require_metafileParser = __commonJS({
  "src/utils/metafileParser.js"(exports2, module2) {
    "use strict";
    var FileTypeDetector2 = require_fileTypeDetector();
    var WmfParser2 = require_wmfParser();
    var EmfParser2 = require_emfParser();
    var EmfPlusParser2 = require_emfPlusParser();
    var MetafileParser2 = class {
      constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector2(data);
        this.fileType = this.fileTypeDetector.detect();
        __wmfEmfRendererLog("Metafile Parser initialized with data length:", data.length, "type:", this.fileType);
      }
      parse() {
        __wmfEmfRendererLog("Starting", this.fileType.toUpperCase(), "parsing...");
        try {
          switch (this.fileType) {
            case "emf+":
              return this.parseEmfPlus();
            case "emf":
              return this.parseEmf();
            case "wmf":
            case "placeable-wmf":
              return this.parseWmf();
            default:
              __wmfEmfRendererLog("Unknown file type, trying all methods...");
              const emfPlusResult = this.tryParseEmfPlus();
              if (emfPlusResult && emfPlusResult.records.length > 0) {
                return emfPlusResult;
              }
              const emfResult = this.tryParseEmf();
              if (emfResult && emfResult.records.length > 0) {
                return emfResult;
              }
              const wmfResult = this.tryParseWmf();
              if (wmfResult && wmfResult.records.length > 0) {
                return wmfResult;
              }
              throw new Error("Failed to parse file with any format");
          }
        } catch (error) {
          console.error("Parsing error:", error.message);
          return {
            header: null,
            records: [],
            error: error.message
          };
        }
      }
      parseWmf() {
        const wmfParser = new WmfParser2(this.data);
        return wmfParser.parse(this.fileType);
      }
      parseEmf() {
        const emfParser = new EmfParser2(this.data);
        return emfParser.parse();
      }
      parseEmfPlus() {
        const emfPlusParser = new EmfPlusParser2(this.data);
        return emfPlusParser.parse();
      }
      tryParseWmf() {
        try {
          const wmfParser = new WmfParser2(this.data);
          return wmfParser.parse("wmf");
        } catch (error) {
          __wmfEmfRendererLog("WMF parsing failed:", error.message);
          return null;
        }
      }
      tryParseEmf() {
        try {
          const emfParser = new EmfParser2(this.data);
          return emfParser.parse();
        } catch (error) {
          __wmfEmfRendererLog("EMF parsing failed:", error.message);
          return null;
        }
      }
      tryParseEmfPlus() {
        try {
          const emfPlusParser = new EmfPlusParser2(this.data);
          return emfPlusParser.parse();
        } catch (error) {
          __wmfEmfRendererLog("EMF+ parsing failed:", error.message);
          return null;
        }
      }
    };
    module2.exports = MetafileParser2;
  }
});

// src/modules/drawers/emfDrawer.js
var require_emfDrawer = __commonJS({
  "src/modules/drawers/emfDrawer.js"(exports2, module2) {
    "use strict";
    var CoordinateTransformer2 = require_coordinateTransformer();
    var GdiObjectManager2 = require_gdiObjectManager();
    var EmfPlusParser2 = require_emfPlusParser();
    var EmfPlusDrawer2 = require_emfPlusDrawer();
    var EMF_RECORD_HANDLERS = {
      // ========== 基础记录 ==========
      1: "processEmfHeader",
      // EMR_HEADER
      14: null,
      // EMR_EOF
      // ========== 绘图记录 (Drawing Records) ==========
      2: "processEmfPolyBezier",
      // EMR_POLYBEZIER
      3: "processEmfPolygon",
      // EMR_POLYGON
      4: "processEmfPolyline",
      // EMR_POLYLINE
      5: "processEmfPolyBezierTo",
      // EMR_POLYBEZIERTO
      6: "processEmfPolylineTo",
      // EMR_POLYLINETO
      7: "processEmfPolyPolyline",
      // EMR_POLYPOLYLINE
      8: "processEmfPolyPolygon",
      // EMR_POLYPOLYGON
      27: "processEmfMoveToEx",
      // EMR_MOVETOEX
      54: "processEmfLineTo",
      // EMR_LINETO
      41: "processEmfAngleArc",
      // EMR_ANGLEARC
      42: "processEmfEllipse",
      // EMR_ELLIPSE
      43: "processEmfRectangle",
      // EMR_RECTANGLE
      44: "processEmfRoundRect",
      // EMR_ROUNDRECT
      45: "processEmfArc",
      // EMR_ARC
      55: "processEmfArcTo",
      // EMR_ARCTO
      46: "processEmfChord",
      // EMR_CHORD
      47: "processEmfPie",
      // EMR_PIE
      56: "processEmfPolyDraw",
      // EMR_POLYDRAW
      // ========== 路径记录 (Path Records) ==========
      59: "processEmfBeginPath",
      // EMR_BEGINPATH
      60: "processEmfEndPath",
      // EMR_ENDPATH
      61: "processEmfCloseFigure",
      // EMR_CLOSEFIGURE
      62: "processEmfFillPath",
      // EMR_FILLPATH
      94: "processEmfCreateDibPatternBrushPT",
      // EMR_CREATEDIBPATTERNBRUSHPT
      63: "processEmfStrokeAndFillPath",
      // EMR_STROKEANDFILLPATH
      64: "processEmfStrokePath",
      // EMR_STROKEPATH
      65: "processEmfFlattenPath",
      // EMR_FLATTENPATH
      66: "processEmfWidenPath",
      // EMR_WIDENPATH
      68: "processEmfAbortPath",
      // EMR_ABORTPATH
      // ========== 状态记录 (State Records) ==========
      9: "processEmfSetWindowExtEx",
      // EMR_SETWINDOWEXTEX
      10: "processEmfSetWindowOrgEx",
      // EMR_SETWINDOWORGEX
      11: "processEmfSetViewportExtEx",
      // EMR_SETVIEWPORTEXTEX
      12: "processEmfSetViewportOrgEx",
      // EMR_SETVIEWPORTORGEX
      13: "processEmfSetBrushOrgEx",
      // EMR_SETBRUSHORGEX
      15: "processEmfSetPixelV",
      // EMR_SETPIXELV
      16: "processEmfSetMapperFlags",
      // EMR_SETMAPPERFLAGS
      17: "processEmfSetMapMode",
      // EMR_SETMAPMODE
      18: "processEmfSetBkMode",
      // EMR_SETBKMODE
      19: "processEmfSetPolyFillMode",
      // EMR_SETPOLYFILLMODE
      20: "processEmfSetRop2",
      // EMR_SETROP2
      21: "processEmfSetStretchBltMode",
      // EMR_SETSTRETCHBLTMODE
      22: "processEmfSetTextAlign",
      // EMR_SETTEXTALIGN
      23: "processEmfSetColorAdjustment",
      // EMR_SETCOLORADJUSTMENT
      24: "processEmfSetTextColor",
      // EMR_SETTEXTCOLOR
      25: "processEmfSetBkColor",
      // EMR_SETBKCOLOR
      26: "processEmfOffsetClipRgn",
      // EMR_OFFSETCLIPRGN
      28: "processEmfSetMetaRgn",
      // EMR_SETMETARGN
      29: "processEmfExcludeClipRect",
      // EMR_EXCLUDECLIPRECT
      30: "processEmfIntersectClipRect",
      // EMR_INTERSECTCLIPRECT
      31: "processEmfScaleViewportExtEx",
      // EMR_SCALEVIEWPORTEXTEX
      32: "processEmfScaleWindowExtEx",
      // EMR_SCALEWINDOWEXTEX
      33: "processEmfSaveDC",
      // EMR_SAVEDC
      34: "processEmfRestoreDC",
      // EMR_RESTOREDC
      35: "processEmfSetWorldTransform",
      // EMR_SETWORLDTRANSFORM
      36: "processEmfModifyWorldTransform",
      // EMR_MODIFYWORLDTRANSFORM
      57: "processEmfSetArcDirection",
      // EMR_SETARCDIRECTION
      58: "processEmfSetMiterLimit",
      // EMR_SETMITERLIMIT
      // ========== 对象记录 (Object Records) ==========
      37: "processEmfSelectObject",
      // EMR_SELECTOBJECT
      38: "processEmfCreatePen",
      // EMR_CREATEPEN
      39: "processEmfCreateBrushIndirect",
      // EMR_CREATEBRUSHINDIRECT
      40: "processEmfDeleteObject",
      // EMR_DELETEOBJECT
      93: "processEmfCreateMonoBrush",
      // EMR_CREATEMONOBRUSH
      95: "processEmfExtCreatePen",
      // EMR_EXTCREATEPEN
      82: "processEmfExtCreateFontIndirectW",
      // EMR_EXTCREATEFONTINDIRECTW
      99: "processEmfCreateColorSpaceW",
      // EMR_CREATECOLORSPACE
      // ========== 调色板记录 (Palette Records) ==========
      48: "processEmfSelectPalette",
      // EMR_SELECTPALETTE
      49: "processEmfCreatePalette",
      // EMR_CREATEPALETTE
      50: "processEmfSetPaletteEntries",
      // EMR_SETPALETTEENTRIES
      51: "processEmfResizePalette",
      // EMR_RESIZEPALETTE
      52: "processEmfRealizePalette",
      // EMR_REALIZEPALETTE
      53: "processEmfExtFloodFill",
      // EMR_EXTFLOODFILL
      // ========== 位图记录 (Bitmap Records) ==========
      // 五种记录字段布局各不相同（MS-EMF 2.3.1），必须分别解析，
      // 位图数据一律按 offBmiSrc/offBitsSrc 精确定位（相对记录起始，含 8 字节 EMR 头）。
      76: "processEmfBitBlt",
      // EMR_BITBLT
      77: "processEmfStretchBlt",
      // EMR_STRETCHBLT
      81: "processEmfStretchDibBits",
      // EMR_STRETCHDIBITS
      114: "processEmfAlphaBlend",
      // EMR_ALPHABLEND
      116: "processEmfTransparentBlt",
      // EMR_TRANSPARENTBLT
      // ========== 文本记录 (Text Records) ==========
      83: "processEmfExtTextOutA",
      // EMR_EXTTEXTOUTA
      84: "processEmfExtTextOutW",
      // EMR_EXTTEXTOUTW
      108: "processEmfSmallTextOut",
      // EMR_SMALLTEXTOUT
      // ========== 16 位绘图记录 ==========
      85: "processEmfPolyBezier16",
      // EMR_POLYBEZIER16
      86: "processEmfPolygon16",
      // EMR_POLYGON16
      87: "processEmfPolyline16",
      // EMR_POLYLINE16
      88: "processEmfPolyBezierTo16",
      // EMR_POLYBEZIERTO16
      89: "processEmfPolyLineTo16",
      // EMR_POLYLINETO16
      90: "processEmfPolyPolyline16",
      // EMR_POLYPOLYLINE16
      91: "processEmfPolyPolygon16",
      // EMR_POLYPOLYGON16
      92: "processEmfPolyDraw16",
      // EMR_POLYDRAW16
      // ========== 裁剪记录 ==========
      67: "processEmfSelectClipPath",
      // EMR_SELECTCLIPPATH
      75: null,
      // EMR_EXTSELECTCLIPRGN（暂跳过）
      // ========== 已识别但无需处理 ==========
      70: "processEmfGdiComment",
      // EMR_GDICOMMENT（含 EMF+ 内嵌数据时派发）
      71: null,
      // EMR_FILLRGN（区域绘制依赖 region 对象，暂跳过）
      72: null,
      // EMR_FRAMERGN
      73: null,
      // EMR_INVERTRGN
      74: null,
      // EMR_PAINTRGN
      78: null,
      // EMR_MASKBLT
      79: null,
      // EMR_PLGBLT
      80: null,
      // EMR_SETDIBITSTODEVICE
      109: null,
      // EMR_FORCEUFIMAPPING（仅影响字体匹配）
      110: null,
      // EMR_NAMEDESCAPE
      118: null
      // EMR_GRADIENTFILL
    };
    var EmfDrawer2 = class {
      constructor(ctx) {
        this.ctx = ctx;
        this.coordinateTransformer = new CoordinateTransformer2();
        this.gdiObjectManager = new GdiObjectManager2();
        this.currentPath = [];
        this.pathState = "idle";
        this.fillColor = "#000000";
        this.strokeColor = "#000000";
        this.lineWidth = 1;
        this.arcDirection = 1;
        this._penIsBlack = true;
        this._penStockBlack = true;
        this._penNull = false;
        this.textColor = "#000000";
        this.dcStateStack = [];
        this.currentPos = { x: 0, y: 0 };
        this._emfPlusDrawer = null;
      }
      draw(metafileData, options = {}) {
        __wmfEmfRendererLog("Drawing EMF with header:", metafileData.header);
        __wmfEmfRendererLog("Number of records:", metafileData.records.length);
        const viewWidth = options.viewWidth || 800;
        const viewHeight = options.viewHeight || 600;
        let canvasWidth, canvasHeight;
        if (metafileData.header.bounds) {
          const bounds = metafileData.header.bounds;
          const bW = Math.abs(bounds.right - bounds.left);
          const bH = Math.abs(bounds.bottom - bounds.top);
          canvasWidth = Math.max(1, Math.round(bW));
          canvasHeight = Math.max(1, Math.round(bH));
          this.coordinateTransformer.setDeviceOrg(bounds.left, bounds.top);
          this.coordinateTransformer.setWindowOrg(0, 0);
          this.coordinateTransformer.setWindowExt(canvasWidth, canvasHeight);
          this.coordinateTransformer.setViewportOrg(0, 0);
          this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
          this._fileWindowExtX = canvasWidth;
          this._fileWindowExtY = canvasHeight;
          this._fileViewportExtX = canvasWidth;
          this._fileViewportExtY = canvasHeight;
          __wmfEmfRendererLog("Canvas(device):", canvasWidth, "x", canvasHeight);
        } else {
          canvasWidth = viewWidth;
          canvasHeight = viewHeight;
        }
        const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
        this.devicePixelRatio = dpr;
        this.ctx.canvas.width = Math.round(canvasWidth * dpr);
        this.ctx.canvas.height = Math.round(canvasHeight * dpr);
        this._canvasW = canvasWidth;
        this._canvasH = canvasHeight;
        const _initW = metafileData.header.bounds && metafileData.header.bounds.right - metafileData.header.bounds.left || canvasWidth;
        const _initH = metafileData.header.bounds && metafileData.header.bounds.bottom - metafileData.header.bounds.top || canvasHeight;
        this._fileWindowExtX = _initW;
        this._fileWindowExtY = _initH;
        this._fileViewportExtX = _initW;
        this._fileViewportExtY = _initH;
        if (metafileData.header.szlDevice && metafileData.header.szlMillimeters) {
          const mmX = metafileData.header.szlMillimeters.cx || metafileData.header.szlMillimeters.cy || 1;
          const pxX = metafileData.header.szlDevice.cx || metafileData.header.szlDevice.cy || 1;
          this.coordinateTransformer.setPxPerMm(pxX / mmX);
        }
        this.ctx.canvas.style.width = canvasWidth + "px";
        this.ctx.canvas.style.height = canvasHeight + "px";
        this.ctx.scale(dpr, dpr);
        __wmfEmfRendererLog("Canvas size set to:", canvasWidth, "x", canvasHeight, "(DPR:", dpr, ", actual:", this.ctx.canvas.width, "x", this.ctx.canvas.height + ")");
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        __wmfEmfRendererLog("Canvas cleared");
        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.lineWidth = 1;
        this.fillColor = "#ffffff";
        this.strokeColor = "#000000";
        __wmfEmfRendererLog("Drawing styles set");
        this.currentPath = [];
        this.pathState = "idle";
        this.currentPos = { x: 0, y: 0 };
        const debugLogs = globalThis.__WMF_DEBUG__;
        for (let i = 0; i < metafileData.records.length; i++) {
          const record = metafileData.records[i];
          this._recSinceGdiC = (this._recSinceGdiC == null ? 999 : this._recSinceGdiC) + 1;
          if (record.type === 70) this._recSinceGdiC = 0;
          if (debugLogs) {
            __wmfEmfRendererLog("Processing EMF record", i, ":", record.type, "(0x" + record.type.toString(16).padStart(8, "0") + ")");
          }
          this.processEmfRecordType(record.type, record.data);
        }
        this.finishPath();
        __wmfEmfRendererLog("EMF drawing completed");
      }
      processEmfRecordType(recordType, data) {
        const handlerName = EMF_RECORD_HANDLERS[recordType];
        if (handlerName !== void 0) {
          if (handlerName !== null) {
            this[handlerName](data);
          }
          return;
        }
        __wmfEmfRendererLog("Unknown EMF record type:", recordType, "(0x" + recordType.toString(16).padStart(8, "0") + ")");
        this.tryProcessAsCoordinates(data);
      }
      // 辅助方法：从数据中读取DWORD（4字节无符号整数）
      readDwordFromData(data, offset) {
        if (offset + 4 > data.length) return 0;
        return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
      }
      // 辅助方法：从数据中读取有符号LONG（4字节有符号整数）
      readLongFromData(data, offset) {
        if (offset + 4 > data.length) return 0;
        const value = data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
        return value > 2147483647 ? value - 4294967296 : value;
      }
      // 辅助方法：将RGB颜色值转换为十六进制字符串
      rgbToHex(rgb) {
        const r = (rgb & 255).toString(16).padStart(2, "0");
        const g = (rgb >> 8 & 255).toString(16).padStart(2, "0");
        const b = (rgb >> 16 & 255).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      // 应用GDI对象样式
      applyGdiObject(obj) {
        if (obj.type === "pen") {
          const isNullPen = obj.style === 5 || obj.color === "transparent";
          this._penNull = isNullPen;
          this._penIsBlack = isNullPen || /^(#000000|#000|black)$/i.test(obj.color || "");
          if (!obj._isStockPen) this._penStockBlack = false;
          this.ctx.strokeStyle = isNullPen ? "transparent" : obj.color;
          if (!isNullPen) {
            const scale = this.coordinateTransformer.getScale();
            const w = obj.width || 1;
            this.ctx.lineWidth = Math.max(1, Math.round(w * Math.abs(scale.x || 1)));
            const ps = obj.style & 15;
            let dash = [];
            if (ps === 1) dash = [3 * w, 1 * w];
            else if (ps === 2) dash = [1 * w, 1 * w];
            else if (ps === 3) dash = [3 * w, 1 * w, 1 * w, 1 * w];
            else if (ps === 4) dash = [3 * w, 1 * w, 1 * w, 1 * w, 1 * w, 1 * w];
            if (typeof this.ctx.setLineDash === "function") this.ctx.setLineDash(dash);
          } else {
            if (typeof this.ctx.setLineDash === "function") this.ctx.setLineDash([]);
          }
        } else if (obj.type === "brush") {
          this.ctx.fillStyle = obj.url || (obj.color === "transparent" ? "transparent" : obj.color);
        } else if (obj.type === "font" && obj.faceName) {
          const scale = this.coordinateTransformer.getScale();
          const size = Math.max(1, Math.round(Math.abs(obj.height || 12) * Math.abs(scale.y || 1)));
          const weight = (obj.weight || 400) >= 700 ? "bold " : "";
          const italic = obj.italic ? "italic " : "";
          this.ctx.font = `${italic}${weight}${size}px "${obj.faceName || "sans-serif"}"`;
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
          2147483648: { type: "brush", color: "#ffffff" },
          // WHITE_BRUSH
          2147483649: { type: "brush", color: "#c0c0c0" },
          // LTGRAY_BRUSH
          2147483650: { type: "brush", color: "#808080" },
          // GRAY_BRUSH
          2147483651: { type: "brush", color: "#404040" },
          // DKGRAY_BRUSH
          2147483652: { type: "brush", color: "#000000" },
          // BLACK_BRUSH
          2147483653: { type: "brush", color: "transparent" },
          // NULL_BRUSH (HOLLOW)
          2147483654: { type: "pen", color: "#ffffff", width: 1 },
          // WHITE_PEN
          2147483655: { type: "pen", color: "#000000", width: 1 },
          // BLACK_PEN
          2147483656: { type: "pen", color: "transparent", width: 0 },
          // NULL_PEN
          2147483661: { type: "font", height: -12, weight: 700, faceName: "System" },
          // SYSTEM_FONT
          2147483665: { type: "font", height: -12, weight: 400, faceName: "MS Shell Dlg" }
          // DEFAULT_GUI_FONT
        };
        const obj = stockObjects[handle];
        if (obj) {
          if (obj.type === "pen") this._penStockBlack = obj.width === 1 && /^(#000000|black)$/i.test(obj.color || "");
          obj._isStockPen = true;
          this.applyGdiObject(obj);
        }
      }
      // 以下是具体的EMF处理方法
      processEmfHeader(data) {
        __wmfEmfRendererLog("Processing EMF header");
      }
      processEmfPolyBezier(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("Processing EMF PolyBezier, count:", count);
        if (data.length < 20 + count * 8) return;
        if (count >= 4 && count % 3 === 1) {
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
                points[i].x,
                points[i].y,
                points[i + 1].x,
                points[i + 1].y,
                points[i + 2].x,
                points[i + 2].y
              );
            }
          }
          this.ctx.stroke();
        }
      }
      processEmfPolygon(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("Processing EMF Polygon, count:", count);
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
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("Processing EMF Polyline, count:", count);
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
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("Processing EMF PolyBezierTo, count:", count);
        if (data.length < 20 + count * 8 || count % 3 !== 0) return;
        const points = [];
        for (let i = 0; i < count; i++) {
          const x = this.readLongFromData(data, 20 + i * 8);
          const y = this.readLongFromData(data, 24 + i * 8);
          const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
          points.push(transformed);
        }
        this.ctx.beginPath();
        const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.moveTo(start.x, start.y);
        for (let i = 0; i < points.length; i += 3) {
          if (i + 2 < points.length) {
            this.ctx.bezierCurveTo(
              points[i].x,
              points[i].y,
              points[i + 1].x,
              points[i + 1].y,
              points[i + 2].x,
              points[i + 2].y
            );
          }
        }
        this.ctx.stroke();
        const last = points[points.length - 1];
        if (last) {
          this.currentPos = {
            x: this.readLongFromData(data, 20 + (count - 1) * 8),
            y: this.readLongFromData(data, 24 + (count - 1) * 8)
          };
        }
      }
      processEmfPolylineTo(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("Processing EMF PolylineTo, count:", count);
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
        if (data.length < 24) return;
        const numberOfPolylines = this.readDwordFromData(data, 16);
        const totalCount = this.readDwordFromData(data, 20);
        __wmfEmfRendererLog("Processing EMF PolyPolyline, polylines:", numberOfPolylines, "total points:", totalCount);
        if (data.length < 24 + numberOfPolylines * 4 + totalCount * 8) return;
        const counts = [];
        for (let i = 0; i < numberOfPolylines; i++) {
          counts.push(this.readDwordFromData(data, 24 + i * 4));
        }
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
        if (data.length < 24) return;
        const numberOfPolygons = this.readDwordFromData(data, 16);
        const totalCount = this.readDwordFromData(data, 20);
        __wmfEmfRendererLog("Processing EMF PolyPolygon, polygons:", numberOfPolygons, "total points:", totalCount);
        if (data.length < 24 + numberOfPolygons * 4 + totalCount * 8) return;
        const counts = [];
        for (let i = 0; i < numberOfPolygons; i++) {
          counts.push(this.readDwordFromData(data, 24 + i * 4));
        }
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
          this._afterFillShape();
        }
      }
      // ============ EMR_*16 系列（16 位坐标变体，MS-EMF 2.3.5）============
      // 与 32 位版本结构相同，区别仅在于 aPoints 每点 4 字节（x/y 为 16 位有符号整数）
      readInt16FromData(data, offset) {
        if (offset + 2 > data.length) return 0;
        const value = data[offset] | data[offset + 1] << 8;
        return value > 32767 ? value - 65536 : value;
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
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        if (count < 3 || data.length < 20 + count * 4) return;
        const points = this.readPoints16(data, 20, count);
        this.ctx.beginPath();
        points.forEach((p, i) => i === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y));
        this.ctx.closePath();
        this.ctx.fill();
        this._afterFillShape();
      }
      processEmfPolyline16(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        if (count < 2 || data.length < 20 + count * 4) return;
        const points = this.readPoints16(data, 20, count);
        this.ctx.beginPath();
        points.forEach((p, i) => i === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y));
        this.ctx.stroke();
      }
      processEmfPolyBezierTo16(data) {
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
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        if (count < 1 || data.length < 20 + count * 4) return;
        const points = this.readPoints16(data, 20, count);
        this.ctx.beginPath();
        const start = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.moveTo(start.x, start.y);
        points.forEach((p) => this.ctx.lineTo(p.x, p.y));
        this.ctx.stroke();
        this.currentPos = {
          x: this.readInt16FromData(data, 20 + (count - 1) * 4),
          y: this.readInt16FromData(data, 20 + (count - 1) * 4 + 2)
        };
      }
      processEmfPolyPolyline16(data) {
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
          points.forEach((p, j) => j === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y));
          this.ctx.stroke();
        }
      }
      processEmfPolyPolygon16(data) {
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
          points.forEach((p, j) => j === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y));
          this.ctx.closePath();
          this.ctx.fill();
          this._afterFillShape();
        }
      }
      processEmfPolyDraw16(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        if (data.length < 20 + count * 5) return;
        for (let i = 0; i < count; i++) {
          const p = this.readPoints16(data, 20 + i * 4, 1)[0];
          const type = data[20 + count * 4 + i];
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
        if (data.length < 40) return;
        const ihPen = this.readDwordFromData(data, 0);
        if ((ihPen & 2147483648) !== 0) return;
        const style = this.readDwordFromData(data, 20);
        const width = this.readDwordFromData(data, 24);
        const brushStyle = this.readDwordFromData(data, 28);
        const color = this.readDwordFromData(data, 32);
        const elpHatch = this.readLongFromData(data, 36);
        let penColor;
        if (brushStyle === 2 && (elpHatch === 8 || elpHatch === 9)) penColor = this.textColor;
        else if (brushStyle === 2 && (elpHatch === 10 || elpHatch === 11)) penColor = this.fillColor;
        else penColor = this.rgbToHex(color);
        this.gdiObjectManager.createObjectAt(ihPen, { type: "pen", style, width, color: penColor });
        __wmfEmfRendererLog("EMR_EXTCREATEPEN: ih=", ihPen, "style:", style, "width:", width, "color:", penColor);
      }
      processEmfSmallTextOut(data) {
        if (data.length < 28) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const cChars = this.readDwordFromData(data, 8);
        const options = this.readDwordFromData(data, 12);
        const ETO_NO_RECT = 256;
        const ETO_SMALL_CHARS = 512;
        const charWidth = options & ETO_SMALL_CHARS ? 2 : 1;
        let stringOffset = options & ETO_NO_RECT ? 28 : 44;
        if (cChars === 0 || stringOffset + cChars * charWidth > data.length) return;
        let text = "";
        for (let i = 0; i < cChars; i++) {
          if (charWidth === 2) {
            text += String.fromCharCode(data[stringOffset + i * 2] | data[stringOffset + i * 2 + 1] << 8);
          } else {
            text += String.fromCharCode(data[stringOffset + i]);
          }
        }
        if (options & 2 && !(options & ETO_NO_RECT) && data.length >= 44) {
          const bg1 = this.coordinateTransformer.transform(this.readLongFromData(data, 28), this.readLongFromData(data, 32), this.ctx.canvas.width, this.ctx.canvas.height);
          const bg2 = this.coordinateTransformer.transform(this.readLongFromData(data, 36), this.readLongFromData(data, 40), this.ctx.canvas.width, this.ctx.canvas.height);
          const bgW = Math.abs(bg2.x - bg1.x);
          const bgH = Math.abs(bg2.y - bg1.y);
          if (bgW > 0 && bgH > 0) {
            const savedFillStyle2 = this.ctx.fillStyle;
            this.ctx.fillStyle = this.fillColor;
            this.ctx.fillRect(Math.min(bg1.x, bg2.x), Math.min(bg1.y, bg2.y), bgW, bgH);
            this.ctx.fillStyle = savedFillStyle2;
          }
        }
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        const savedFillStyle = this.ctx.fillStyle;
        this.ctx.fillStyle = this.textColor;
        this.ctx.fillText(text, transformed.x, transformed.y);
        this.ctx.fillStyle = savedFillStyle;
        __wmfEmfRendererLog("EMR_SMALLTEXTOUT:", x, y, "text:", text.substring(0, 50));
      }
      // 处理 EMR_GDICOMMENT：EMF+ 数据经此内嵌于标准 EMF 记录流（Windows 按记录序交织播放）。
      // data（record.data，已剥离 8 字节 EMR 头）布局：[DataSize(4)] [CommentIdentifier(4)] [EMF+ 记录...]
      processEmfGdiComment(data) {
        if (!data || data.length < 8) return;
        if (this.readDwordFromData(data, 4) !== 726027589) return;
        try {
          const parser = new EmfPlusParser2(data);
          const emfPlusRecords = parser.parseEmfPlusRecords(data);
          if (emfPlusRecords.length === 0) return;
          if (!this._emfPlusDrawer) {
            this._emfPlusDrawer = new EmfPlusDrawer2(this.ctx);
            this._emfPlusDrawer.coordinateTransformer = this.coordinateTransformer;
          }
          for (const rec of emfPlusRecords) {
            this._emfPlusDrawer.processEmfPlusRecordType(rec.type, rec.flags, rec.data);
          }
        } catch (e) {
          __wmfEmfRendererLog("EMF+ GDIComment playback failed:", e.message);
        }
      }
      processEmfSetWindowExtEx(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        __wmfEmfRendererLog("EMF SetWindowExtEx:", x, y);
        this._fileWindowExtX = x || 1;
        this._fileWindowExtY = y || 1;
        this.coordinateTransformer.setWindowExt(this._fileWindowExtX, this._fileWindowExtY);
      }
      processEmfSetWindowOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        __wmfEmfRendererLog("EMF SetWindowOrgEx:", x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
      }
      processEmfSetViewportExtEx(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        __wmfEmfRendererLog("EMF SetViewportExtEx:", x, y);
        this._fileViewportExtX = x || 1;
        this._fileViewportExtY = y || 1;
        this.coordinateTransformer.setViewportExt(x, y);
      }
      processEmfSetViewportOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        __wmfEmfRendererLog("EMF SetViewportOrgEx:", x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
      }
      processEmfSetBrushOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        __wmfEmfRendererLog("EMF SetBrushOrgEx:", x, y);
      }
      processEmfSetMapMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        this.coordinateTransformer.setMapMode(mode);
        __wmfEmfRendererLog("EMF SetMapMode:", mode);
      }
      processEmfSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.textColor = this.rgbToHex(color);
        __wmfEmfRendererLog("EMF SetTextColor:", color, "->", this.textColor);
      }
      processEmfSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.fillColor = this.rgbToHex(color);
        this.ctx.fillStyle = this.fillColor;
        __wmfEmfRendererLog("EMF SetBkColor:", color, "->", this.fillColor);
      }
      processEmfMoveToEx(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        this.currentPos = { x, y };
        __wmfEmfRendererLog("EMF MoveToEx:", x, y);
      }
      processEmfRestoreDC(data) {
        if (data.length < 4) return;
        const savedDC = this.readDwordFromData(data, 0);
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
        __wmfEmfRendererLog("EMF RestoreDC:", savedDC, "count:", count);
      }
      processEmfSelectObject(data) {
        if (data.length < 4) return;
        const objectHandle = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SelectObject:", objectHandle);
        const obj = this.gdiObjectManager.selectObject(objectHandle);
        if (obj) {
          this.applyGdiObject(obj);
        } else if (objectHandle >>> 0 >= 2147483648) {
          this.applyStockObject(objectHandle >>> 0);
        }
      }
      processEmfCreatePen(data) {
        if (data.length < 20) return;
        const ihPen = this.readDwordFromData(data, 0);
        if ((ihPen & 2147483648) !== 0) return;
        const penStyle = this.readDwordFromData(data, 4);
        const width = this.readLongFromData(data, 8);
        const color = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("EMF CreatePen: ih=", ihPen, "style:", penStyle, "width:", width, "color:", color.toString(16));
        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createObjectAt(ihPen, { type: "pen", style: penStyle, width, color: penColor });
      }
      processEmfCreateBrushIndirect(data) {
        if (data.length < 16) return;
        const ihBrush = this.readDwordFromData(data, 0);
        if ((ihBrush & 2147483648) !== 0) return;
        const brushStyle = this.readDwordFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        const hatch = this.readLongFromData(data, 12);
        __wmfEmfRendererLog("EMF CreateBrushIndirect: ih=", ihBrush, "style:", brushStyle, "color:", color.toString(16), "hatch:", hatch);
        let brushColor = this.rgbToHex(color);
        if (brushStyle === 2) {
          if (hatch === 8 || hatch === 9) brushColor = this.textColor;
          else if (hatch === 10 || hatch === 11) brushColor = this.fillColor;
        }
        this.gdiObjectManager.createObjectAt(ihBrush, {
          type: "brush",
          style: brushStyle,
          color: brushStyle === 1 ? "transparent" : brushColor
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
        this.ctx.fill();
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
        __wmfEmfRendererLog("EMF Rectangle:", x, y, width, height);
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.fill();
        this.ctx.stroke();
      }
      processEmfLineTo(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const from = this.coordinateTransformer.transform(this.currentPos.x, this.currentPos.y, this.ctx.canvas.width, this.ctx.canvas.height);
        const to = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
        this.currentPos = { x, y };
        __wmfEmfRendererLog("EMF LineTo:", x, y);
      }
      processEmfBeginPath(data) {
        __wmfEmfRendererLog("EMF BeginPath");
        this.ctx.beginPath();
        this.pathState = "active";
      }
      processEmfEndPath(data) {
        __wmfEmfRendererLog("EMF EndPath");
        this.pathState = "completed";
      }
      processEmfStrokeAndFillPath(data) {
        __wmfEmfRendererLog("EMF StrokeAndFillPath");
        const skipFill = (this._recSinceGdiC || 999) < 30 && this._isGrayFillStyle();
        if (skipFill) {
          __wmfEmfRendererLog("  skip fill (GDI+ \u540E\u7ED8\u56FE\u533A\u80CC\u666F)");
        } else {
          this.ctx.fill();
        }
        this.ctx.stroke();
        this.pathState = "idle";
      }
      // 当前 ctx.fillStyle 是否为纯灰色（R===G===B），用于识别绘图区背景 fill
      _isGrayFillStyle() {
        const s = this.ctx && this.ctx.fillStyle;
        if (!s || typeof s !== "string") return false;
        if (s.startsWith("#") && s.length === 7) {
          const r = parseInt(s.slice(1, 3), 16);
          const g = parseInt(s.slice(3, 5), 16);
          const b = parseInt(s.slice(5, 7), 16);
          return r === g && g === b;
        }
        return false;
      }
      processEmfStrokePath(data) {
        __wmfEmfRendererLog("EMF StrokePath");
        this.ctx.stroke();
        this.pathState = "idle";
      }
      processEmfAbortPath(data) {
        __wmfEmfRendererLog("EMF AbortPath");
        this.pathState = "idle";
      }
      processEmfSetBkMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetBkMode:", mode);
      }
      processEmfSetRop2(data) {
        if (data.length < 4) return;
        const rop2 = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetRop2:", rop2);
      }
      processEmfSetStretchBltMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetStretchBltMode:", mode);
      }
      processEmfSetTextAlign(data) {
        if (data.length < 4) return;
        const align = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetTextAlign:", align);
        const horiz = align & 6;
        if (horiz === 2) {
          this.ctx.textAlign = "right";
        } else if (horiz === 6) {
          this.ctx.textAlign = "center";
        } else {
          this.ctx.textAlign = "left";
        }
        const vert = align & 24;
        if (vert === 8) {
          this.ctx.textBaseline = "bottom";
        } else if (vert === 24) {
          this.ctx.textBaseline = "alphabetic";
        } else {
          this.ctx.textBaseline = "top";
        }
      }
      processEmfDeleteObject(data) {
        if (data.length < 4) return;
        const objectHandle = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF DeleteObject:", objectHandle);
        this.gdiObjectManager.deleteObject(objectHandle);
      }
      processEmfExtCreateFontIndirectW(data) {
        if (data.length < 12) return;
        const ihFont = this.readDwordFromData(data, 0);
        if ((ihFont & 2147483648) !== 0) return;
        const lfOff = 4;
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
        let faceName = "";
        for (let i = 0; i < 32; i++) {
          const ch = data[lfOff + 28 + i * 2] | data[lfOff + 28 + i * 2 + 1] << 8;
          if (ch === 0) break;
          faceName += String.fromCharCode(ch);
        }
        __wmfEmfRendererLog("EMF ExtCreateFontIndirectW: ih=", ihFont, "height:", height, "width:", width, "weight:", weight, "face:", faceName, "escapement:", escapement);
        this.gdiObjectManager.createObjectAt(ihFont, {
          type: "font",
          height,
          width,
          weight,
          italic,
          underline,
          strikeOut,
          faceName,
          charset,
          escapement,
          orientation
        });
      }
      processEmfExtTextOutA(data) {
        this.processEmfTextOut(data, false);
      }
      processEmfExtTextOutW(data) {
        this.processEmfTextOut(data, true);
      }
      processEmfTextOut(data, isUnicode) {
        if (data.length < 76) return;
        const x = this.readLongFromData(data, 28);
        const y = this.readLongFromData(data, 32);
        const stringLength = this.readDwordFromData(data, 36);
        const offString = this.readDwordFromData(data, 40);
        const options = this.readDwordFromData(data, 44);
        const stringOffset = offString - 8;
        __wmfEmfRendererLog(`EMF ExtTextOut${isUnicode ? "W" : "A"}:`, x, y, "length:", stringLength, "offString:", offString, "options:", options);
        if (stringLength > 0 && stringOffset >= 0 && stringOffset < data.length) {
          let text = "";
          try {
            if (isUnicode && stringOffset + stringLength * 2 <= data.length) {
              for (let i = 0; i < stringLength; i++) {
                const charCode = data[stringOffset + i * 2] | data[stringOffset + i * 2 + 1] << 8;
                if (charCode > 0) {
                  text += String.fromCharCode(charCode);
                }
              }
            } else if (!isUnicode && stringOffset + stringLength <= data.length) {
              for (let i = 0; i < stringLength; i++) {
                text += String.fromCharCode(data[stringOffset + i]);
              }
            }
            if (text.length > 0) {
              const savedFillStyle = this.ctx.fillStyle;
              if ((options & 2) !== 0 && data.length >= 64) {
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
              this.ctx.fillStyle = this.textColor;
              const curFont = this.gdiObjectManager && this.gdiObjectManager.currentFont;
              const rawHeight = curFont && curFont.height ? Math.abs(curFont.height) : 12;
              const escapement = curFont && curFont.escapement ? curFont.escapement : 0;
              const savedFont = this.ctx.font;
              {
                const weight = curFont && curFont.weight >= 700 ? "bold " : "";
                const italic = curFont && curFont.italic ? "italic " : "";
                const face = curFont && curFont.faceName ? curFont.faceName : "sans-serif";
                this.ctx.font = `${italic}${weight}${rawHeight}px "${face}"`;
              }
              let matrix = this.coordinateTransformer.getSvgMatrix();
              if (escapement !== 0) {
                const deg = -escapement / 10;
                const rad = deg * Math.PI / 180;
                const cos = Math.cos(rad), sin = Math.sin(rad);
                const px = x, py = y;
                const r = { a: cos, b: sin, c: -sin, d: cos, e: px - px * cos + py * sin, f: py - px * sin - py * cos };
                matrix = {
                  a: matrix.a * r.a + matrix.c * r.b,
                  b: matrix.b * r.a + matrix.d * r.b,
                  c: matrix.a * r.c + matrix.c * r.d,
                  d: matrix.b * r.c + matrix.d * r.d,
                  e: matrix.a * r.e + matrix.c * r.f + matrix.e,
                  f: matrix.b * r.e + matrix.d * r.f + matrix.f
                };
              }
              this.ctx.fillText(text, x, y, matrix);
              this.ctx.font = savedFont;
              this.ctx.fillStyle = savedFillStyle;
              __wmfEmfRendererLog("  Rendered text:", text.substring(0, 50));
            }
          } catch (error) {
            __wmfEmfRendererLog("  Error reading text:", error.message);
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
          const bmi = offBmi - 8;
          const bits = offBits - 8;
          if (bmi < 0 || bmi + 40 > data.length) return null;
          const biSize = this.readDwordFromData(data, bmi);
          const biWidth = this.readLongFromData(data, bmi + 4);
          const biHeightRaw = this.readLongFromData(data, bmi + 8);
          const biPlanes = data[bmi + 12] | data[bmi + 13] << 8;
          const biBitCount = data[bmi + 14] | data[bmi + 15] << 8;
          const biCompression = this.readDwordFromData(data, bmi + 16);
          const biClrUsed = this.readDwordFromData(data, bmi + 32);
          if (biPlanes !== 1 || biWidth <= 0 || biWidth > 2e4 || Math.abs(biHeightRaw) > 2e4) return null;
          const width = biWidth;
          const height = Math.abs(biHeightRaw);
          const topDown = biHeightRaw < 0;
          if (width * height > 1572864) return null;
          const palCount = biBitCount <= 8 ? biClrUsed || 1 << biBitCount : 0;
          const palette = [];
          for (let i = 0; i < palCount; i++) {
            const o = bmi + biSize + i * 4;
            if (o + 4 > data.length) break;
            palette.push([data[o + 2], data[o + 1], data[o], 255]);
          }
          const out = new Uint8ClampedArray(width * height * 4);
          const end = Math.min(data.length, bits + cbBits);
          const transparent = opts.transparentColor;
          const tr = transparent !== void 0 ? transparent & 255 : -1;
          const tg = transparent !== void 0 ? transparent >> 8 & 255 : -1;
          const tb = transparent !== void 0 ? transparent >> 16 & 255 : -1;
          const useAlpha = !!opts.alphaFromPixels;
          const constantAlpha = opts.constantAlpha !== void 0 ? opts.constantAlpha : 255;
          const putPx = (x, y, r, g, b, a) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return;
            if (r === tr && g === tg && b === tb) a = 0;
            if (constantAlpha < 255) a = a * constantAlpha / 255;
            const o = (y * width + x) * 4;
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = a;
          };
          if (biCompression === 0 || biCompression === 3) {
            const rowSize = Math.ceil(width * biBitCount / 32) * 4;
            for (let y = 0; y < height; y++) {
              const srcY = topDown ? y : height - 1 - y;
              const rowOff = bits + srcY * rowSize;
              for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 255;
                if (biBitCount === 1) {
                  const o = rowOff + (x >> 3);
                  if (o >= end) continue;
                  const idx = data[o] >> 7 - (x & 7) & 1;
                  const c = palette[idx] || [0, 0, 0, 255];
                  r = c[0];
                  g = c[1];
                  b = c[2];
                } else if (biBitCount === 4) {
                  const o = rowOff + (x >> 1);
                  if (o >= end) continue;
                  const idx = (x & 1) === 0 ? data[o] >> 4 : data[o] & 15;
                  const c = palette[idx] || [0, 0, 0, 255];
                  r = c[0];
                  g = c[1];
                  b = c[2];
                } else if (biBitCount === 8) {
                  const o = rowOff + x;
                  if (o >= end) continue;
                  const c = palette[data[o]] || [0, 0, 0, 255];
                  r = c[0];
                  g = c[1];
                  b = c[2];
                } else if (biBitCount === 16) {
                  const o = rowOff + x * 2;
                  if (o + 2 > end) continue;
                  const v = data[o] | data[o + 1] << 8;
                  r = (v >> 10 & 31) * 255 / 31;
                  g = (v >> 5 & 31) * 255 / 31;
                  b = (v & 31) * 255 / 31;
                } else if (biBitCount === 24) {
                  const o = rowOff + x * 3;
                  if (o + 3 > end) continue;
                  b = data[o];
                  g = data[o + 1];
                  r = data[o + 2];
                } else if (biBitCount === 32) {
                  const o = rowOff + x * 4;
                  if (o + 4 > end) continue;
                  b = data[o];
                  g = data[o + 1];
                  r = data[o + 2];
                  a = useAlpha ? data[o + 3] : 255;
                }
                putPx(x, y, r, g, b, a);
              }
            }
          } else if (biCompression === 1 || biCompression === 2) {
            let pos = bits;
            let x = 0, y = height - 1;
            const horiz = biCompression === 2 ? 2 : 1;
            while (pos + 2 <= end && y >= 0) {
              const b0 = data[pos], b1 = data[pos + 1];
              pos += 2;
              if (b0 > 0) {
                for (let i = 0; i < b0; i++) {
                  let r, g, b;
                  if (biCompression === 1) {
                    const c = palette[b1] || [0, 0, 0, 255];
                    r = c[0];
                    g = c[1];
                    b = c[2];
                  } else {
                    const idx = (i & 1) === 0 ? b1 >> 4 : b1 & 15;
                    const c = palette[idx] || [0, 0, 0, 255];
                    r = c[0];
                    g = c[1];
                    b = c[2];
                  }
                  putPx(x + i, y, r, g, b, 255);
                }
                x += b0;
              } else if (b1 === 0) {
                x = 0;
                y--;
              } else if (b1 === 1) {
                break;
              } else if (b1 === 2) {
                if (pos + 2 > end) break;
                x += data[pos];
                y -= data[pos + 1];
                pos += 2;
              } else {
                const nbytes = biCompression === 1 ? b1 : Math.ceil(b1 / 2);
                if (pos + nbytes > end) break;
                for (let i = 0; i < b1; i++) {
                  let idx;
                  if (biCompression === 1) idx = data[pos + i];
                  else idx = (i & 1) === 0 ? data[pos + (i >> 1)] >> 4 : data[pos + (i >> 1)] & 15;
                  const c = palette[idx] || [0, 0, 0, 255];
                  putPx(x + i, y, c[0], c[1], c[2], 255);
                }
                x += b1;
                pos += nbytes + (nbytes & 1 ? 1 : 0);
              }
            }
          } else {
            return null;
          }
          return { width, height, data: out };
        } catch (e) {
          __wmfEmfRendererLog("DIB decode failed:", e.message);
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
        const canvasCtor = typeof document === "undefined" && this.ctx.canvas ? this.ctx.canvas.constructor : null;
        const isRealCanvasCtor = typeof canvasCtor === "function" && canvasCtor.name !== "Object";
        const tempCanvas = typeof document !== "undefined" ? document.createElement("canvas") : isRealCanvasCtor ? new canvasCtor(dib.width, dib.height) : null;
        if (tempCanvas) {
          tempCanvas.width = dib.width;
          tempCanvas.height = dib.height;
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.putImageData(this._wrapImageData(dib), 0, 0);
          this.ctx.drawImage(tempCanvas, x, y, w, h);
        } else {
          this.ctx.putImageData(this._wrapImageData(dib), x, y, w, h);
        }
        __wmfEmfRendererLog("  DIB drawn at:", x, y, w, h, "(source", dib.width, "x", dib.height + ")");
      }
      _wrapImageData(dib) {
        if (typeof ImageData !== "undefined") {
          try {
            return new ImageData(dib.data, dib.width, dib.height);
          } catch (e) {
          }
        }
        return { width: dib.width, height: dib.height, data: dib.data };
      }
      processEmfBitBlt(data) {
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
        __wmfEmfRendererLog("EMF BitBlt: dest=(", xDest, yDest, ")", cxDest, "x", cyDest, "rop=0x" + dwRop.toString(16));
        if (dwRop === 66) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#000000");
          return;
        }
        if (dwRop === 16711778) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#ffffff");
          return;
        }
        const dib = offBmi && cbBmi ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
        if (dib) {
          this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
        }
      }
      processEmfStretchBlt(data) {
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
        __wmfEmfRendererLog("EMF StretchBlt: dest=(", xDest, yDest, ")", cxDest, "x", cyDest, "src=(", xSrc, ySrc, ")", cxSrc, "x", cySrc);
        if (dwRop === 66) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#000000");
          return;
        }
        if (dwRop === 16711778) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#ffffff");
          return;
        }
        const dib = offBmi && cbBmi ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
        if (dib) {
          this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
        }
      }
      processEmfStretchDibBits(data) {
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
        if (cxDest === 0 && cxSrc) cxDest = cxSrc;
        if (cyDest === 0 && cySrc) cyDest = cySrc;
        __wmfEmfRendererLog("EMF StretchDIBits: dest=(", xDest, yDest, ")", cxDest, "x", cyDest, "src=(", xSrc, ySrc, ")", cxSrc, "x", cySrc);
        if (dwRop === 66) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#000000");
          return;
        }
        if (dwRop === 16711778) {
          this._fillBltRect(xDest, yDest, cxDest, cyDest, "#ffffff");
          return;
        }
        const dib = offBmi && cbBmi ? this._decodeDib(data, offBmi, cbBmi, offBits, cbBits) : null;
        if (dib) {
          let use = dib;
          if (cxSrc > 0 && cxSrc < dib.width || cySrc > 0 && cySrc < dib.height) {
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
        const alphaFormat = blendFn & 255;
        const constantAlpha = blendFn >>> 16 & 255;
        __wmfEmfRendererLog("EMF AlphaBlend: dest=(", xDest, yDest, ")", cxDest, "x", cyDest, "alphaFmt=", alphaFormat, "constA=", constantAlpha);
        const dib = offBmi && cbBmi ? this._decodeDib(
          data,
          offBmi,
          cbBmi,
          offBits,
          cbBits,
          { alphaFromPixels: alphaFormat === 1, constantAlpha }
        ) : null;
        if (dib) {
          this._drawDecodedDib(dib, xDest, yDest, cxDest, cyDest);
        }
      }
      processEmfTransparentBlt(data) {
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
        __wmfEmfRendererLog("EMF TransparentBlt: dest=(", xDest, yDest, ")", cxDest, "x", cyDest, "colorKey=0x" + transparentColor.toString(16));
        const dib = offBmi && cbBmi ? this._decodeDib(
          data,
          offBmi,
          cbBmi,
          offBits,
          cbBits,
          { transparentColor }
        ) : null;
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
        __wmfEmfRendererLog("EMF CreateMonoBrush");
        this.gdiObjectManager.createBrush(0, "#000000");
      }
      processEmfCreateColorSpaceW(data) {
        __wmfEmfRendererLog("EMF CreateColorSpaceW");
      }
      processEmfText(data) {
        this.processEmfTextOut(data, true);
      }
      // === 新增的EMF记录处理方法 ===
      processEmfSetPixelV(data) {
        if (data.length < 12) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        const hexColor = this.rgbToHex(color);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.fillStyle = hexColor;
        this.ctx.fillRect(transformed.x, transformed.y, 1, 1);
        __wmfEmfRendererLog("EMF SetPixelV:", x, y, hexColor);
      }
      processEmfSetMapperFlags(data) {
        if (data.length < 4) return;
        const flags = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetMapperFlags:", flags);
      }
      processEmfSetPolyFillMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SetPolyFillMode:", mode);
        if (mode === 1) {
          this.ctx.fillRule = "evenodd";
        } else if (mode === 2) {
          this.ctx.fillRule = "nonzero";
        }
      }
      processEmfSetColorAdjustment(data) {
        __wmfEmfRendererLog("EMF SetColorAdjustment");
      }
      processEmfOffsetClipRgn(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        __wmfEmfRendererLog("EMF OffsetClipRgn:", x, y);
      }
      processEmfSetMetaRgn(data) {
        __wmfEmfRendererLog("EMF SetMetaRgn");
      }
      processEmfExcludeClipRect(data) {
        if (data.length < 16) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        __wmfEmfRendererLog("EMF ExcludeClipRect:", left, top, right, bottom);
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
        __wmfEmfRendererLog("EMF IntersectClipRect:", left, top, right, bottom);
      }
      processEmfScaleViewportExtEx(data) {
        if (data.length < 16) return;
        const xNum = this.readLongFromData(data, 0);
        const xDenom = this.readLongFromData(data, 4);
        const yNum = this.readLongFromData(data, 8);
        const yDenom = this.readLongFromData(data, 12);
        __wmfEmfRendererLog("EMF ScaleViewportExtEx:", xNum, xDenom, yNum, yDenom);
      }
      processEmfScaleWindowExtEx(data) {
        if (data.length < 16) return;
        const xNum = this.readLongFromData(data, 0);
        const xDenom = this.readLongFromData(data, 4);
        const yNum = this.readLongFromData(data, 8);
        const yDenom = this.readLongFromData(data, 12);
        __wmfEmfRendererLog("EMF ScaleWindowExtEx:", xNum, xDenom, yNum, yDenom);
      }
      processEmfSaveDC(data) {
        this.ctx.save();
        this.dcStateStack.push(this._captureDcState());
        __wmfEmfRendererLog("EMF SaveDC");
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
          objectTable: this.gdiObjectManager ? new Map(this.gdiObjectManager.objectTable) : null,
          mapMode: ct.mapMode,
          windowOrgX: ct.windowOrgX,
          windowOrgY: ct.windowOrgY,
          windowExtX: ct.windowExtX,
          windowExtY: ct.windowExtY,
          viewportOrgX: ct.viewportOrgX,
          viewportOrgY: ct.viewportOrgY,
          viewportExtX: ct.viewportExtX,
          viewportExtY: ct.viewportExtY,
          worldM11: ct.worldM11,
          worldM12: ct.worldM12,
          worldM21: ct.worldM21,
          worldM22: ct.worldM22,
          worldDx: ct.worldDx,
          worldDy: ct.worldDy
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
        ct.worldM11 = state.worldM11;
        ct.worldM12 = state.worldM12;
        ct.worldM21 = state.worldM21;
        ct.worldM22 = state.worldM22;
        ct.worldDx = state.worldDx;
        ct.worldDy = state.worldDy;
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
        const v = (b[offset] | b[offset + 1] << 8 | b[offset + 2] << 16 | b[offset + 3] << 24) >>> 0;
        const sign = v & 2147483648 ? -1 : 1;
        const exp = v >>> 23 & 255;
        const frac = v & 8388607;
        if (exp === 255) return frac ? NaN : sign * Infinity;
        if (exp === 0) return frac === 0 ? sign * 0 : sign * frac * Math.pow(2, -149);
        return sign * (1 + frac / 8388608) * Math.pow(2, exp - 127);
      }
      processEmfSetWorldTransform(data) {
        if (data.length < 24) return;
        const xf = this._readXForm(data, 0);
        if (!xf) return;
        __wmfEmfRendererLog("EMF SetWorldTransform:", xf);
        this.coordinateTransformer.setWorldTransform(xf);
      }
      processEmfModifyWorldTransform(data) {
        if (data.length < 28) return;
        const xf = this._readXForm(data, 0);
        if (!xf) return;
        const mode = this.readDwordFromData(data, 24);
        __wmfEmfRendererLog("EMF ModifyWorldTransform mode:", mode, xf);
        this.coordinateTransformer.modifyWorldTransform(xf, mode);
      }
      processEmfAngleArc(data) {
        if (data.length < 20) return;
        const centerX = this.readLongFromData(data, 0);
        const centerY = this.readLongFromData(data, 4);
        const radius = this.readDwordFromData(data, 8);
        const startAngle = this.readDwordFromData(data, 12);
        const sweepAngle = this.readDwordFromData(data, 16);
        const transformed = this.coordinateTransformer.transform(centerX, centerY, this.ctx.canvas.width, this.ctx.canvas.height);
        const startRad = startAngle * Math.PI / 180;
        const endRad = (startAngle + sweepAngle) * Math.PI / 180;
        this.ctx.beginPath();
        this.ctx.arc(transformed.x, transformed.y, radius, startRad, endRad, sweepAngle < 0);
        this.ctx.stroke();
        __wmfEmfRendererLog("EMF AngleArc:", centerX, centerY, radius, startAngle, sweepAngle);
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
        this.ctx.fill();
        this.ctx.stroke();
        __wmfEmfRendererLog("EMF RoundRect:", left, top, right, bottom);
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
        return {
          startAngle,
          endAngle,
          anticlockwise: this.arcDirection !== 2
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
        __wmfEmfRendererLog("EMF Arc:", left, top, right, bottom);
      }
      processEmfChord(data) {
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
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        __wmfEmfRendererLog("EMF Chord:", left, top, right, bottom);
      }
      processEmfPie(data) {
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
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        __wmfEmfRendererLog("EMF Pie:", left, top, right, bottom);
      }
      processEmfSelectPalette(data) {
        if (data.length < 4) return;
        const paletteHandle = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SelectPalette:", paletteHandle);
      }
      processEmfCreatePalette(data) {
        __wmfEmfRendererLog("EMF CreatePalette");
      }
      processEmfSetPaletteEntries(data) {
        __wmfEmfRendererLog("EMF SetPaletteEntries");
      }
      processEmfResizePalette(data) {
        __wmfEmfRendererLog("EMF ResizePalette");
      }
      processEmfRealizePalette(data) {
        __wmfEmfRendererLog("EMF RealizePalette");
      }
      processEmfExtFloodFill(data) {
        if (data.length < 16) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        const fillType = this.readDwordFromData(data, 12);
        __wmfEmfRendererLog("EMF ExtFloodFill:", x, y, color, fillType);
      }
      processEmfArcTo(data) {
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
        __wmfEmfRendererLog("EMF ArcTo:", left, top, right, bottom);
      }
      processEmfPolyDraw(data) {
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        __wmfEmfRendererLog("EMF PolyDraw, count:", count);
        if (data.length < 20 + count * 8 + count) return;
        for (let i = 0; i < count; i++) {
          const x = this.readLongFromData(data, 20 + i * 8);
          const y = this.readLongFromData(data, 24 + i * 8);
          const type = data[20 + count * 8 + i];
          const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
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
        if ((ihBrush & 2147483648) !== 0) return;
        const iUsage = this.readDwordFromData(data, 4);
        const offBmi = this.readDwordFromData(data, 8);
        const cbBmi = this.readDwordFromData(data, 12);
        const offBits = this.readDwordFromData(data, 16);
        const cbBits = this.readDwordFromData(data, 20);
        if (!offBmi || !cbBmi || !offBits || !cbBits) return;
        const dib = this._decodeDib(data, offBmi, cbBmi, offBits, cbBits, { iUsage });
        if (!dib) {
          __wmfEmfRendererLog("EMF CreateDibPatternBrushPT: DIB decode failed");
          return;
        }
        const url = this.ctx.addPattern(dib, { orgX: 0, orgY: 0 });
        if (!url) return;
        this.gdiObjectManager.createObjectAt(ihBrush, { type: "pattern", url, width: dib.width, height: Math.abs(dib.height) });
        __wmfEmfRendererLog("EMF CreateDibPatternBrushPT: ih=", ihBrush, "size=", dib.width, "x", dib.height);
      }
      processEmfSetArcDirection(data) {
        if (data.length < 4) return;
        const direction = this.readDwordFromData(data, 0);
        this.arcDirection = direction;
        __wmfEmfRendererLog("EMF SetArcDirection:", direction);
      }
      processEmfSetMiterLimit(data) {
        if (data.length < 4) return;
        const miterLimit = this.readDwordFromData(data, 0);
        this.ctx.miterLimit = miterLimit;
        __wmfEmfRendererLog("EMF SetMiterLimit:", miterLimit);
      }
      processEmfCloseFigure(data) {
        this.ctx.closePath();
        __wmfEmfRendererLog("EMF CloseFigure");
      }
      processEmfFillPath(data) {
        this.ctx.fill();
        this.pathState = "idle";
        __wmfEmfRendererLog("EMF FillPath");
      }
      processEmfFlattenPath(data) {
        __wmfEmfRendererLog("EMF FlattenPath");
      }
      processEmfWidenPath(data) {
        __wmfEmfRendererLog("EMF WidenPath");
      }
      processEmfSelectClipPath(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("EMF SelectClipPath, mode:", mode);
        if (mode === 5) {
          this.ctx.clip();
        }
      }
      tryProcessAsCoordinates(data) {
        if (data.length < 16) return;
        const points = [];
        for (let i = 0; i < data.length - 8; i += 8) {
          const x = this.readDwordFromData(data, i);
          const y = this.readDwordFromData(data, i + 4);
          if (Math.abs(x) < 5e4 && Math.abs(y) < 5e4) {
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            points.push(transformed);
          }
        }
        if (points.length >= 3) {
          this.ctx.beginPath();
          this.ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
          }
          this.ctx.stroke();
          __wmfEmfRendererLog("Drew polyline with", points.length, "points from unknown record");
        }
      }
      finishPath() {
        if (this.pathState === "active" || this.pathState === "completed") {
          this.ctx.stroke();
          this.pathState = "idle";
        }
      }
    };
    module2.exports = EmfDrawer2;
  }
});

// src/modules/svgContext.js
var require_svgContext = __commonJS({
  "src/modules/svgContext.js"(exports2, module2) {
    "use strict";
    var SvgContext2 = class _SvgContext {
      constructor() {
        this.canvas = { width: 0, height: 0, style: {} };
        this.strokeStyle = "#000000";
        this.fillStyle = "#000000";
        this.lineWidth = 1;
        this.font = "12px sans-serif";
        this.textAlign = "start";
        this.textBaseline = "alphabetic";
        this.fillRule = "nonzero";
        this.globalAlpha = 1;
        this._nodes = [];
        this._defs = [];
        this._images = [];
        this._segments = [];
        this._hasSubpath = false;
        this._state = { clip: null };
        this._stack = [];
        this._clipCount = 0;
        this._scaleX = 1;
        this._dash = [];
        this._scaleY = 1;
      }
      // ---- 数值格式化（保留最多2位小数） ----
      _fmt(v) {
        if (typeof v !== "number" || !isFinite(v)) return "0";
        const r = Math.round(v * 100) / 100;
        return String(r);
      }
      static _esc(s) {
        return _SvgContext._sanitizeXml(String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }
      // 剔除 XML 1.0 非法字符（控制字符），避免渲染失败
      static _sanitizeXml(s) {
        return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
      }
      _attr(extra) {
        const a = [];
        if (this._state.clip) a.push('clip-path="' + this._state.clip + '"');
        return (extra || []).concat(a).join(" ");
      }
      // ---- 变换 ----
      scale(sx, sy) {
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
          dash: (this._dash || []).slice()
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
        this._segments.push("M " + this._fmt(x) + " " + this._fmt(y));
        this._hasSubpath = true;
      }
      lineTo(x, y) {
        this._segments.push("L " + this._fmt(x) + " " + this._fmt(y));
      }
      bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this._segments.push(
          "C " + this._fmt(cp1x) + " " + this._fmt(cp1y) + " " + this._fmt(cp2x) + " " + this._fmt(cp2y) + " " + this._fmt(x) + " " + this._fmt(y)
        );
      }
      closePath() {
        this._segments.push("Z");
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
          y: cy + rx * c * sr + ry * s * cr
        };
      }
      ellipse(cx, cy, rx, ry, rot, start, end, anticlockwise) {
        let sweep = end - start;
        if (anticlockwise) {
          if (sweep > 0) sweep -= Math.PI * 2;
        } else {
          if (sweep < 0) sweep += Math.PI * 2;
        }
        const connect = this._hasSubpath && this._segments.length > 0 ? "L " : "M ";
        if (Math.abs(sweep) >= Math.PI * 2 - 1e-6) {
          const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, 0);
          const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, Math.PI);
          const flag = sweep > 0 ? 1 : 0;
          this._segments.push(
            connect + this._fmt(p0.x) + " " + this._fmt(p0.y) + " A " + this._fmt(rx) + " " + this._fmt(ry) + " " + this._fmt(rot) + " 1 " + flag + " " + this._fmt(p1.x) + " " + this._fmt(p1.y) + " A " + this._fmt(rx) + " " + this._fmt(ry) + " " + this._fmt(rot) + " 1 " + flag + " " + this._fmt(p0.x) + " " + this._fmt(p0.y)
          );
        } else {
          const p0 = this._ellipsePoint(cx, cy, rx, ry, rot, start);
          const p1 = this._ellipsePoint(cx, cy, rx, ry, rot, end);
          const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
          const sweepFlag = sweep > 0 ? 1 : 0;
          this._segments.push(
            connect + this._fmt(p0.x) + " " + this._fmt(p0.y) + " A " + this._fmt(rx) + " " + this._fmt(ry) + " " + this._fmt(rot) + " " + largeArc + " " + sweepFlag + " " + this._fmt(p1.x) + " " + this._fmt(p1.y)
          );
        }
        this._hasSubpath = true;
      }
      roundRect(x, y, w, h, radii) {
        let rx, ry;
        if (Array.isArray(radii)) {
          rx = Number(radii[0]) || 0;
          ry = Number(radii[1]) !== void 0 ? Number(radii[1]) || 0 : rx;
        } else if (typeof radii === "number") {
          rx = radii;
          ry = radii;
        } else {
          rx = 0;
          ry = 0;
        }
        const n = this._normalizeRect(x, y, w, h);
        x = Number(n.x);
        y = Number(n.y);
        w = Number(n.w);
        h = Number(n.h);
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
          const p0 = { x: x + r * Math.cos(start), y: y + r * Math.sin(start) };
          const p1 = { x: x - r * Math.cos(start), y: y - r * Math.sin(start) };
          const flag = sweep > 0 ? 1 : 0;
          this._segments.push(
            "M " + this._fmt(p0.x) + " " + this._fmt(p0.y) + " A " + this._fmt(r) + " " + this._fmt(r) + " 0 1 " + flag + " " + this._fmt(p1.x) + " " + this._fmt(p1.y) + " A " + this._fmt(r) + " " + this._fmt(r) + " 0 1 " + flag + " " + this._fmt(p0.x) + " " + this._fmt(p0.y)
          );
        } else {
          const p0 = { x: x + r * Math.cos(start), y: y + r * Math.sin(start) };
          const p1 = { x: x + r * Math.cos(end), y: y + r * Math.sin(end) };
          const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
          const sweepFlag = sweep > 0 ? 1 : 0;
          this._segments.push(
            "M " + this._fmt(p0.x) + " " + this._fmt(p0.y) + " A " + this._fmt(r) + " " + this._fmt(r) + " 0 " + largeArc + " " + sweepFlag + " " + this._fmt(p1.x) + " " + this._fmt(p1.y)
          );
        }
        this._hasSubpath = true;
      }
      _d() {
        return this._segments.join(" ");
      }
      // ---- 填充 / 描边 ----
      fill() {
        if (!this._hasSubpath) return;
        const rule = this.fillRule === "evenodd" ? "evenodd" : "nonzero";
        this._nodes.push(
          '<path d="' + this._d() + '" fill="' + _SvgContext._esc(this.fillStyle) + '" fill-rule="' + rule + '" stroke="none" ' + this._attr() + "/>"
        );
      }
      stroke() {
        if (!this._hasSubpath) return;
        const dashAttr = this._dash && this._dash.length ? ' stroke-dasharray="' + this._dash.map((v) => this._fmt(v)).join(" ") + '"' : "";
        this._nodes.push(
          '<path d="' + this._d() + '" fill="none" stroke="' + _SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this.lineWidth) + '"' + dashAttr + " " + this._attr() + "/>"
        );
      }
      _normalizeRect(x, y, w, h) {
        if (w < 0) {
          x += w;
          w = -w;
        }
        if (h < 0) {
          y += h;
          h = -h;
        }
        return { x: this._fmt(x), y: this._fmt(y), w: this._fmt(w), h: this._fmt(h) };
      }
      fillRect(x, y, w, h) {
        const r = this._normalizeRect(x, y, w, h);
        this._nodes.push(
          '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="' + _SvgContext._esc(this.fillStyle) + '" stroke="none" ' + this._attr() + "/>"
        );
      }
      strokeRect(x, y, w, h) {
        const r = this._normalizeRect(x, y, w, h);
        const dashAttr = this._dash && this._dash.length ? ' stroke-dasharray="' + this._dash.map((v) => this._fmt(v)).join(" ") + '"' : "";
        this._nodes.push(
          '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="none" stroke="' + _SvgContext._esc(this.strokeStyle) + '" stroke-width="' + this._fmt(this.lineWidth) + '"' + dashAttr + " " + this._attr() + "/>"
        );
      }
      // ---- 文本 ----
      _parseFont() {
        const m = /([\d.]+)\s*px\s*(.+)/.exec(this.font || "");
        const size = m ? parseFloat(m[1]) : 12;
        const family = m ? m[2] : "sans-serif";
        const style = /italic/.test(this.font) ? "italic" : "normal";
        const weight = /bold/.test(this.font) ? "bold" : "normal";
        return { size: this._fmt(size), family: _SvgContext._esc(family), style, weight };
      }
      measureText(text) {
        const m = /([\d.]+)\s*px/.exec(this.font || "");
        const size = m ? parseFloat(m[1]) : 12;
        return { width: size * 0.6 * String(text).length };
      }
      fillText(text, x, y, transformMatrix) {
        const f = this._parseFont();
        const anchor = this.textAlign === "right" ? "end" : this.textAlign === "center" ? "middle" : "start";
        const baseline = this.textBaseline === "top" ? "text-before-edge" : this.textBaseline === "bottom" ? "text-after-edge" : "alphabetic";
        let xform = "";
        if (transformMatrix) {
          const m = transformMatrix;
          xform = ' transform="matrix(' + this._fmt(m.a) + " " + this._fmt(m.b) + " " + this._fmt(m.c) + " " + this._fmt(m.d) + " " + this._fmt(m.e) + " " + this._fmt(m.f) + ')"';
        }
        this._nodes.push(
          '<text x="' + this._fmt(x) + '" y="' + this._fmt(y) + '" font-family="' + f.family + '" font-size="' + f.size + '" font-style="' + f.style + '" font-weight="' + f.weight + '" text-anchor="' + anchor + '" dominant-baseline="' + baseline + '" fill="' + _SvgContext._esc(this.fillStyle) + '" stroke="none" ' + this._attr() + xform + ">" + _SvgContext._esc(text) + "</text>"
        );
      }
      // ---- 裁剪 ----
      clip() {
        if (!this._hasSubpath) return;
        this._clipCount++;
        const id = "clip" + this._clipCount;
        this._defs.push('<clipPath id="' + id + '"><path d="' + this._d() + '"/></clipPath>');
        this._state.clip = "url(#" + id + ")";
      }
      // ---- 位图 ----
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      }
      putImageData(imageData, dx, dy, dw, dh) {
        if (!imageData || !imageData.data || !imageData.width || !imageData.height) return;
        this._images.push({
          data: new Uint8ClampedArray(imageData.data),
          width: imageData.width,
          height: imageData.height,
          dx: dx || 0,
          dy: dy || 0,
          dw: dw || imageData.width,
          dh: dh || imageData.height
        });
      }
      // 最小 PNG 编码器（zlib 无压缩块 + CRC32），跨环境可用（无需 canvas/zlib）
      _pngBase64(imgData) {
        const { width: w, height: h, data: px } = imgData;
        if (w * h > 1572864 || w <= 0 || h <= 0) return null;
        const raw = new Uint8Array(h * (w * 4 + 1));
        for (let y = 0; y < h; y++) {
          const ro = y * (w * 4 + 1);
          raw[ro] = 0;
          for (let x = 0; x < w * 4; x++) raw[ro + 1 + x] = px[y * w * 4 + x];
        }
        const nBlocks = Math.ceil(raw.length / 65535) || 1;
        const zlib = new Uint8Array(2 + raw.length + nBlocks * 5 + 4);
        let p = 0;
        zlib[p++] = 120;
        zlib[p++] = 1;
        for (let i = 0; i < nBlocks; i++) {
          const len = Math.min(65535, raw.length - i * 65535);
          const isLast = i === nBlocks - 1 ? 1 : 0;
          zlib[p++] = isLast;
          zlib[p++] = len & 255;
          zlib[p++] = len >> 8 & 255;
          zlib[p++] = ~len & 255;
          zlib[p++] = ~len >> 8 & 255;
          zlib.set(raw.subarray(i * 65535, i * 65535 + len), p);
          p += len;
        }
        let a = 1, b = 0;
        for (let i = 0; i < raw.length; i++) {
          a = (a + raw[i]) % 65521;
          b = (b + a) % 65521;
        }
        const adler = (b << 16 | a) >>> 0;
        zlib[p++] = adler >>> 24 & 255;
        zlib[p++] = adler >>> 16 & 255;
        zlib[p++] = adler >>> 8 & 255;
        zlib[p++] = adler & 255;
        const crcTable = _SvgContext._crcTable || (_SvgContext._crcTable = (() => {
          const t = new Uint32Array(256);
          for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
            t[n] = c >>> 0;
          }
          return t;
        })());
        const crc32 = (buf, start, end) => {
          let c = 4294967295;
          for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 255] ^ c >>> 8;
          return (c ^ 4294967295) >>> 0;
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
        const u32 = (v) => new Uint8Array([v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255]);
        const ihdr = new Uint8Array(13);
        ihdr.set(u32(w), 0);
        ihdr.set(u32(h), 4);
        ihdr[8] = 8;
        ihdr[9] = 6;
        const png = [
          new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
          chunk("IHDR", ihdr),
          chunk("IDAT", zlib),
          chunk("IEND", new Uint8Array(0))
        ];
        const total = png.reduce((s, c) => s + c.length, 0);
        const bytes = new Uint8Array(total);
        let off = 0;
        for (const c of png) {
          bytes.set(c, off);
          off += c.length;
        }
        let bin = "";
        const CH = 32768;
        for (let i = 0; i < bytes.length; i += CH) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return "data:image/png;base64," + btoa(bin);
      }
      drawImage(img, dx, dy, dw, dh) {
        if (img && typeof img.toDataURL === "function") {
          try {
            this._nodes.push(
              '<image x="' + this._fmt(dx) + '" y="' + this._fmt(dy) + '" width="' + this._fmt(dw) + '" height="' + this._fmt(dh) + '" href="' + img.toDataURL("image/png") + '" preserveAspectRatio="none" ' + this._attr() + "/>"
            );
            return;
          } catch (e) {
          }
        }
        this._nodes.push(
          '<rect x="' + this._fmt(dx) + '" y="' + this._fmt(dy) + '" width="' + this._fmt(dw) + '" height="' + this._fmt(dh) + '" fill="#cccccc" ' + this._attr() + "/>"
        );
      }
      // 直接注入一段 SVG（用于嵌套 EMF 的 <g transform> 包装）与额外 defs
      rawPush(svgFragment) {
        if (svgFragment) this._nodes.push(svgFragment);
      }
      defsPush(defFragment) {
        if (defFragment) this._defs.push(defFragment);
      }
      get nodes() {
        return this._nodes;
      }
      get defs() {
        return this._defs;
      }
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
        const key = width + "x" + absH + ":" + data.length;
        if (this._patternCache && this._patternCache.key === key) {
          return this._patternCache.url;
        }
        const id = "pat-" + (this._patternSeq = (this._patternSeq || 0) + 1);
        const finalData = height < 0 ? data : this._flipV(data, width, absH);
        const href = this._pngBase64({ width, height: absH, data: finalData });
        const ox = opts && opts.orgX || 0;
        const oy = opts && opts.orgY || 0;
        const def = '<pattern id="' + id + '" patternUnits="userSpaceOnUse" x="' + this._fmt(ox) + '" y="' + this._fmt(oy) + '" width="' + this._fmt(width) + '" height="' + this._fmt(absH) + '"><image x="0" y="0" width="' + this._fmt(width) + '" height="' + this._fmt(absH) + '" preserveAspectRatio="none" href="' + href + '"/></pattern>';
        this._defs.push(def);
        const url = "url(#" + id + ")";
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
        for (const img of this._images) {
          try {
            const href = this._pngBase64(img);
            this._nodes.push(
              '<image x="' + this._fmt(img.dx) + '" y="' + this._fmt(img.dy) + '" width="' + this._fmt(img.dw) + '" height="' + this._fmt(img.dh) + '" href="' + href + '" preserveAspectRatio="none" />'
            );
          } catch (e) {
          }
        }
        const cw = this.canvas.width || 800;
        const ch = this.canvas.height || 600;
        const w = Math.round(cw / (this._scaleX || 1));
        const h = Math.round(ch / (this._scaleY || 1));
        const defs = this._defs.length ? "<defs>" + this._defs.join("") + "</defs>" : "";
        return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">\n' + defs + "\n" + this._nodes.join("\n") + "\n</svg>\n";
      }
    };
    module2.exports = SvgContext2;
  }
});

// src/modules/drawers/emfPlusDrawer.js
var require_emfPlusDrawer = __commonJS({
  "src/modules/drawers/emfPlusDrawer.js"(exports2, module2) {
    "use strict";
    var CoordinateTransformer2 = require_coordinateTransformer();
    var GdiObjectManager2 = require_gdiObjectManager();
    var EMF_PLUS_RECORD_HANDLERS = {
      // ========== 全局/控制记录 ==========
      16385: "processEmfPlusHeader",
      // EmfPlusHeader
      16386: null,
      // EmfPlusEndOfFile
      16387: "processEmfPlusComment",
      // EmfPlusComment
      16388: "processEmfPlusGetDC",
      // EmfPlusGetDC
      // ========== 对象管理 ==========
      16392: "processEmfPlusObject",
      // EmfPlusObject
      // ========== 绘图记录 ==========
      16393: "processEmfPlusClear",
      // EmfPlusClear
      16394: "processEmfPlusFillRectangles",
      // EmfPlusFillRects
      16395: "processEmfPlusDrawRectangles",
      // EmfPlusDrawRects
      16396: "processEmfPlusFillPolygon",
      // EmfPlusFillPolygon
      16397: "processEmfPlusDrawLines",
      // EmfPlusDrawLines
      16398: "processEmfPlusFillEllipse",
      // EmfPlusFillEllipse
      16399: "processEmfPlusDrawEllipse",
      // EmfPlusDrawEllipse
      16400: "processEmfPlusFillPie",
      // EmfPlusFillPie
      16401: "processEmfPlusDrawPie",
      // EmfPlusDrawPie
      16402: "processEmfPlusDrawArc",
      // EmfPlusDrawArc
      16403: "processEmfPlusFillRegion",
      // EmfPlusFillRegion
      16404: "processEmfPlusFillPath",
      // EmfPlusFillPath
      16405: "processEmfPlusDrawPath",
      // EmfPlusDrawPath
      16406: "processEmfPlusFillClosedCurve",
      // EmfPlusFillClosedCurve
      16407: "processEmfPlusDrawClosedCurve",
      // EmfPlusDrawClosedCurve
      16408: "processEmfPlusDrawCurve",
      // EmfPlusDrawCurve
      16409: "processEmfPlusDrawBeziers",
      // EmfPlusDrawBeziers
      // ========== 图像/文本绘制 ==========
      16410: "processEmfPlusDrawImage",
      // EmfPlusDrawImage
      16411: "processEmfPlusDrawImagePoints",
      // EmfPlusDrawImagePoints
      16412: "processEmfPlusDrawString",
      // EmfPlusDrawString
      16438: "processEmfPlusDrawDriverString",
      // EmfPlusDrawDriverString
      // ========== 状态/渲染参数记录 ==========
      16413: "processEmfPlusSetRenderingOrigin",
      // EmfPlusSetRenderingOrigin
      16414: "processEmfPlusSetAntiAliasMode",
      // EmfPlusSetAntiAliasMode
      16415: "processEmfPlusSetTextRenderingHint",
      // EmfPlusSetTextRenderingHint
      16416: "processEmfPlusSetTextContrast",
      // EmfPlusSetTextContrast
      16417: "processEmfPlusSetInterpolationMode",
      // EmfPlusSetInterpolationMode
      16418: "processEmfPlusSetPixelOffsetMode",
      // EmfPlusSetPixelOffsetMode
      16419: "processEmfPlusSetCompositingMode",
      // EmfPlusSetCompositingMode
      16420: "processEmfPlusSetCompositingQuality",
      // EmfPlusSetCompositingQuality
      // ========== 图形状态容器/变换 ==========
      16421: "processEmfPlusSave",
      // EmfPlusSave
      16422: "processEmfPlusRestore",
      // EmfPlusRestore
      16423: "processEmfPlusBeginContainer",
      // EmfPlusBeginContainer
      16424: "processEmfPlusBeginContainerNoParams",
      // EmfPlusBeginContainerNoParams
      16425: "processEmfPlusEndContainer",
      // EmfPlusEndContainer
      16426: "processEmfPlusSetWorldTransform",
      // EmfPlusSetWorldTransform
      16427: "processEmfPlusResetWorldTransform",
      // EmfPlusResetWorldTransform
      16428: "processEmfPlusMultiplyWorldTransform",
      // EmfPlusMultiplyWorldTransform
      16429: "processEmfPlusTranslateWorldTransform",
      // EmfPlusTranslateWorldTransform
      16430: "processEmfPlusScaleWorldTransform",
      // EmfPlusScaleWorldTransform
      16431: "processEmfPlusRotateWorldTransform",
      // EmfPlusRotateWorldTransform
      16432: "processEmfPlusSetPageTransform",
      // EmfPlusSetPageTransform
      // ========== 裁剪 ==========
      16433: "processEmfPlusResetClip",
      // EmfPlusResetClip
      16434: "processEmfPlusSetClipRect",
      // EmfPlusSetClipRect
      16435: "processEmfPlusSetClipPath",
      // EmfPlusSetClipPath
      16436: "processEmfPlusSetClipRegion",
      // EmfPlusSetClipRegion
      16437: "processEmfPlusOffsetClip",
      // EmfPlusOffsetClip
      // ========== 其他 ==========
      16439: "processEmfPlusStrokeFillPath",
      // EmfPlusStrokeFillPath (非标准)
      16440: "processEmfPlusSerializableObject",
      // EmfPlusSerializableObject
      16441: "processEmfPlusSetTSGraphics",
      // EmfPlusSetTSGraphics
      16442: "processEmfPlusSetTSClip"
      // EmfPlusSetTSClip
    };
    var EmfPlusDrawer2 = class {
      constructor(ctx) {
        this.ctx = ctx;
        this.coordinateTransformer = new CoordinateTransformer2();
        this.gdiObjectManager = new GdiObjectManager2();
        this.currentPath = [];
        this.pathState = "idle";
        this.fillColor = "#000000";
        this.strokeColor = "#000000";
        this.lineWidth = 1;
        this.emfPlusObjects = {};
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
        const a = argb >>> 24 & 255;
        const r = argb >>> 16 & 255;
        const g = argb >>> 8 & 255;
        const b = argb & 255;
        if (a === 255) {
          return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
        }
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      }
      // 读取 32 位 ARGB（无符号）
      _emfPlusReadArgb(data, offset) {
        if (offset + 4 > data.length) return 4294967295;
        return data[offset] & 255 | (data[offset + 1] & 255) << 8 | (data[offset + 2] & 255) << 16 | (data[offset + 3] & 255) << 24;
      }
      // 根据 flags 与 BrushId 解析画刷颜色：
      // flags 的 0x8000 位为 1 时 BrushId 直接是 ARGB 颜色，否则是对象表索引
      _emfPlusResolveBrush(flags, brushId, data, offset) {
        if (flags & 32768) {
          return this._emfPlusArgbToColor(brushId);
        }
        const obj = this.emfPlusObjects[brushId >>> 0];
        if (obj && obj.type === "solidBrush") {
          return obj.color;
        }
        if (brushId >= 16777216 || brushId === 0) {
          return this._emfPlusArgbToColor(brushId);
        }
        return "#000000";
      }
      // 解析画笔对象 -> { color, width }
      _emfPlusResolvePen(penId) {
        const obj = this.emfPlusObjects[penId >>> 0];
        if (obj && obj.type === "pen") {
          return { color: obj.color, width: obj.width };
        }
        return { color: "#000000", width: 1 };
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
        const count = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
        const pointFlags = data[4] & 255 | (data[5] & 255) << 8 | (data[6] & 255) << 16 | (data[7] & 255) << 24;
        const compressed = (pointFlags & 16384) !== 0;
        const rle = (pointFlags & 4096) !== 0;
        const relative = (pointFlags & 2048) !== 0;
        if (!this._dbgPath) this._dbgPath = { count: 0, big: 0, fail: 0 };
        if (count > 100) {
          this._dbgPath.big++;
          __wmfEmfRendererLog("[BIG] count=" + count, "flags=0x" + pointFlags.toString(16), "C=" + (compressed ? "Y" : "N"), "RLE=" + (rle ? "Y" : "N"), "R=" + (relative ? "Y" : "N"), "len=" + data.length, "first4=[" + [data[0], data[1], data[2], data[3]].map((x) => x.toString(16).padStart(2, "0")).join(",") + "]");
        }
        process.stdout.write("[ParsePath] count=" + count + " flags=0x" + pointFlags.toString(16) + " C=" + (compressed ? "Y" : "N") + " RLE=" + (rle ? "Y" : "N") + " R=" + (relative ? "Y" : "N") + " len=" + data.length + " first5bytes=[" + [data[0], data[1], data[2], data[3], data[4]].map((x) => x.toString(16).padStart(2, "0")).join(",") + "]\n");
        this._dbgPath.count++;
        let offset = 8;
        const points = [];
        const stride = compressed ? 4 : 8;
        for (let i = 0; i < count; i++) {
          if (offset + stride > data.length) break;
          let x, y;
          if (compressed) {
            x = data[offset] & 255 | (data[offset + 1] & 255) << 8;
            if (x & 32768) x |= 4294901760;
            y = data[offset + 2] & 255 | (data[offset + 3] & 255) << 8;
            if (y & 32768) y |= 4294901760;
          } else {
            x = this._emfPlusReadFloat(data, offset);
            y = this._emfPlusReadFloat(data, offset + 4);
          }
          points.push({ x, y });
          offset += stride;
        }
        const pointTypes = new Uint8Array(count);
        if (rle) {
          let i = 0;
          while (i < count && offset + 2 <= data.length) {
            const header = data[offset] & 255;
            const t = data[offset + 1] & 255;
            offset += 2;
            const runCount = header & 63;
            const actual = Math.min(runCount, count - i);
            for (let k = 0; k < actual; k++) pointTypes[i + k] = t;
            i += actual;
          }
        } else {
          for (let i = 0; i < count && offset < data.length; i++) {
            pointTypes[i] = data[offset++] & 255;
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
          if (pathObj.relative) {
            x += prevX;
            y += prevY;
          }
          const mapped = this._emfPlusMapPoint(x, y);
          const type = t & 15;
          const closed = (t & 128) !== 0;
          if (type === 0) {
            if (started) ctx.closePath();
            ctx.beginPath();
            ctx.moveTo(mapped.x, mapped.y);
            started = true;
            bezierBuf = [];
          } else if (type === 1) {
            if (!started) {
              ctx.beginPath();
              ctx.moveTo(mapped.x, mapped.y);
              started = true;
            }
            ctx.lineTo(mapped.x, mapped.y);
            bezierBuf = [];
          } else if (type === 3) {
            if (!started) {
              ctx.beginPath();
              ctx.moveTo(mapped.x, mapped.y);
              started = true;
            }
            bezierBuf.push(mapped);
            if (bezierBuf.length === 3) {
              ctx.bezierCurveTo(bezierBuf[0].x, bezierBuf[0].y, bezierBuf[1].x, bezierBuf[1].y, bezierBuf[2].x, bezierBuf[2].y);
              bezierBuf = [];
            }
          }
          if (closed && bezierBuf.length === 0) ctx.closePath();
          prevX = x;
          prevY = y;
        }
        if (started) ctx.closePath();
      }
      draw(metafileData, options = {}) {
        __wmfEmfRendererLog("Drawing EMF+ with header:", metafileData.header);
        __wmfEmfRendererLog("Number of records:", metafileData.records.length);
        const viewWidth = options.viewWidth || 800;
        const viewHeight = options.viewHeight || 600;
        let canvasWidth, canvasHeight;
        if (metafileData.header.bounds) {
          const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
          const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
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
        const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
        this.devicePixelRatio = dpr;
        this.ctx.canvas.width = Math.round(canvasWidth * dpr);
        this.ctx.canvas.height = Math.round(canvasHeight * dpr);
        this.ctx.canvas.style.width = canvasWidth + "px";
        this.ctx.canvas.style.height = canvasHeight + "px";
        this.ctx.scale(dpr, dpr);
        __wmfEmfRendererLog("Canvas size set to:", canvasWidth, "x", canvasHeight, "(DPR:", dpr, ", actual:", this.ctx.canvas.width, "x", this.ctx.canvas.height + ")");
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        __wmfEmfRendererLog("Canvas cleared");
        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.fillColor = "#ffffff";
        this.strokeColor = "#000000";
        __wmfEmfRendererLog("Drawing styles set");
        this.currentPath = [];
        this.pathState = "idle";
        for (let i = 0; i < metafileData.records.length; i++) {
          const record = metafileData.records[i];
          if (globalThis.__WMF_DEBUG__) {
            __wmfEmfRendererLog("Processing EMF+ record", i, ":", record.type, "(0x" + record.type.toString(16).padStart(8, "0") + ")", "flags:", record.flags);
          }
          this.processEmfPlusRecordType(record.type, record.flags, record.data);
        }
        this.finishPath();
        __wmfEmfRendererLog("EMF+ drawing completed");
      }
      // 完成路径绘制（若路径仍处于 active/completed，则描边输出）
      finishPath() {
        if (this.pathState === "active" || this.pathState === "completed") {
          this.ctx.stroke();
          this.pathState = "idle";
        }
      }
      processEmfPlusRecordType(recordType, flags, data) {
        const handlerName = EMF_PLUS_RECORD_HANDLERS[recordType];
        if (handlerName !== void 0) {
          if (handlerName !== null) {
            this[handlerName](flags, data);
          }
          return;
        }
        __wmfEmfRendererLog("Unknown/Unimplemented EMF+ record type:", recordType.toString(16));
      }
      // 解析EMF头
      parseEmfHeader() {
        return {
          nSize: 88,
          nVersion: 65536,
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
        __wmfEmfRendererLog("Processing EmfPlusDrawLine");
      }
      // 处理EMF+填充多边形记录：BrushId(4) + Count(4) + PointF[Count](8 each)
      processEmfPlusFillPolygon(flags, data) {
        if (data.length < 4) return;
        const brushId = flags & 255;
        const count = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
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
        __wmfEmfRendererLog("EMF+ FillPolygon:", count, "\u4E2A\u70B9");
      }
      // 处理EMF+绘制曲线记录
      processEmfPlusDrawCurve(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawCurve");
      }
      // 处理EMF+填充闭合曲线记录
      processEmfPlusFillClosedCurve(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusFillClosedCurve");
      }
      // 处理EMF+绘制闭合曲线记录
      processEmfPlusDrawClosedCurve(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawClosedCurve");
      }
      // EmfPlusFillPath (0x4014, MS-EMFPLUS 2.3.4.17)：flags[7..0]=pathId, flags[15]=S(ARGB 直传), data[0..3]=brushId/ARGB
      processEmfPlusFillPath(flags, data) {
        if (data.length < 4) return;
        const pathId = flags & 255;
        const solid = (flags & 32768) !== 0;
        const brushId = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
        if (!this._dbgFP) this._dbgFP = { hit: 0, miss: 0 };
        const path = this.emfPlusObjects[pathId];
        if (!path || path.type !== "path") {
          this._dbgFP.miss++;
          if (this._dbgFP.miss < 4) __wmfEmfRendererLog("[FillPath MISS] pathId=" + pathId, "solid=" + solid, "brushId=0x" + brushId.toString(16), "objExists=" + !!path, "objType=" + (path && path.type));
          return;
        }
        this._dbgFP.hit++;
        process.stdout.write("[FillPath HIT] pathId=" + pathId + " count=" + path.count + " firstPt=" + JSON.stringify(path.points[0]) + " compressed=" + path.compressed + " relative=" + path.relative + " lastPt=" + JSON.stringify(path.points[path.points.length - 1]) + " pointsLen=" + path.points.length + "\n");
        if (!path || path.type !== "path") return;
        const color = solid ? this._emfPlusArgbToColor(brushId) : this._emfPlusResolveBrush(0, brushId);
        if (!color) return;
        this.ctx.fillStyle = color;
        this._emfPlusTracePath(path);
        this.ctx.fill();
      }
      // EmfPlusDrawPath (0x4015, MS-EMFPLUS 2.3.4.18)：flags[7..0]=pathId, flags[15]=S, data[0..3]=penId/ARGB
      processEmfPlusDrawPath(flags, data) {
        if (data.length < 4) return;
        const pathId = flags & 255;
        const solid = (flags & 32768) !== 0;
        const penId = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
        const path = this.emfPlusObjects[pathId];
        if (!path || path.type !== "path") return;
        let color = "#000000", width = 1;
        if (solid) {
          color = this._emfPlusArgbToColor(penId);
        } else {
          const pen = this.emfPlusObjects[penId];
          if (pen && pen.type === "pen") {
            color = pen.color;
            width = pen.width || 1;
          }
        }
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this._emfPlusTracePath(path);
        this.ctx.stroke();
      }
      // 处理EMF+绘制图像记录（DrawImage = 目标矩形与源矩形相同；可引用嵌套 EMF / 位图对象）
      processEmfPlusDrawImage(flags, data) {
        const img = this.emfPlusObjects[flags & 255];
        if (!img || data.length < 24) return;
        const sx = this._emfPlusReadFloat(data, 8);
        const sy = this._emfPlusReadFloat(data, 12);
        const sw = this._emfPlusReadFloat(data, 16);
        const sh = this._emfPlusReadFloat(data, 20);
        this._drawImageObj(img, sx, sy, sx + sw, sy, sx, sy + sh);
      }
      // 处理EMF+绘制图像点记录（DrawImagePoints：三点定义目标平行四边形）
      processEmfPlusDrawImagePoints(flags, data) {
        const img = this.emfPlusObjects[flags & 255];
        if (!img || data.length < 28) return;
        const count = this._emfPlusReadInt32(data, 24);
        if (count !== 3) return;
        const pts = [];
        for (let i = 0; i < 3; i++) {
          const o = 28 + i * 8;
          if (o + 8 > data.length) return;
          pts.push({ x: this._emfPlusReadPointX(flags, data, o), y: this._emfPlusReadPointY(flags, data, o) });
        }
        this._drawImageObj(img, pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      }
      _emfPlusReadInt32(data, offset) {
        if (offset + 4 > data.length) return 0;
        const b = data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
        return b | 0;
      }
      // 读取点坐标（flags 0x4000=压缩坐标时用 int16/4096）
      _emfPlusReadPointX(flags, data, o) {
        if (flags & 16384) {
          const v = (data[o] | data[o + 1] << 8) << 16 >> 16;
          return v / 4096;
        }
        return this._emfPlusReadFloat(data, o);
      }
      _emfPlusReadPointY(flags, data, o) {
        if (flags & 16384) {
          const v = (data[o + 2] | data[o + 3] << 8) << 16 >> 16;
          return v / 4096;
        }
        return this._emfPlusReadFloat(data, o + 4);
      }
      // 渲染嵌套 EMF / 位图对象到指定平行四边形（3 点：左上 / 右上 / 左下）
      _drawImageObj(img, x1, y1, x2, y2, x3, y3) {
        try {
          if (img.type === "imageData") {
            this.ctx.rawPush('<image x="' + Math.min(x1, x2, x3) + '" y="' + Math.min(y1, y2, y3) + '" width="' + Math.abs(Math.max(x1, x2, x3) - Math.min(x1, x2, x3)) + '" height="' + Math.abs(Math.max(y1, y2, y3) - Math.min(y1, y2, y3)) + '" href="' + img.href + '" preserveAspectRatio="none" />');
            return;
          }
          if (img.type !== "imageEmf") return;
          const nested = this._renderNestedEmf(img.data);
          if (!nested) return;
          const W = nested.width || 1;
          const H = nested.height || 1;
          const a = (x2 - x1) / W, b = (y2 - y1) / W;
          const c = (x3 - x1) / H, d = (y3 - y1) / H;
          const body = nested.nodes.join("\n");
          const defs = nested.defs.length ? "<defs>" + nested.defs.join("") + "</defs>" : "";
          this.ctx.rawPush(
            '<g transform="matrix(' + this._fmtN(a) + " " + this._fmtN(b) + " " + this._fmtN(c) + " " + this._fmtN(d) + " " + this._fmtN(x1) + " " + this._fmtN(y1) + ')">' + defs + body + "</g>"
          );
        } catch (e) {
          __wmfEmfRendererLog("EMF+ DrawImage failed:", e.message);
        }
      }
      _fmtN(v) {
        return Math.round(v * 100) / 100;
      }
      // 用同一渲染管线把嵌套 EMF 渲染为独立节点列表（递归播放，支持 EMF+ 内嵌）
      _renderNestedEmf(bytes) {
        try {
          const MetafileParserCtor = require_metafileParser();
          const EmfDrawerCtor = require_emfDrawer();
          const SvgContextCtor = require_svgContext();
          const parser = new MetafileParserCtor(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
          const result = parser.parse();
          if (!result || result.error || !result.records) return null;
          const subCtx = new SvgContextCtor();
          const drawer = new EmfDrawerCtor(subCtx);
          drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
          let W = 800, H = 600;
          if (result.header && result.header.bounds) {
            W = Math.abs(result.header.bounds.right - result.header.bounds.left);
            H = Math.abs(result.header.bounds.bottom - result.header.bounds.top);
          }
          return { nodes: subCtx.nodes, defs: subCtx.defs, width: W || 1, height: H || 1 };
        } catch (e) {
          __wmfEmfRendererLog("EMF+ nested EMF render failed:", e.message);
          return null;
        }
      }
      // 处理EMF+绘制字符串记录
      processEmfPlusDrawString(flags, data) {
        if (data.length < 8) return;
        let o = 0;
        const brushId = flags & 255;
        let fontObj = null;
        if (flags & 32768) {
          if (o + 4 > data.length) return;
          const fontId = (data[o] | data[o + 1] << 8 | data[o + 2] << 16 | data[o + 3] << 24) >>> 0;
          o += 4;
          fontObj = this.emfPlusObjects[fontId];
        }
        if (flags & 16384) o += 4;
        let layoutX = 0, layoutY = 0, layoutW = 0, layoutH = 0;
        if (flags & 2048) {
          if (o + 16 > data.length) return;
          layoutX = this._emfPlusReadFloat(data, o);
          layoutY = this._emfPlusReadFloat(data, o + 4);
          layoutW = this._emfPlusReadFloat(data, o + 8);
          layoutH = this._emfPlusReadFloat(data, o + 12);
          o += 16;
        }
        if (o + 4 > data.length) return;
        const len = (data[o] | data[o + 1] << 8 | data[o + 2] << 16 | data[o + 3] << 24) >>> 0;
        o += 4;
        if (len === 0 || o + len > data.length) return;
        const slice = data.slice(o, o + len);
        let text = "";
        for (let i = 0; i + 1 < slice.length; i += 2) {
          const code = slice[i] | slice[i + 1] << 8;
          if (code === 0) break;
          text += String.fromCharCode(code);
        }
        if (!text) return;
        const brush = this.emfPlusObjects[brushId];
        if (brush && brush.type === "solidBrush" && brush.color) {
          this.ctx.fillStyle = brush.color;
        }
        let drawSize = 12;
        if (fontObj && fontObj.type === "font") {
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
        const penId = flags & 255;
        const count = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
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
        __wmfEmfRendererLog("EMF+ DrawLines:", count, "\u4E2A\u70B9");
      }
      // 处理EMF+绘制贝塞尔曲线记录
      processEmfPlusDrawBeziers(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawBeziers");
      }
      // 处理EMF+绘制椭圆记录：PenId(4) + RectF(16)
      processEmfPlusDrawEllipse(flags, data) {
        if (data.length < 16) return;
        const pen = this._emfPlusResolvePen(flags & 255);
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
        __wmfEmfRendererLog("EMF+ DrawEllipse");
      }
      // 处理EMF+填充椭圆记录：BrushId(4) + RectF(16)
      processEmfPlusFillEllipse(flags, data) {
        if (data.length < 16) return;
        const brushId = flags & 255;
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
        __wmfEmfRendererLog("EMF+ FillEllipse");
      }
      // 处理EMF+绘制弧线记录
      processEmfPlusDrawArc(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawArc");
      }
      // 处理EMF+填充饼图记录
      processEmfPlusFillPie(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusFillPie");
      }
      // 处理EMF+绘制饼图记录
      processEmfPlusDrawPie(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawPie");
      }
      // 处理EMF+绘制驱动字符串记录
      processEmfPlusDrawDriverString(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusDrawDriverString");
      }
      // 处理EMF+设置渲染原点记录
      processEmfPlusSetRenderingOrigin(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetRenderingOrigin");
      }
      // 处理EMF+设置抗锯齿模式记录
      processEmfPlusSetAntiAliasMode(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetAntiAliasMode");
      }
      // 处理EMF+设置文本渲染提示记录
      processEmfPlusSetTextRenderingHint(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetTextRenderingHint");
      }
      // 处理EMF+设置插值模式记录
      processEmfPlusSetInterpolationMode(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetInterpolationMode");
      }
      // 处理EMF+设置像素偏移模式记录
      processEmfPlusSetPixelOffsetMode(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetPixelOffsetMode");
      }
      // 处理EMF+设置合成模式记录
      processEmfPlusSetCompositingMode(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetCompositingMode");
      }
      // 处理EMF+设置合成质量记录
      processEmfPlusSetCompositingQuality(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetCompositingQuality");
      }
      // 处理EMF+保存记录
      processEmfPlusSave(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSave");
      }
      // 处理EMF+恢复记录
      processEmfPlusRestore(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusRestore");
      }
      // 处理EMF+开始容器记录
      processEmfPlusBeginContainer(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusBeginContainer");
      }
      // 处理EMF+开始无参数容器记录
      processEmfPlusBeginContainerNoParams(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusBeginContainerNoParams");
      }
      // 处理EMF+结束容器记录
      processEmfPlusEndContainer(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusEndContainer");
      }
      // 处理EMF+设置世界变换记录
      processEmfPlusSetWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetWorldTransform");
      }
      // 处理EMF+重置世界变换记录
      processEmfPlusResetWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusResetWorldTransform");
      }
      // 处理EMF+乘以世界变换记录
      processEmfPlusMultiplyWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusMultiplyWorldTransform");
      }
      // 处理EMF+平移世界变换记录
      processEmfPlusTranslateWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusTranslateWorldTransform");
      }
      // 处理EMF+缩放世界变换记录
      processEmfPlusScaleWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusScaleWorldTransform");
      }
      // 处理EMF+旋转世界变换记录
      processEmfPlusRotateWorldTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusRotateWorldTransform");
      }
      // 处理EMF+设置页面变换记录
      processEmfPlusSetPageTransform(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetPageTransform");
      }
      // 处理EMF+重置裁剪记录
      processEmfPlusResetClip(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusResetClip");
      }
      // 处理EMF+设置裁剪矩形记录
      processEmfPlusSetClipRect(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetClipRect");
      }
      // 处理EMF+设置裁剪路径记录
      processEmfPlusSetClipPath(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetClipPath");
      }
      // 处理EMF+设置裁剪区域记录
      processEmfPlusSetClipRegion(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetClipRegion");
      }
      // 处理EMF+偏移裁剪记录
      processEmfPlusOffsetClip(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusOffsetClip");
      }
      // 补充缺失的处理方法
      processEmfPlusHeader(flags, data) {
        if (data.length >= 4) {
          const version = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
          __wmfEmfRendererLog("EMF+ Header, version: 0x" + version.toString(16));
        }
      }
      processEmfPlusComment(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusComment");
      }
      processEmfPlusGetDC(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusGetDC");
      }
      // EmfPlusObject：ObjectId = flags & 0xFF；ObjectType 位于 flags 位 8..14（0x7f00）
      //  0x0100=Brush 0x0200=Pen 0x0300=Path 0x0500=Image ...
      // data 起点即对象内容（Image/metafile 等从 data 直接解析）。
      processEmfPlusObject(flags, data) {
        const objectId = flags & 255;
        const objectType = flags & 32512;
        if (data.length >= 4) data = data.slice(4);
        if (!this._objTypeStats) this._objTypeStats = {};
        this._objTypeStats["0x" + objectType.toString(16)] = (this._objTypeStats["0x" + objectType.toString(16)] || 0) + 1;
        if (objectType === 256) {
          if (data.length < 8) return;
          const brushType = this._emfPlusReadInt32(data, 0);
          if (brushType === 0) {
            const argb = this._emfPlusReadArgb(data, 4);
            this.emfPlusObjects[objectId] = { type: "solidBrush", color: this._emfPlusArgbToColor(argb) };
          }
        } else if (objectType === 512 && data.length >= 8) {
          const penUnit = this._emfPlusReadInt32(data, 4);
          let color = "#000000";
          let width = 1;
          const flagsD = this._emfPlusReadInt32(data, 0);
          if (flagsD & 4 && data.length >= 16) {
            const argb = this._emfPlusReadArgb(data, 12);
            color = this._emfPlusArgbToColor(argb);
            if (data.length >= 12) width = this._emfPlusReadFloat(data, 8) || 1;
          } else if (data.length >= 12) {
            width = this._emfPlusReadFloat(data, 8) || 1;
            if (data.length >= 20) {
              const argb = this._emfPlusReadArgb(data, 12);
              color = this._emfPlusArgbToColor(argb);
            }
          }
          this.emfPlusObjects[objectId] = { type: "pen", color, width, penUnit };
        } else if (objectType === 1024) {
          let emSize = 12;
          let styleFlags = 0;
          let family = 0;
          if (data.length >= 16) {
            emSize = this._emfPlusReadFloat(data, 4) || 12;
            styleFlags = this._emfPlusReadInt32(data, 12);
            family = data.length >= 18 ? data[16] | data[17] << 8 : 0;
          }
          const weight = styleFlags & 1 ? "bold" : "normal";
          const italic = styleFlags & 2 ? "italic " : "";
          const families = ["serif", "sans-serif", "monospace", "sans-serif", "cursive", "fantasy", "monospace"];
          const face = families[family] || "sans-serif";
          this.emfPlusObjects[objectId] = { type: "font", emSize, weight, italic, face };
        } else if (objectType === 768) {
          const parsed = this._emfPlusParsePath(data);
          if (parsed) {
            this.emfPlusObjects[objectId] = { type: "path", ...parsed };
          } else {
            this.emfPlusObjects[objectId] = { type: "path", data };
          }
        } else if (objectType === 1280) {
          if (data.length < 8) return;
          const type = this._emfPlusReadInt32(data, 4);
          if (type === 1) {
            const bitmapType = data.length >= 28 ? this._emfPlusReadInt32(data, 24) : 0;
            if ((bitmapType === 1 || bitmapType === 2) && data.length > 28) {
              const mime = bitmapType === 1 ? "image/png" : "image/jpeg";
              const b64 = Buffer.from(data.slice(28)).toString("base64");
              this.emfPlusObjects[objectId] = { type: "imageData", href: "data:" + mime + ";base64," + b64 };
            } else {
            }
          } else if (type === 2) {
            const mfType = data.length >= 16 ? this._emfPlusReadInt32(data, 8) : 0;
            const mfSize = data.length >= 16 ? this._emfPlusReadInt32(data, 12) : 0;
            if (mfType === 3 && mfSize > 0 && 16 + mfSize <= data.length) {
              this.emfPlusObjects[objectId] = { type: "imageEmf", data: data.slice(16, 16 + mfSize) };
            }
          }
        } else {
          __wmfEmfRendererLog("EMF+ Object #" + objectId, "objType 0x" + objectType.toString(16));
        }
      }
      // EmfPlusClear：data = ARGB(4)，用指定颜色填充整个画布
      processEmfPlusClear(flags, data) {
        if (data.length < 4) return;
        const argb = this._emfPlusReadArgb(data, 0);
        const color = this._emfPlusArgbToColor(argb);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        __wmfEmfRendererLog("EMF+ Clear:", color);
      }
      // EmfPlusFillRects：body = Count(4) + RectF[Count](16 each)；笔刷由 flags 低字节(ObjectId)指定
      processEmfPlusFillRectangles(flags, data) {
        if (data.length < 4) return;
        const brushId = flags & 255;
        const count = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
        if (count > 4096) return;
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
        __wmfEmfRendererLog("EMF+ FillRects:", count, "\u4E2A\u77E9\u5F62");
      }
      // EmfPlusDrawRects：body = Count(4) + RectF[Count]；画笔由 flags 低字节指定
      processEmfPlusDrawRectangles(flags, data) {
        if (data.length < 4) return;
        const penId = flags & 255;
        const count = data[0] & 255 | (data[1] & 255) << 8 | (data[2] & 255) << 16 | (data[3] & 255) << 24;
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
        __wmfEmfRendererLog("EMF+ DrawRects:", count, "\u4E2A\u77E9\u5F62");
      }
      processEmfPlusFillRegion(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusFillRegion");
      }
      processEmfPlusSetTextContrast(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetTextContrast");
      }
      processEmfPlusStrokeFillPath(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusStrokeFillPath");
      }
      processEmfPlusSerializableObject(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSerializableObject");
      }
      processEmfPlusSetTSGraphics(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetTSGraphics");
      }
      processEmfPlusSetTSClip(flags, data) {
        __wmfEmfRendererLog("Processing EmfPlusSetTSClip");
      }
    };
    module2.exports = EmfPlusDrawer2;
  }
});

// src/modules/drawers/wmfDrawer.js
var require_wmfDrawer = __commonJS({
  "src/modules/drawers/wmfDrawer.js"(exports2, module2) {
    "use strict";
    var BaseDrawer2 = require_baseDrawer();
    var EmfPlusDrawer2 = require_emfPlusDrawer();
    var MathTypeMtefParser2 = require_mathTypeMtefParser();
    var WMF_RECORD_HANDLERS = {
      // ========== 状态记录 (State Records) ==========
      259: "processSetMapMode",
      // META_SETMAPMODE
      523: "processSetWindowOrg",
      // META_SETWINDOWORG
      524: "processSetWindowExt",
      // META_SETWINDOWEXT
      525: "processSetViewportOrg",
      // META_SETVIEWPORTORG
      526: "processSetViewportExt",
      // META_SETVIEWPORTEXT
      513: "processSetBkColor",
      // META_SETBKCOLOR
      258: "processSetBkMode",
      // META_SETBKMODE
      521: "processSetTextColor",
      // META_SETTEXTCOLOR
      260: "processSetROP2",
      // META_SETROP2
      262: "processSetPolyFillMode",
      // META_SETPOLYFILLMODE
      263: "processSetStretchBltMode",
      // META_SETSTRETCHBLTMODE
      302: "processSetTextAlign",
      // META_SETTEXTALIGN
      // ========== 对象创建记录 (Object Creation Records) ==========
      762: "processCreatePenIndirect",
      // META_CREATEPENINDIRECT
      764: "processCreateBrushIndirect",
      // META_CREATEBRUSHINDIRECT
      763: "processCreateFontIndirect",
      // META_CREATEFONTINDIRECT
      300: "processSelectClipRgn",
      // META_SELECTCLIPREGION
      247: "processCreatePalette",
      // META_CREATEPALETTE
      505: "processCreatePatternBrush",
      // META_CREATEPATTERNBRUSH
      248: "processCreateBrush",
      // META_CREATEBRUSH（已废弃，占位创建画刷）
      511: "processCreateRegion",
      // META_CREATEREGION
      // ========== 对象选择/删除记录 ==========
      301: "processSelectObject",
      // META_SELECTOBJECT
      496: "processDeleteObject",
      // META_DELETEOBJECT
      // ========== 绘图记录 (Drawing Records) ==========
      531: "processLineTo",
      // META_LINETO
      532: "processMoveTo",
      // META_MOVETO
      1051: "processRectangle",
      // META_RECTANGLE
      1564: "processRoundRect",
      // META_ROUNDRECT
      1048: "processEllipse",
      // META_ELLIPSE
      2071: "processArc",
      // META_ARC
      2074: "processPie",
      // META_PIE
      2096: "processChord",
      // META_CHORD
      805: "processPolyline",
      // META_POLYLINE
      804: "processPolygon",
      // META_POLYGON
      1336: "processPolyPolygon",
      // META_POLYPOLYGON
      // ========== 文本记录 ==========
      1313: "processTextOut",
      // META_TEXTOUT
      2610: "processExtTextOut",
      // META_EXTTEXTOUT
      1574: "processEscape",
      // META_ESCAPE
      // ========== 位图操作记录 ==========
      2368: "processDibBitBlt",
      // META_DIBBITBLT
      2881: "processDibStretchBlt",
      // META_DIBSTRETCHBLT
      3907: "processStretchDib",
      // META_STRETCHDIB
      // ========== 填充/裁剪记录 ==========
      552: "processFillRgn",
      // META_FILLREGION
      1045: null,
      // META_EXCLUDECLIPRECT（Canvas 不支持区域差集，跳过）
      1046: null,
      // META_INTERSECTCLIPRECT（Canvas 不支持区域交集裁剪，跳过）
      1049: null,
      // META_FLOODFILL（Canvas 无泛洪填充，跳过）
      // ========== 状态管理 ==========
      30: "processSaveDC",
      // META_SAVEDC
      295: "processRestoreDC",
      // META_RESTOREDC
      // ========== 已识别但无需处理 ==========
      0: null
      // META_EOF
    };
    var WmfDrawer2 = class extends BaseDrawer2 {
      constructor(ctx) {
        super(ctx);
        this.emfPlusDetected = false;
        this.emfPlusRecordCount = 0;
        this.emfPlusRecords = [];
        this.emfPlusDrawer = null;
        this.currentPosX = 0;
        this.currentPosY = 0;
        this.hasValidPosition = false;
        this.textAlignFlags = 0;
        this.textUpdateCp = false;
        this.currentFontFace = "Arial";
        this.currentCharset = 0;
        this.arcDirection = 1;
      }
      draw(metafileData, options = {}) {
        __wmfEmfRendererLog("Drawing WMF with header:", metafileData.header);
        __wmfEmfRendererLog("Number of records:", metafileData.records.length);
        this.header = metafileData.header;
        this.initCanvas(metafileData, options);
        this.isMathType = false;
        this.mathTypeMtefStreams = [];
        this.mathTypeMtefStreamIndex = 0;
        this.mathTypeMtefIndex = 0;
        this.appsMfccSkipping = 0;
        const wmfcBlocks = [];
        for (let i = 0; i < metafileData.records.length; i++) {
          const record = metafileData.records[i];
          if (record.functionId === 1574) {
            const data = record.data;
            const mtefBytes = this.extractMathTypeMtef(data);
            if (mtefBytes) {
              this.isMathType = true;
              const parsed = new MathTypeMtefParser2(mtefBytes).parse();
              if (parsed && Array.isArray(parsed.chars) && parsed.chars.length > 0) {
                this.mathTypeMtefStreams.push(parsed.chars);
              }
            }
            if (this.isMathTypeComment(data)) {
              this.isMathType = true;
            }
            const wmfcData = this.extractWmfcData(record);
            if (wmfcData) {
              wmfcBlocks.push(wmfcData);
            }
          }
        }
        if (this.isMathType) {
          __wmfEmfRendererLog("MathType \u6CE8\u91CA\u68C0\u6D4B\u5230\uFF0CMTEF \u6D41\u6570\uFF08\u4EC5\u8BCA\u65AD\uFF09:", this.mathTypeMtefStreams.length);
        }
        const enableEmfPlusDual = true;
        if (enableEmfPlusDual) {
          if (wmfcBlocks.length > 0) {
            __wmfEmfRendererLog("\u68C0\u6D4B\u5230 EMF+ Dual \u683C\u5F0F");
            __wmfEmfRendererLog("WMFC \u6570\u636E\u5757\u6570:", wmfcBlocks.length);
            const emfData = this.reconstructEmfData(wmfcBlocks);
            if (emfData && emfData.length > 0) {
              __wmfEmfRendererLog("EMF \u6570\u636E\u91CD\u7EC4\u5B8C\u6210\uFF0C\u5927\u5C0F:", (emfData.length / 1024).toFixed(2), "KB");
              try {
                let EmfParser2, EmfDrawer2;
                if (typeof require !== "undefined") {
                  EmfParser2 = require_emfParser();
                  EmfDrawer2 = require_emfDrawer();
                } else if (typeof window !== "undefined") {
                  EmfParser2 = window.EmfParser;
                  EmfDrawer2 = window.EmfDrawer;
                } else {
                  throw new Error("Unsupported environment");
                }
                const emfParser = new EmfParser2(emfData);
                const emfParsedData = emfParser.parse();
                __wmfEmfRendererLog("EMF \u89E3\u6790\u5B8C\u6210\uFF0C\u8BB0\u5F55\u6570:", emfParsedData.records.length);
                const emfDrawer = new EmfDrawer2(this.ctx);
                emfDrawer.draw(emfParsedData, options);
                this.emfPlusDetected = true;
                this.emfPlusRecordCount = emfParsedData.records.length;
                __wmfEmfRendererLog("\u2705 EMF+ Dual \u683C\u5F0F\u6E32\u67D3\u5B8C\u6210");
                return;
              } catch (error) {
                console.error("EMF \u89E3\u6790/\u7ED8\u5236\u5931\u8D25:", error);
              }
            }
          }
        }
        __wmfEmfRendererLog("\u4F7F\u7528\u6807\u51C6 WMF \u6E32\u67D3");
        const debugLogs = globalThis.__WMF_DEBUG__;
        for (let i = 0; i < metafileData.records.length; i++) {
          const record = metafileData.records[i];
          if (debugLogs) {
            __wmfEmfRendererLog("Processing WMF record", i, ":", record.functionId, "(0x" + record.functionId.toString(16).padStart(4, "0") + ")");
          }
          this.processRecord(record);
        }
        this.finishPath();
        __wmfEmfRendererLog("WMF drawing completed");
      }
      // 从 ESCAPE 记录中提取 WMFC 数据
      extractWmfcData(record) {
        const data = record.data;
        if (data.length < 8) return null;
        const escapeFunction = this.readWordFromData(data, 0);
        if (escapeFunction !== 15) return null;
        const signature = String.fromCharCode(data[4], data[5], data[6], data[7]);
        if (signature === "WMFC") {
          let emfHeaderOffset = -1;
          for (let i = 0; i < data.length - 3; i++) {
            if (data[i] === 32 && data[i + 1] === 69 && data[i + 2] === 77 && data[i + 3] === 70) {
              const candidate = i - 40;
              if (candidate >= 0) {
                emfHeaderOffset = candidate;
                break;
              }
            }
          }
          if (emfHeaderOffset >= 0) {
            __wmfEmfRendererLog("\u627E\u5230 EMF Header at offset", emfHeaderOffset);
            return data.subarray(emfHeaderOffset);
          }
          const fallbackOffset = 38;
          if (data.length > fallbackOffset) {
            return data.subarray(fallbackOffset);
          }
        }
        return null;
      }
      // 重组所有 WMFC 块为完整的 EMF 数据
      reconstructEmfData(wmfcBlocks) {
        try {
          let totalLength = 0;
          wmfcBlocks.forEach((block) => {
            totalLength += block.length;
          });
          __wmfEmfRendererLog("\u91CD\u7EC4 EMF \u6570\u636E\uFF0C\u603B\u957F\u5EA6:", totalLength, "\u5B57\u8282");
          const emfData = new Uint8Array(totalLength);
          let offset = 0;
          for (let i = 0; i < wmfcBlocks.length; i++) {
            emfData.set(wmfcBlocks[i], offset);
            offset += wmfcBlocks[i].length;
          }
          return emfData;
        } catch (error) {
          console.error("EMF \u6570\u636E\u91CD\u7EC4\u5931\u8D25:", error);
          return null;
        }
      }
      processRecord(record) {
        const handlerName = WMF_RECORD_HANDLERS[record.functionId];
        if (handlerName !== void 0) {
          if (handlerName !== null) {
            this[handlerName](record.data);
          }
          return;
        }
        __wmfEmfRendererLog("Unknown/Unimplemented WMF function:", record.functionId, "(0x" + record.functionId.toString(16).padStart(4, "0") + ")");
      }
      // ========== 辅助方法 ==========
      readWordFromData(data, offset) {
        if (offset + 1 >= data.length) return 0;
        return data[offset] | data[offset + 1] << 8;
      }
      readShortFromData(data, offset) {
        const value = this.readWordFromData(data, offset);
        return value & 32768 ? value - 65536 : value;
      }
      readDwordFromData(data, offset) {
        if (offset + 3 >= data.length) return 0;
        return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
      }
      // 读取有符号 32 位整数
      readLongFromData(data, offset) {
        const value = this.readDwordFromData(data, offset);
        return value > 2147483647 ? value - 4294967296 : value;
      }
      readStringFromData(data, offset, length) {
        let str = "";
        for (let i = 0; i < length && offset + i < data.length; i++) {
          if (data[offset + i] !== 0) {
            str += String.fromCharCode(data[offset + i]);
          }
        }
        return str;
      }
      mapSymbolString(text) {
        if (!/symbol/i.test(this.currentFontFace || "")) return text;
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          const greekUpper = {
            65: "\u0391",
            66: "\u0392",
            67: "\u03A7",
            68: "\u0394",
            69: "\u0395",
            70: "\u03A6",
            71: "\u0393",
            72: "\u0397",
            73: "\u0399",
            74: "\u03D1",
            75: "\u039A",
            76: "\u039B",
            77: "\u039C",
            78: "\u039D",
            79: "\u039F",
            80: "\u03A0",
            81: "\u0398",
            82: "\u03A1",
            83: "\u03A3",
            84: "\u03A4",
            85: "\u03A5",
            86: "\u03C2",
            87: "\u03A9",
            88: "\u039E",
            89: "\u03A8",
            90: "\u0396"
          };
          const greekLower = {
            97: "\u03B1",
            98: "\u03B2",
            99: "\u03C7",
            100: "\u03B4",
            101: "\u03B5",
            102: "\u03C6",
            103: "\u03B3",
            104: "\u03B7",
            105: "\u03B9",
            106: "\u03D5",
            107: "\u03BA",
            108: "\u03BB",
            109: "\u03BC",
            110: "\u03BD",
            111: "\u03BF",
            112: "\u03C0",
            113: "\u03B8",
            114: "\u03C1",
            115: "\u03C3",
            116: "\u03C4",
            117: "\u03C5",
            118: "\u03D6",
            119: "\u03C9",
            120: "\u03BE",
            121: "\u03C8",
            122: "\u03B6"
          };
          const symbolMap = {
            161: "\u03D2",
            162: "\u2032",
            163: "\u2264",
            164: "\u2044",
            165: "\u221E",
            166: "\u0192",
            167: "\u2663",
            168: "\u2666",
            169: "\u2665",
            170: "\u2660",
            171: "\u2194",
            172: "\u2190",
            173: "\u2191",
            174: "\u2192",
            175: "\u2193",
            176: "\xB0",
            177: "\xB1",
            178: "\u2033",
            179: "\u2265",
            180: "\xD7",
            181: "\u221D",
            182: "\u2202",
            183: "\u2022",
            184: "\xF7",
            185: "\u2260",
            186: "\u2261",
            187: "\u2248",
            188: "\u2026",
            189: "\u2502",
            190: "\u2500",
            191: "\u21B5",
            192: "\u2135",
            193: "\u2111",
            194: "\u211C",
            195: "\u2118",
            196: "\u2297",
            197: "\u2295",
            198: "\u2205",
            199: "\u2229",
            200: "\u222A",
            201: "\u2283",
            202: "\u2287",
            203: "\u2284",
            204: "\u2282",
            205: "\u2286",
            206: "\u2208",
            207: "\u2209",
            208: "\u2220",
            209: "\u2207",
            210: "\xAE",
            211: "\xA9",
            212: "\u2122",
            213: "\u220F",
            214: "\u221A",
            215: "\u22C5",
            216: "\xAC",
            217: "\u2227",
            218: "\u2228",
            219: "\u21D4",
            220: "\u21D0",
            221: "\u21D1",
            222: "\u21D2",
            223: "\u21D3",
            224: "\u25CA",
            225: "\u27E8",
            226: "\xAE",
            227: "\xA9",
            228: "\u2122",
            229: "\u2211",
            230: "(",
            231: "|",
            232: "(",
            233: "[",
            234: "|",
            235: "[",
            236: "{",
            237: "|",
            238: "{",
            239: "|",
            241: "\u27E9",
            242: "\u222B",
            243: "\u222B",
            244: "|",
            245: "\u222B",
            246: ")",
            247: "|",
            248: ")",
            249: "]",
            250: "|",
            251: "]",
            252: "}",
            253: "|",
            254: "}"
          };
          if (greekUpper[code]) {
            out += greekUpper[code];
          } else if (greekLower[code]) {
            out += greekLower[code];
          } else if (symbolMap[code]) {
            out += symbolMap[code];
          } else {
            out += text[i];
          }
        }
        return out;
      }
      rgbToHex(rgb) {
        const r = (rgb & 255).toString(16).padStart(2, "0");
        const g = (rgb >> 8 & 255).toString(16).padStart(2, "0");
        const b = (rgb >> 16 & 255).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      // ========== 实现绘制方法 ==========
      processSetMapMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetMapMode:", mode);
        this.coordinateTransformer.setMapMode(mode);
      }
      processSetWindowOrg(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        __wmfEmfRendererLog("SetWindowOrg:", x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
      }
      processSetWindowExt(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        __wmfEmfRendererLog("SetWindowExt:", x, y);
        this.coordinateTransformer.setWindowExt(x, y);
      }
      processSetViewportOrg(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        __wmfEmfRendererLog("SetViewportOrg:", x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
      }
      processSetViewportExt(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        __wmfEmfRendererLog("SetViewportExt:", x, y);
        this.coordinateTransformer.setViewportExt(x, y);
      }
      processSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("SetBkColor:", color);
      }
      processSetBkMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetBkMode:", mode);
      }
      processSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("SetTextColor:", color);
        this.ctx.fillStyle = this.rgbToHex(color);
      }
      processSetROP2(data) {
        if (data.length < 2) return;
        const rop2 = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetROP2:", rop2);
      }
      processSetPolyFillMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetPolyFillMode:", mode);
      }
      processSetStretchBltMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetStretchBltMode:", mode);
      }
      processSetTextAlign(data) {
        if (data.length < 2) return;
        const align = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SetTextAlign:", align);
        this.textAlignFlags = align;
        this.textUpdateCp = (align & 1) !== 0;
        const horiz = align & 6;
        if (horiz === 2) {
          this.ctx.textAlign = "right";
        } else if (horiz === 6) {
          this.ctx.textAlign = "center";
        } else {
          this.ctx.textAlign = "left";
        }
        const vert = align & 24;
        if (vert === 8) {
          this.ctx.textBaseline = "bottom";
        } else if (vert === 24) {
          this.ctx.textBaseline = "alphabetic";
        } else {
          this.ctx.textBaseline = "top";
        }
      }
      processCreatePenIndirect(data) {
        if (data.length < 10) return;
        const style = this.readWordFromData(data, 0);
        const originalWidth = this.readWordFromData(data, 2);
        let width = originalWidth;
        const color = this.readDwordFromData(data, 6);
        const scale = this.coordinateTransformer.getScale();
        width = Math.max(1, Math.round(width * scale.x));
        __wmfEmfRendererLog("Pen width conversion:", originalWidth, "logical units ->", width, "pixels (scale:", scale.x, ")");
        __wmfEmfRendererLog("CreatePenIndirect:", style, width, color);
        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createPen(style, width, penColor);
      }
      processCreateBrushIndirect(data) {
        if (data.length < 8) return;
        const style = this.readWordFromData(data, 0);
        const color = this.readDwordFromData(data, 2);
        __wmfEmfRendererLog("CreateBrushIndirect:", style, color);
        const brushColor = this.rgbToHex(color);
        this.gdiObjectManager.createBrush(style, brushColor);
      }
      // META_CREATEBRUSH (0x00F8, 已废弃)：仅含 ColorRef (4 字节)，按实心画刷处理
      processCreateBrush(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        __wmfEmfRendererLog("CreateBrush (obsolete):", color);
        this.gdiObjectManager.createBrush(0, this.rgbToHex(color));
      }
      processCreateFontIndirect(data) {
        if (data.length < 18) return;
        let height = this.readWordFromData(data, 0);
        if (height > 32767) height = height - 65536;
        height = Math.abs(height);
        const width = this.readWordFromData(data, 2);
        const weight = this.readWordFromData(data, 8);
        const italic = data[10];
        const underline = data[11];
        const strikeOut = data[12];
        const charset = data[13];
        const faceBytes = [];
        for (let i = 18; i < Math.min(data.length, 18 + 32); i++) {
          if (data[i] === 0) break;
          faceBytes.push(data[i]);
        }
        let faceName = "";
        const charsetLabel = this.getDbcsCharsetLabel(charset);
        if (charsetLabel && faceBytes.some((b) => b > 126)) {
          try {
            faceName = new TextDecoder(charsetLabel).decode(Uint8Array.from(faceBytes));
          } catch (e) {
          }
        }
        if (!faceName) {
          for (const b of faceBytes) {
            if (b >= 32 && b <= 126) faceName += String.fromCharCode(b);
          }
        }
        if (faceName === "") faceName = "Arial";
        __wmfEmfRendererLog("CreateFontIndirect: height=", height, "width=", width, "weight=", weight, "charset=", charset, "faceName=", faceName);
        this.gdiObjectManager.createFont(height, width, weight, italic, underline, strikeOut, faceName, charset);
      }
      processSelectClipRgn(data) {
        if (data.length < 2) return;
        const regionIndex = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SelectClipRgn:", regionIndex);
      }
      processSelectObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("SelectObject:", objectIndex);
        const obj = this.gdiObjectManager.selectObject(objectIndex);
        if (obj) {
          this.applyGdiObject(obj);
        } else if (objectIndex >= 2147483648) {
          this.applyStockObject(objectIndex);
        }
      }
      applyGdiObject(obj) {
        if (obj.type === "pen") {
          this.ctx.strokeStyle = obj.color;
          this.ctx.lineWidth = obj.width || 1;
          this.strokeColor = obj.color;
        } else if (obj.type === "brush") {
          this.ctx.fillStyle = obj.color;
          this.fillColor = obj.color;
        } else if (obj.type === "font") {
          let fontSize = Math.abs(obj.height) || 12;
          const scale = this.coordinateTransformer.getScale();
          fontSize = Math.max(1, Math.round(fontSize * scale.y));
          __wmfEmfRendererLog("Font size conversion:", obj.height, "logical units ->", fontSize, "pixels (scale:", scale.y, ")");
          const fontWeight = obj.weight >= 700 ? "bold" : "normal";
          const fontStyle = obj.italic ? "italic" : "normal";
          let fontFamily = obj.faceName || "Arial";
          this.currentCharset = obj.charset || 0;
          if (/[\u1100-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(fontFamily)) {
            fontFamily = `${fontFamily}, serif`;
          }
          this.ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
          __wmfEmfRendererLog("Applied font:", this.ctx.font);
          this.currentFontFace = obj.faceName || "Arial";
        }
      }
      applyStockObject(stockIndex) {
        const color = this.gdiObjectManager.getStockObject(stockIndex);
        if (color) {
          this.ctx.fillStyle = color;
          this.fillColor = color;
        }
      }
      processDeleteObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("DeleteObject:", objectIndex);
        this.gdiObjectManager.deleteObject(objectIndex);
      }
      processMoveTo(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        __wmfEmfRendererLog("MoveTo:", x, y, "->", transformed.x, transformed.y);
        this.currentPosX = x;
        this.currentPosY = y;
        this.hasValidPosition = true;
      }
      processLineTo(data) {
        if (data.length < 4) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        __wmfEmfRendererLog("LineTo:", x, y, "->", transformed.x, transformed.y);
        let startX, startY;
        if (this.hasValidPosition) {
          const startTransformed = this.coordinateTransformer.transform(
            this.currentPosX,
            this.currentPosY,
            this.ctx.canvas.width,
            this.ctx.canvas.height
          );
          startX = startTransformed.x;
          startY = startTransformed.y;
        } else {
          const startTransformed = this.coordinateTransformer.transform(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
          startX = startTransformed.x;
          startY = startTransformed.y;
        }
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(transformed.x, transformed.y);
        this.ctx.stroke();
        this.currentPosX = x;
        this.currentPosY = y;
        this.hasValidPosition = true;
        this.currentPath = [];
      }
      processRectangle(data) {
        if (data.length < 8) return;
        const bottom = this.readShortFromData(data, 0);
        const right = this.readShortFromData(data, 2);
        const top = this.readShortFromData(data, 4);
        const left = this.readShortFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        __wmfEmfRendererLog("Rectangle:", left, top, right, bottom);
        this.ctx.fillRect(
          transformedLeftTop.x,
          transformedLeftTop.y,
          transformedRightBottom.x - transformedLeftTop.x,
          transformedRightBottom.y - transformedLeftTop.y
        );
        this.ctx.strokeRect(
          transformedLeftTop.x,
          transformedLeftTop.y,
          transformedRightBottom.x - transformedLeftTop.x,
          transformedRightBottom.y - transformedLeftTop.y
        );
      }
      // 计算部分椭圆弧的起止角（画布角度）。
      // WMF 的 META_ARC 按 MS-WMF 规范始终逆时针绘制：
      // GDI 坐标 Y 轴向下，"逆时针" 在屏幕上即逆时针 = 画布 anticlockwise=true
      _calcArcAngles(cx, cy, rx, ry, startX, startY, endX, endY) {
        const st = this.coordinateTransformer.transform(startX, startY, this.ctx.canvas.width, this.ctx.canvas.height);
        const en = this.coordinateTransformer.transform(endX, endY, this.ctx.canvas.width, this.ctx.canvas.height);
        const startAngle = Math.atan2((st.y - cy) / ry, (st.x - cx) / rx);
        const endAngle = Math.atan2((en.y - cy) / ry, (en.x - cx) / rx);
        return {
          startAngle,
          endAngle,
          anticlockwise: this.arcDirection !== 2
        };
      }
      processEllipse(data) {
        if (data.length < 8) return;
        const bottom = this.readShortFromData(data, 0);
        const right = this.readShortFromData(data, 2);
        const top = this.readShortFromData(data, 4);
        const left = this.readShortFromData(data, 6);
        __wmfEmfRendererLog("Ellipse:", left, top, right, bottom);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
        const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
        const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
        const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;
        if (radiusX === 0 || radiusY === 0) return;
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
      processRoundRect(data) {
        if (data.length < 12) return;
        const bottom = this.readShortFromData(data, 0);
        const right = this.readShortFromData(data, 2);
        const top = this.readShortFromData(data, 4);
        const left = this.readShortFromData(data, 6);
        const cornerWidth = this.readWordFromData(data, 8);
        const cornerHeight = this.readWordFromData(data, 10);
        __wmfEmfRendererLog("RoundRect:", left, top, right, bottom, "corner:", cornerWidth, cornerHeight);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        const w = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const h = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const scale = this.coordinateTransformer.getScale();
        let rx = Math.max(0, cornerWidth / 2 * Math.abs(scale.x));
        let ry = Math.max(0, cornerHeight / 2 * Math.abs(scale.y));
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        this.ctx.beginPath();
        if (typeof this.ctx.roundRect === "function") {
          this.ctx.roundRect(x, y, w, h, [rx, ry]);
        } else {
          this._roundRectPath(x, y, w, h, rx, ry);
        }
        this.ctx.fill();
        this.ctx.stroke();
      }
      // 兼容不支持 ctx.roundRect 的上下文（如旧版 SvgContext / Mock 环境）
      _roundRectPath(x, y, w, h, rx, ry) {
        if (rx <= 0 || ry <= 0) {
          this.ctx.rect(x, y, w, h);
          return;
        }
        this.ctx.moveTo(x + rx, y);
        this.ctx.lineTo(x + w - rx, y);
        this.ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
        this.ctx.lineTo(x + w, y + h - ry);
        this.ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
        this.ctx.lineTo(x + rx, y + h);
        this.ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
        this.ctx.lineTo(x, y + ry);
        this.ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
        this.ctx.closePath();
      }
      // 绘制椭圆弧/饼图/弦的公共逻辑
      _drawArcRecord(data, kind) {
        if (data.length < 16) return;
        const bottom = this.readShortFromData(data, 0);
        const right = this.readShortFromData(data, 2);
        const top = this.readShortFromData(data, 4);
        const left = this.readShortFromData(data, 6);
        const startY = this.readShortFromData(data, 8);
        const startX = this.readShortFromData(data, 10);
        const endY = this.readShortFromData(data, 12);
        const endX = this.readShortFromData(data, 14);
        __wmfEmfRendererLog(kind + ":", left, top, right, bottom, "start:", startX, startY, "end:", endX, endY);
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
        if (kind === "Pie") {
          this.ctx.moveTo(centerX, centerY);
        }
        if (full) {
          this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        } else {
          this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, startAngle, endAngle, anticlockwise);
        }
        if (kind === "Chord" || kind === "Pie") {
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        } else {
          this.ctx.stroke();
        }
      }
      processArc(data) {
        this._drawArcRecord(data, "Arc");
      }
      processPie(data) {
        this._drawArcRecord(data, "Pie");
      }
      processChord(data) {
        this._drawArcRecord(data, "Chord");
      }
      // ========== DIB 位图记录 ==========
      // 渲染 DIB 位图到 destX/destY/destWidth/destHeight（逻辑坐标）
      renderDib(data, dibOffset, destX, destY, destWidth, destHeight) {
        try {
          if (dibOffset + 40 > data.length) return false;
          let bmiOffset = dibOffset;
          if (data[dibOffset] === 66 && data[dibOffset + 1] === 77) {
            bmiOffset = dibOffset + 14;
          }
          const biSize = this.readDwordFromData(data, bmiOffset);
          if (biSize !== 40 && biSize !== 108 && biSize !== 124) return false;
          const biWidth = this.readLongFromData(data, bmiOffset + 4);
          const biHeightRaw = this.readLongFromData(data, bmiOffset + 8);
          const biBitCount = this.readWordFromData(data, bmiOffset + 14);
          const biCompression = this.readDwordFromData(data, bmiOffset + 16);
          if (biWidth <= 0 || biWidth > 2e4 || Math.abs(biHeightRaw) > 2e4) return false;
          if (biBitCount !== 1 && biBitCount !== 4 && biBitCount !== 8 && biBitCount !== 16 && biBitCount !== 24 && biBitCount !== 32) return false;
          __wmfEmfRendererLog("  DIB Bitmap:", biWidth, "x", biHeightRaw, "bits:", biBitCount, "compression:", biCompression);
          let colorTableSize = 0;
          if (biBitCount <= 8) {
            const biClrUsed = this.readDwordFromData(data, bmiOffset + 32);
            colorTableSize = (biClrUsed || 1 << biBitCount) * 4;
          }
          const bitsOffset = bmiOffset + biSize + colorTableSize;
          const bitsSize = data.length - bitsOffset;
          if (biCompression !== 0 || bitsOffset >= data.length) return false;
          const rowSize = Math.ceil(biWidth * biBitCount / 32) * 4;
          const absHeight = Math.abs(biHeightRaw);
          const isBottomUp = biHeightRaw > 0;
          const imageData = this.ctx.createImageData(biWidth, absHeight);
          const pixels = imageData.data;
          const palette = [];
          if (biBitCount <= 8) {
            const count = 1 << biBitCount;
            for (let i = 0; i < count; i++) {
              const o = bmiOffset + biSize + i * 4;
              if (o + 4 > data.length) break;
              palette.push([data[o + 2], data[o + 1], data[o], 255]);
            }
          }
          for (let y = 0; y < absHeight; y++) {
            const srcY = isBottomUp ? absHeight - 1 - y : y;
            const srcRowOffset = bitsOffset + srcY * rowSize;
            for (let x = 0; x < biWidth; x++) {
              const dstOffset = (y * biWidth + x) * 4;
              let r = 0, g = 0, b = 0, a = 255;
              if (biBitCount === 1) {
                const byteIdx = srcRowOffset + (x >> 3);
                if (byteIdx < bitsOffset + bitsSize) {
                  const bit = 7 - (x & 7);
                  const c = palette[data[byteIdx] >> bit & 1] || [0, 0, 0, 255];
                  r = c[0];
                  g = c[1];
                  b = c[2];
                }
              } else if (biBitCount === 4) {
                const byteIdx = srcRowOffset + (x >> 1);
                if (byteIdx < bitsOffset + bitsSize) {
                  const idx = (x & 1) === 0 ? data[byteIdx] >> 4 : data[byteIdx] & 15;
                  const c = palette[idx] || [0, 0, 0, 255];
                  r = c[0];
                  g = c[1];
                  b = c[2];
                }
              } else if (biBitCount === 8) {
                const idx = data[srcRowOffset + x];
                const c = palette[idx] || [0, 0, 0, 255];
                r = c[0];
                g = c[1];
                b = c[2];
              } else if (biBitCount === 16) {
                const o = srcRowOffset + x * 2;
                if (o + 2 <= bitsOffset + bitsSize) {
                  const v = data[o] | data[o + 1] << 8;
                  r = (v >> 10 & 31) * 255 / 31;
                  g = (v >> 5 & 31) * 255 / 31;
                  b = (v & 31) * 255 / 31;
                }
              } else if (biBitCount === 24) {
                const o = srcRowOffset + x * 3;
                if (o + 3 <= bitsOffset + bitsSize) {
                  b = data[o];
                  g = data[o + 1];
                  r = data[o + 2];
                }
              } else if (biBitCount === 32) {
                const o = srcRowOffset + x * 4;
                if (o + 4 <= bitsOffset + bitsSize) {
                  b = data[o];
                  g = data[o + 1];
                  r = data[o + 2];
                  a = data[o + 3];
                }
              }
              pixels[dstOffset] = r | 0;
              pixels[dstOffset + 1] = g | 0;
              pixels[dstOffset + 2] = b | 0;
              pixels[dstOffset + 3] = a;
            }
          }
          const canvasCtor = typeof document === "undefined" && this.ctx.canvas ? this.ctx.canvas.constructor : null;
          const isRealCanvasCtor = typeof canvasCtor === "function" && canvasCtor.name !== "Object";
          const tempCanvas = typeof document !== "undefined" ? document.createElement("canvas") : isRealCanvasCtor ? new canvasCtor(biWidth, absHeight) : null;
          if (tempCanvas) {
            tempCanvas.width = biWidth;
            tempCanvas.height = absHeight;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.putImageData(imageData, 0, 0);
            const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
            const transformed2 = this.coordinateTransformer.transform(destX + destWidth, destY + destHeight, this.ctx.canvas.width, this.ctx.canvas.height);
            const w = Math.abs(transformed2.x - transformed1.x);
            const h = Math.abs(transformed2.y - transformed1.y);
            __wmfEmfRendererLog("  Rendering DIB to:", transformed1.x, transformed1.y, w, h);
            this.ctx.drawImage(tempCanvas, transformed1.x, transformed1.y, w, h);
          } else {
            const transformed = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
            this.ctx.putImageData(imageData, transformed.x, transformed.y);
          }
          return true;
        } catch (error) {
          __wmfEmfRendererLog("  Failed to render DIB:", error.message);
          return false;
        }
      }
      processDibBitBlt(data) {
        if (data.length < 16) return;
        const rop = this.readDwordFromData(data, 0);
        const destHeight = this.readShortFromData(data, 8);
        const destWidth = this.readShortFromData(data, 10);
        const destY = this.readShortFromData(data, 12);
        const destX = this.readShortFromData(data, 14);
        __wmfEmfRendererLog("DibBitBlt: rop=", rop.toString(16), "dest=", destX, destY, destWidth, "x", destHeight);
        if (!this.renderDib(data, 16, destX, destY, destWidth, destHeight)) {
          this._drawDibPlaceholder(destX, destY, destWidth, destHeight);
        }
      }
      processDibStretchBlt(data) {
        if (data.length < 20) return;
        const rop = this.readDwordFromData(data, 0);
        const srcHeight = this.readShortFromData(data, 4);
        const srcWidth = this.readShortFromData(data, 6);
        const destHeight = this.readShortFromData(data, 12);
        const destWidth = this.readShortFromData(data, 14);
        const destY = this.readShortFromData(data, 16);
        const destX = this.readShortFromData(data, 18);
        __wmfEmfRendererLog("DibStretchBlt: rop=", rop.toString(16), "src=", srcWidth, "x", srcHeight, "dest=", destX, destY, destWidth, "x", destHeight);
        if (!this.renderDib(data, 20, destX, destY, destWidth, destHeight)) {
          this._drawDibPlaceholder(destX, destY, destWidth, destHeight);
        }
      }
      processStretchDib(data) {
        if (data.length < 22) return;
        const rop = this.readDwordFromData(data, 0);
        const colorUsage = this.readWordFromData(data, 4);
        const srcHeight = this.readShortFromData(data, 6);
        const srcWidth = this.readShortFromData(data, 8);
        const destHeight = this.readShortFromData(data, 14);
        const destWidth = this.readShortFromData(data, 16);
        const destY = this.readShortFromData(data, 18);
        const destX = this.readShortFromData(data, 20);
        __wmfEmfRendererLog("StretchDib: rop=", rop.toString(16), "colorUsage=", colorUsage, "dest=", destX, destY, destWidth, "x", destHeight);
        if (!this.renderDib(data, 22, destX, destY, destWidth, destHeight)) {
          this._drawDibPlaceholder(destX, destY, destWidth, destHeight);
        }
      }
      // 位图解析失败时绘制占位矩形
      _drawDibPlaceholder(destX, destY, destWidth, destHeight) {
        const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformed2 = this.coordinateTransformer.transform(destX + destWidth, destY + destHeight, this.ctx.canvas.width, this.ctx.canvas.height);
        const w = Math.abs(transformed2.x - transformed1.x);
        const h = Math.abs(transformed2.y - transformed1.y);
        if (w <= 0 || h <= 0) return;
        const savedFill = this.ctx.fillStyle;
        const savedStroke = this.ctx.strokeStyle;
        this.ctx.fillStyle = "#f0f0f0";
        this.ctx.strokeStyle = "#cccccc";
        this.ctx.fillRect(transformed1.x, transformed1.y, w, h);
        this.ctx.strokeRect(transformed1.x, transformed1.y, w, h);
        this.ctx.fillStyle = savedFill;
        this.ctx.strokeStyle = savedStroke;
      }
      processPolyline(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("Polyline, numPoints:", numPoints);
        if (data.length < 2 + numPoints * 4) return;
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const x = this.readShortFromData(data, 2 + i * 4);
          const y = this.readShortFromData(data, 4 + i * 4);
          const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
          if (i < 3 || i === numPoints - 1) {
            __wmfEmfRendererLog(`  Point ${i}: logical (${x}, ${y}) -> canvas (${transformed.x.toFixed(2)}, ${transformed.y.toFixed(2)})`);
          }
          if (i === 0) {
            this.ctx.moveTo(transformed.x, transformed.y);
          } else {
            this.ctx.lineTo(transformed.x, transformed.y);
          }
        }
        this.ctx.stroke();
      }
      processPolygon(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("Polygon, numPoints:", numPoints);
        if (data.length < 2 + numPoints * 4) return;
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const x = this.readShortFromData(data, 2 + i * 4);
          const y = this.readShortFromData(data, 4 + i * 4);
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
      processPolyPolygon(data) {
        if (data.length < 2) return;
        const numPolygons = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("PolyPolygon, numPolygons:", numPolygons);
        if (data.length < 2 + numPolygons * 2) return;
        const pointCounts = [];
        let offset = 2;
        for (let i = 0; i < numPolygons; i++) {
          pointCounts.push(this.readWordFromData(data, offset));
          offset += 2;
        }
        for (let i = 0; i < numPolygons; i++) {
          const numPoints = pointCounts[i];
          __wmfEmfRendererLog(`  Polygon ${i}: ${numPoints} points`);
          if (offset + numPoints * 4 > data.length) break;
          this.ctx.beginPath();
          for (let j = 0; j < numPoints; j++) {
            const x = this.readShortFromData(data, offset);
            const y = this.readShortFromData(data, offset + 2);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            if (i === 0 && j < 3) {
              __wmfEmfRendererLog(`    Point ${j}: logical (${x}, ${y}) -> canvas (${transformed.x.toFixed(2)}, ${transformed.y.toFixed(2)})`);
            }
            if (j === 0) {
              this.ctx.moveTo(transformed.x, transformed.y);
            } else {
              this.ctx.lineTo(transformed.x, transformed.y);
            }
            offset += 4;
          }
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        }
      }
      processTextOut(data) {
        if (data.length < 2) return;
        const textLength = this.readWordFromData(data, 0);
        if (data.length < 2 + textLength + 4) return;
        let text = this.readStringFromData(data, 2, textLength);
        text = this.mapMathTypeString(text, textLength);
        text = this.mapSymbolString(text);
        const y = this.readShortFromData(data, 2 + textLength);
        const x = this.readShortFromData(data, 4 + textLength);
        let finalX;
        let finalY;
        if (this.textUpdateCp && this.hasValidPosition) {
          const transformed = this.coordinateTransformer.transform(this.currentPosX, this.currentPosY, this.ctx.canvas.width, this.ctx.canvas.height);
          finalX = transformed.x;
          finalY = transformed.y;
        } else if (x === 0 && y === 0 && this.hasValidPosition) {
          const transformed = this.coordinateTransformer.transform(this.currentPosX, this.currentPosY, this.ctx.canvas.width, this.ctx.canvas.height);
          finalX = transformed.x;
          finalY = transformed.y;
        } else {
          const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
          finalX = transformed.x;
          finalY = transformed.y;
        }
        __wmfEmfRendererLog("TextOut:", text, "at", x, y, "->", finalX, finalY);
        this.ctx.fillText(text, finalX, finalY);
        if (this.textUpdateCp) {
          this.updateCurrentPositionByText(text);
        }
      }
      // DBCS CharSet -> TextDecoder 编码标签（非 DBCS 返回 null）
      getDbcsCharsetLabel(charset) {
        switch (charset) {
          case 128:
            return "shift_jis";
          case 129:
            return "euc-kr";
          case 134:
            return "gbk";
          case 136:
            return "big5";
          default:
            return null;
        }
      }
      processExtTextOut(data) {
        if (data.length < 8) return;
        const y = this.readShortFromData(data, 0);
        const x = this.readShortFromData(data, 2);
        const stringLength = this.readWordFromData(data, 4);
        const fwOpts = this.readWordFromData(data, 6);
        let offset = 8;
        const ETO_OPAQUE = 2;
        const ETO_CLIPPED = 4;
        if ((fwOpts & (ETO_OPAQUE | ETO_CLIPPED)) !== 0) {
          if (data.length < offset + 8) return;
          offset += 8;
        }
        if (data.length < offset + stringLength) return;
        const rawBytes = data.slice(offset, offset + stringLength);
        let dxList = null;
        let dxStart = offset + stringLength;
        if (stringLength % 2 !== 0) {
          dxStart += 1;
        }
        if (data.length >= dxStart + stringLength * 2) {
          const dxSigned = [];
          for (let i = 0; i < stringLength; i++) {
            dxSigned.push(this.readShortFromData(data, dxStart + i * 2));
          }
          dxList = dxSigned;
        }
        let chars = null;
        let charDx = null;
        let text = this.readStringFromData(data, offset, stringLength);
        const charsetLabel = this.getDbcsCharsetLabel(this.currentCharset);
        if (charsetLabel && dxList && dxList.some((v) => v === 0)) {
          try {
            const runs = [];
            for (let i = 0; i < stringLength; i++) {
              if (dxList[i] === 0 && runs.length > 0) {
                runs[runs.length - 1].bytes.push(rawBytes[i]);
              } else {
                runs.push({ bytes: [rawBytes[i]], dx: dxList[i] });
              }
            }
            const decoder = new TextDecoder(charsetLabel);
            const decoded = runs.map((r) => decoder.decode(Uint8Array.from(r.bytes)));
            if (decoded.join("").length > 0) {
              chars = decoded;
              charDx = runs.map((r) => r.dx);
              text = chars.join("");
            }
          } catch (e) {
          }
        }
        text = this.mapMathTypeString(text, stringLength);
        text = this.mapSymbolString(text);
        let logicalX;
        let logicalY;
        if (this.textUpdateCp && this.hasValidPosition) {
          logicalX = this.currentPosX;
          logicalY = this.currentPosY;
          __wmfEmfRendererLog("ExtTextOut:", text, "at CP", "(using current position", this.currentPosX, this.currentPosY + ")", "options:", fwOpts);
        } else if (x === 0 && y === 0 && this.hasValidPosition) {
          logicalX = this.currentPosX;
          logicalY = this.currentPosY;
          __wmfEmfRendererLog("ExtTextOut:", text, "at CP", "(using current position", this.currentPosX, this.currentPosY + ")", "options:", fwOpts);
        } else {
          logicalX = x;
          logicalY = y;
          __wmfEmfRendererLog("ExtTextOut:", text, "at", x, y, "options:", fwOpts);
        }
        if (dxList) {
          const drawChars = chars || Array.from(text);
          const drawDx = charDx || dxList;
          let advance = 0;
          for (let i = 0; i < drawChars.length; i++) {
            const ch = drawChars[i];
            const transformed = this.coordinateTransformer.transform(
              logicalX + advance,
              logicalY,
              this.ctx.canvas.width,
              this.ctx.canvas.height
            );
            this.ctx.fillText(ch, transformed.x, transformed.y);
            advance += drawDx[i] || 0;
          }
          if (this.textUpdateCp) {
            this.currentPosX = logicalX + dxList.reduce((sum, v) => sum + v, 0);
            this.currentPosY = logicalY;
            this.hasValidPosition = true;
          }
        } else {
          const transformed = this.coordinateTransformer.transform(
            logicalX,
            logicalY,
            this.ctx.canvas.width,
            this.ctx.canvas.height
          );
          this.ctx.fillText(text, transformed.x, transformed.y);
          if (this.textUpdateCp) {
            this.updateCurrentPositionByText(text);
          }
        }
      }
      updateCurrentPositionByText(text) {
        if (!this.ctx || !this.ctx.measureText) return;
        const metrics = this.ctx.measureText(text);
        const scale = this.coordinateTransformer.getScale();
        if (scale.x !== 0) {
          this.currentPosX += metrics.width / scale.x;
        }
      }
      processSaveDC(data) {
        __wmfEmfRendererLog("SaveDC");
        this.ctx.save();
      }
      processRestoreDC(data) {
        __wmfEmfRendererLog("RestoreDC");
        this.ctx.restore();
      }
      // 重写 Escape 处理方法（标准 WMF 渲染时使用）
      processEscape(data) {
        if (data.length < 2) return;
        const escapeFunction = this.readWordFromData(data, 0);
        __wmfEmfRendererLog("Escape function:", escapeFunction, "(0x" + escapeFunction.toString(16).padStart(4, "0") + ")");
        if (escapeFunction === 15) {
          if (this.isMathTypeComment(data)) {
            this.isMathType = true;
            __wmfEmfRendererLog("MathType comment detected");
          } else {
            __wmfEmfRendererLog("MFCOMMENT - skipped in standard WMF mode");
          }
        } else {
          __wmfEmfRendererLog("\u672A\u5904\u7406\u7684 Escape \u51FD\u6570:", escapeFunction);
        }
      }
      extractMathTypeMtef(data) {
        if (!data || data.length < 6) return null;
        const byteCount = this.readWordFromData(data, 2);
        if (byteCount <= 0 || data.length < 4 + byteCount) return null;
        const commentData = data.slice(4, 4 + byteCount);
        const appsId = "AppsMFCC";
        const idBytes = [];
        for (let i = 0; i < appsId.length; i++) {
          idBytes.push(appsId.charCodeAt(i));
        }
        const startsWithApps = commentData.length >= idBytes.length && idBytes.every((b, i) => commentData[i] === b);
        if (!startsWithApps) return null;
        return this._consumeAppsMfcc(commentData);
      }
      // 解析 AppsMFCC 注释并返回 MTEF 字节：
      // - 注释内容为 MathML（以 "<?xml" 开头）或分块 MathML 时返回 null
      // - MTEF 数据可能分为多块（totalLen > dataLen），本例按需处理单块
      // 真实 MathType 文件（6.0b+）的 signature 通常为 "Design Science, Inc."，
      // 而非 "Wiris/MTEF"，因此按内容而非签名判定类型。
      _consumeAppsMfcc(commentData) {
        let offset = 8;
        if (offset + 10 > commentData.length) return null;
        const totalLen = this.readDwordFromData(commentData, offset + 2);
        const dataLen = this.readDwordFromData(commentData, offset + 6);
        offset += 10;
        while (offset < commentData.length && commentData[offset] !== 0) offset++;
        offset++;
        if (offset + dataLen > commentData.length) return null;
        const payload = commentData.slice(offset, offset + dataLen);
        if (this.appsMfccSkipping > 0) {
          this.appsMfccSkipping -= dataLen;
          if (this.appsMfccSkipping < 0) this.appsMfccSkipping = 0;
          return null;
        }
        const isXml = payload.length >= 5 && payload[0] === 60 && payload[1] === 63 && payload[2] === 120 && payload[3] === 109 && payload[4] === 108;
        if (isXml) {
          if (dataLen < totalLen) {
            this.appsMfccSkipping = totalLen - dataLen;
          }
          return null;
        }
        return payload;
      }
      isMathTypeComment(data) {
        if (!data || data.length < 4) return false;
        const payload = data.slice(4);
        let ascii = "";
        for (let i = 0; i < payload.length; i++) {
          const b = payload[i];
          if (b >= 32 && b <= 126) {
            ascii += String.fromCharCode(b);
          } else {
            ascii += " ";
          }
        }
        return ascii.includes("MathType") || ascii.includes("AppsMFCC") || ascii.includes("Design Science");
      }
      mapMathTypeString(text, rawLength) {
        if (!this.isMathType || !text) return text;
        const face = (this.currentFontFace || "").toLowerCase();
        if (face === "times new roman") {
          if (this.mathTypeMtefStreams.length === 0 && (text === "xxx" || text === "xxJ")) {
            return "\u22EF";
          }
        }
        return text;
      }
      // 移除旧的警告方法 - 不再需要
      processWmfcComment(data) {
        __wmfEmfRendererLog("processWmfcComment - deprecated");
      }
    };
    module2.exports = WmfDrawer2;
  }
});

// packages/wmf-emf-renderer/entry.js
globalThis.__wmfEmfRendererLog = globalThis.__wmfEmfRendererLog || function() {
};
var FileTypeDetector = require_fileTypeDetector();
var CoordinateTransformer = require_coordinateTransformer();
var MathTypeMtefParser = require_mathTypeMtefParser();
var GdiObjectManager = require_gdiObjectManager();
var BaseParser = require_baseParser();
var WmfParser = require_wmfParser();
var EmfParser = require_emfParser();
var EmfPlusParser = require_emfPlusParser();
var BaseDrawer = require_baseDrawer();
var WmfDrawer = require_wmfDrawer();
var EmfDrawer = require_emfDrawer();
var EmfPlusDrawer = require_emfPlusDrawer();
var SvgContext = require_svgContext();
var MetafileParser = require_metafileParser();
function setDebugEnabled(enabled) {
  if (enabled) {
    globalThis.__wmfEmfRendererLog = __wmfEmfRendererLog.bind(console);
  } else {
    globalThis.__wmfEmfRendererLog = function() {
    };
  }
}
function detectFileType(data) {
  return new FileTypeDetector(data).detect();
}
function parseMetafile(data) {
  const parser = new MetafileParser(data);
  const result = parser.parse();
  result.fileType = result.fileType || parser.fileType;
  return result;
}
function createDrawer(ctx, fileType) {
  if (fileType === "wmf" || fileType === "placeable-wmf") {
    return new WmfDrawer(ctx);
  } else if (fileType === "emf") {
    return new EmfDrawer(ctx);
  } else if (fileType === "emf+") {
    return new EmfPlusDrawer(ctx);
  }
  throw new Error("Unknown file type: " + fileType);
}
function renderToContext(data, ctx, options) {
  if (!ctx) {
    throw new Error("renderToContext: a Canvas 2D context is required");
  }
  if (!ctx.canvas) ctx.canvas = { width: 0, height: 0, style: {} };
  if (!ctx.canvas.style) ctx.canvas.style = {};
  const parsed = parseMetafile(data);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  const drawer = createDrawer(ctx, parsed.fileType);
  drawer.draw(parsed, options || {});
  return {
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    fileType: parsed.fileType
  };
}
function renderToSvg(data, options) {
  const svgCtx = new SvgContext();
  const info = renderToContext(data, svgCtx, options);
  return svgCtx.getSvg();
}
module.exports = {
  // high-level API
  detectFileType,
  parseMetafile,
  renderToSvg,
  renderToContext,
  createDrawer,
  setDebugEnabled,
  // parsers
  MetafileParser,
  FileTypeDetector,
  BaseParser,
  WmfParser,
  EmfParser,
  EmfPlusParser,
  // renderers
  BaseDrawer,
  WmfDrawer,
  EmfDrawer,
  EmfPlusDrawer,
  SvgContext,
  // utilities
  CoordinateTransformer,
  GdiObjectManager,
  MathTypeMtefParser
};
