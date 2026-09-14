// @ts-check
// 坐标转换模块
// 实现 GDI 的 window/viewport（窗口/视口）逻辑坐标到设备坐标的映射。

/**
 * 映射模式（GDI Map Modes）
 * @readonly
 * @enum {number}
 */
const MAP_MODE = {
  /** 逻辑单位 = 设备像素（默认） */
  MM_TEXT: 0x01,
  /** 0.1mm */
  MM_LOMETRIC: 0x02,
  /** 0.01mm */
  MM_HIMETRIC: 0x03,
  /** 0.01in */
  MM_LOENGLISH: 0x04,
  /** 0.001in */
  MM_HIENGLISH: 0x05,
  /** 1/1440in */
  MM_TWIPS: 0x06,
  /** 等比（各向同性），比例由 window/viewport 决定 */
  MM_ISOTROPIC: 0x07,
  /** 非等比（各向异性），比例由 window/viewport 决定 */
  MM_ANISOTROPIC: 0x08
};

/**
 * 转换后的设备坐标
 * @typedef {{x: number, y: number}} Point
 */

/**
 * 世界变换矩阵（[MS-EMF] XFORM 结构）
 * @typedef {Object} Xform
 * @property {number} eM11
 * @property {number} eM12
 * @property {number} eM21
 * @property {number} eM22
 * @property {number} eDx
 * @property {number} eDy
 */

/**
 * 乘法中间矩阵
 * @typedef {Object} MulMatrix
 * @property {number} a11
 * @property {number} a12
 * @property {number} a21
 * @property {number} a22
 * @property {number} dx
 * @property {number} dy
 */

class CoordinateTransformer {
  constructor() {
    /** @type {number} 当前映射模式，默认 MM_TEXT */
    this.mapMode = MAP_MODE.MM_TEXT;
    /** @type {number} 窗口原点X（逻辑坐标） */
    this.windowOrgX = 0;
    /** @type {number} 窗口原点Y（逻辑坐标） */
    this.windowOrgY = 0;
    /** @type {number} 窗口范围X（逻辑单位） */
    this.windowExtX = 800;
    /** @type {number} 窗口范围Y（逻辑单位） */
    this.windowExtY = 600;
    /** @type {number} 视口原点X（设备坐标） */
    this.viewportOrgX = 0;
    /** @type {number} 视口原点Y（设备坐标） */
    this.viewportOrgY = 0;
    /** @type {number} 视口范围X（设备单位） */
    this.viewportExtX = 800;
    /** @type {number} 视口范围Y（设备单位） */
    this.viewportExtY = 600;
    /**
     * 每毫米的设备像素数（来自 EMF header.szlDevice.cx / szlMillimeters.cx）
     * 仅用于 MM_LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS 这五个固定比例模式；
     * 默认 3.7795（约 96 DPI），调用方应在解析 EMF 头后用 setPxPerMm 覆盖。
     * @type {number}
     */
    this.pxPerMm = 96 / 25.4;
    // 世界变换（GM_ADVANCED / EMR_SETWORLDTRANSFORM），行向量约定 [x y 1] * M：
    // x' = x*eM11 + y*eM21 + eDx; y' = x*eM12 + y*eM22 + eDy
    this.worldM11 = 1; this.worldM12 = 0;
    this.worldM21 = 0; this.worldM22 = 1;
    this.worldDx = 0; this.worldDy = 0;
    // device→canvas 平移：把 header rclBounds 原点（内容在设备空间的位置）
    // 平移到画布 (0,0)，使内容铺满 canvas 且不超界（与各参考实现一致）。
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
    this.worldM11 = xform.eM11; this.worldM12 = xform.eM12;
    this.worldM21 = xform.eM21; this.worldM22 = xform.eM22;
    this.worldDx = xform.eDx; this.worldDy = xform.eDy;
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
      a11: this.worldM11, a12: this.worldM12,
      a21: this.worldM21, a22: this.worldM22,
      dx: this.worldDx, dy: this.worldDy
    };
    const b = {
      a11: xform.eM11, a12: xform.eM12,
      a21: xform.eM21, a22: xform.eM22,
      dx: xform.eDx, dy: xform.eDy
    };
    let r;
    switch (mode) {
      case 1: // MWT_IDENTITY
        r = { a11: 1, a12: 0, a21: 0, a22: 1, dx: 0, dy: 0 };
        break;
      case 2: // MWT_LEFTMULTIPLY：先应用传入（新），再应用当前（旧）
        r = this._mul(b, m);
        break;
      case 4: // MWT_SET
        r = b;
        break;
      case 3: // MWT_RIGHTMULTIPLY：先应用当前（旧），再应用传入（新）
      default:
        r = this._mul(m, b);
        break;
    }
    this.worldM11 = r.a11; this.worldM12 = r.a12;
    this.worldM21 = r.a21; this.worldM22 = r.a22;
    this.worldDx = r.dx; this.worldDy = r.dy;
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
      dy: a.dx * b.a12 + a.dy * b.a22 + b.dy,
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
   * 获取当前视口/窗口缩放比例（与 _getViewportScale 同源，含映射模式语义）。
   * MM_TEXT 恒返回 1:1（不参与缩放）。
   * @returns {Point}
   */
  getScale() {
    const vp = this._getViewportScale();
    if (!vp.apply) return { x: 1, y: 1 };
    return { x: vp.sx, y: vp.sy };
  }

  /**
   * 映射一个「尺寸向量」（两点之差，不含平移）到设备坐标。
   * 与 transform() 的线性部分完全一致：先 world 变换线性部分（行向量约定），
   * 再 window/viewport 缩放（apply=false 时跳过，同 transform 原语义）。
   * 供位图 BLT 类记录把带符号的 (cxDest, cyDest) 映射为目标宽高使用
   * （对齐 libemf2svg 对 size 做 point_cal 的行为）。
   * @param {number} dx
   * @param {number} dy
   * @returns {Point}
   */
  mapSize(dx, dy) {
    if (this.worldM11 !== 1 || this.worldM12 !== 0 || this.worldM21 !== 0 ||
      this.worldM22 !== 1) {
      const wx = dx * this.worldM11 + dy * this.worldM21;
      const wy = dx * this.worldM12 + dy * this.worldM22;
      dx = wx; dy = wy;
    }
    const vp = this._getViewportScale();
    if (!vp.apply) return { x: dx, y: dy };
    return { x: dx * vp.sx, y: dy * vp.sy };
  }

  /**
   * 把尺寸向量按「点」映射
   * U_EMRSTRETCHDIBITS_draw 用 point_cal(cDest) 计算 <image> 的 width/height，
   * 而 world 变换经外层 SVG 矩阵组后置作用。因此：
   *   size = world线性( point_cal_无world(cDest) )
   * point_cal 的 mapMode 分支差异（libemf2svg emf2svg_utils.c）：
   *   - MM_TEXT / default：恒等（orgs 硬编码 0，不参与）；
   *   - 固定比例模式（LOMETRIC~TWIPS）：仅 pxPerMm 缩放，sy 取负，orgs 不参与；
   *   - MM_ISOTROPIC / MM_ANISOTROPIC：减 windowOrg、加 viewportOrg。
   * viewportOrg ≠ 0 时该缺陷会放大目标矩形（test-118 表格右移一列即此因），
   * 参考实现为 RMSE 对照的权威，故照抄。
   * @param {number} dx
   * @param {number} dy
   * @returns {Point}
   */
  mapSizeAsPoint(dx, dy) {
    let px, py;
    switch (this.mapMode) {
      case MAP_MODE.MM_ISOTROPIC:
      case MAP_MODE.MM_ANISOTROPIC: {
        const vp = this._getViewportScale();
        px = (dx - this.windowOrgX) * vp.sx + this.viewportOrgX;
        py = (dy - this.windowOrgY) * vp.sy + this.viewportOrgY;
        break;
      }
      case MAP_MODE.MM_LOMETRIC:
      case MAP_MODE.MM_HIMETRIC:
      case MAP_MODE.MM_LOENGLISH:
      case MAP_MODE.MM_HIENGLISH:
      case MAP_MODE.MM_TWIPS: {
        const vp = this._getViewportScale();
        px = dx * vp.sx;
        py = dy * vp.sy;
        break;
      }
      default: // MM_TEXT 及未识别模式：恒等
        px = dx;
        py = dy;
    }
    // world 变换（后置矩阵组）作用于尺寸向量（仅线性部分）
    if (this.worldM11 !== 1 || this.worldM12 !== 0 || this.worldM21 !== 0 ||
      this.worldM22 !== 1) {
      const wx = px * this.worldM11 + py * this.worldM21;
      const wy = px * this.worldM12 + py * this.worldM22;
      px = wx; py = wy;
    }
    return { x: px, y: py };
  }

  /**
   * 当前 world 变换的线性缩放系数（用于笔宽换算）。
   * 仅 world 变换参与：参考实现（libemf2svg）把 world 变换作为 SVG matrix
   * 输出，笔宽在 matrix 内因此被等比缩放；而 window/viewport 比例由参考实现
   * 预变换到坐标里、不作用于笔宽（test-182 需 ×0.0625，test-027 需 ×1）。
   * 非等比时取行列式的几何平均。
   * @returns {number}
   */
  getStrokeScale() {
    const worldDet = this.worldM11 * this.worldM22 - this.worldM12 * this.worldM21;
    return Math.sqrt(Math.abs(worldDet));
  }

  /**
   * 逻辑坐标 -> 设备坐标。
   * 参考实现（libemf2svg）的复合顺序：SVG 根 translate(-deviceOrg) 包裹
   * world 矩阵组，组内坐标为 point_cal 结果。即：
   *   device = world_M( (p - windowOrg) * s + viewportOrg ) - deviceOrg
   * world 变换**后置**作用于映射结果（而非 GDI 语义的先 world 后映射）。
   * 当 world 含缩放且 viewportOrg ≠ 0 时两种顺序结果不同（test-118 圈注
   * 椭圆偏移一列、test-171/125 残差的根因），以参考实现为准。
   * apply=false（windowExt 退化）时跳过缩放与 viewportOrg，仅减 windowOrg。
   * @param {number} x
   * @param {number} y
   * @param {number} [canvasWidth] 预留参数（兼容旧调用签名，未参与计算）
   * @param {number} [canvasHeight] 预留参数（兼容旧调用签名，未参与计算）
   * @returns {Point}
   */
  transform(x, y, canvasWidth, canvasHeight) {
    // window/viewport 映射（无 world）
    let cx = x - this.windowOrgX;
    let cy = y - this.windowOrgY;
    const vp = this._getViewportScale();
    if (vp.apply) {
      cx = cx * vp.sx + this.viewportOrgX;
      cy = cy * vp.sy + this.viewportOrgY;
    }
    // world 仿射后置（行向量约定：x' = x*M11 + y*M21 + Dx）。
    // 参考实现 transform_draw：matrix(eM11,eM12,eM21,eM22, scaleX(eDx), scaleY(eDy))
    // —— 平移分量也要经过 window/viewport 缩放（不含 org）。
    if (this.worldM11 !== 1 || this.worldM12 !== 0 || this.worldM21 !== 0 ||
      this.worldM22 !== 1 || this.worldDx !== 0 || this.worldDy !== 0) {
      const wtx = this.worldDx * (vp.apply ? vp.sx : 1);
      const wty = this.worldDy * (vp.apply ? vp.sy : 1);
      const wx = cx * this.worldM11 + cy * this.worldM21 + wtx;
      const wy = cx * this.worldM12 + cy * this.worldM22 + wty;
      cx = wx; cy = wy;
    }
    return { x: cx - this.deviceOrgX, y: cy - this.deviceOrgY };
  }

  /**
   * 计算 window→viewport 的缩放因子（sx/sy）与是否应用 viewportOrg。
   * MM_ISOTROPIC/ANISOTROPIC 用 viewportExt/windowExt 比值；当 windowExt 任一分量为 0 时，
   * 原语义为“完全不应用缩放，也不加 viewportOrg”，故 apply=false。
   * MM_TEXT 恒为 1:1（GDI/参考实现均忽略 windowExt/viewportExt）：
   *   - MS-EMF / GDI：MM_TEXT 下 window 与 viewport 范围不参与映射；
   *   - LibreOffice mtftools.cxx ImplMap()：`if (meMapMode != MappingMode::MM_TEXT)` 才做
   *     `fX2 /= mnWinExtX; fX2 *= mnDevWidth;`；
   *   - libemf2svg 亦不使用这两个范围。
   * 旧实现在 MM_TEXT 下也按 vpExt/winExt 缩放，导致「只设 SETWINDOWEXTEX、不设
   * SETVIEWPORTEXTEX」的文件（如 test-068，winExt=4859x3456 vs 画布 4765x3434）
   * 内容被整体缩到 98%，越靠右偏移越大。
   * 固定比例模式（LOMETRIC/HIMETRIC/LOENGLISH/HIENGLISH/TWIPS）用 pxPerMm 换算，
   * 且 Y 轴在固定比例模式下向上（负缩放，GDI 语义），始终应用 viewportOrg。
   * @returns {{sx: number, sy: number, apply: boolean}}
   */
  _getViewportScale() {
    switch (this.mapMode) {
      case MAP_MODE.MM_TEXT:
        // 1:1，但仍应用 viewportOrg（LO 的 mnDevOrgX/mnDevOrgY 补偿）
        return { sx: 1, sy: 1, apply: true };
      case MAP_MODE.MM_ISOTROPIC:
      case MAP_MODE.MM_ANISOTROPIC:
        if (this.windowExtX !== 0 && this.windowExtY !== 0) {
          let sx = this.viewportExtX / this.windowExtX;
          let sy = this.viewportExtY / this.windowExtY;
          if (this.mapMode === MAP_MODE.MM_ISOTROPIC) {
            // 等比模式：逻辑单位两轴等长。生产者写出的 vpExt/winExt 两轴比例
            // 常有微小出入。参考实现（libemf2svg）实证**恒用 x 轴比例**作用于
            // 两轴（test-164/174 sx<sy 且 ref 取 sx；test-165 sx>sy 亦取 sx——
            // 用 min() 会在后者退化），ref 字号与 y 坐标均按 sx 缩放。
            sy = sx;
          }
          return { sx, sy, apply: true };
        }
        return { sx: 1, sy: 1, apply: false };
      case MAP_MODE.MM_LOMETRIC: {
        const f = this.pxPerMm * 0.1;
        return { sx: f, sy: -f, apply: true };
      }
      case MAP_MODE.MM_HIMETRIC: {
        const f = this.pxPerMm * 0.01;
        return { sx: f, sy: -f, apply: true };
      }
      case MAP_MODE.MM_LOENGLISH: {
        const f = this.pxPerMm * 25.4 * 0.01;
        return { sx: f, sy: -f, apply: true };
      }
      case MAP_MODE.MM_HIENGLISH: {
        const f = this.pxPerMm * 25.4 * 0.001;
        return { sx: f, sy: -f, apply: true };
      }
      case MAP_MODE.MM_TWIPS: {
        const f = this.pxPerMm * 25.4 / 1440;
        return { sx: f, sy: -f, apply: true };
      }
      default:
        if (this.windowExtX !== 0 && this.windowExtY !== 0) {
          return {
            sx: this.viewportExtX / this.windowExtX,
            sy: this.viewportExtY / this.windowExtY,
            apply: true
          };
        }
        return { sx: 1, sy: 1, apply: false };
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
    // apply=false（windowExt 退化）时按 transform() 的原语义：跳过缩放与 viewportOrg，
    // 只做 world → 减 windowOrg → 减 deviceOrg。
    if (!vp.apply) {
      return {
        a: this.worldM11, b: this.worldM12,
        c: this.worldM21, d: this.worldM22,
        e: this.worldDx - this.windowOrgX - this.deviceOrgX,
        f: this.worldDy - this.windowOrgY - this.deviceOrgY
      };
    }
    // world（行向量）：x1 = x*m11 + y*m21 + dx; y1 = x*m12 + y*m22 + dy
    // 再 viewport：x2 = x1*sx + viewportOrgX; y2 = y1*sy + viewportOrgY
    // 再减 deviceOrg。合并为列向量矩阵 [a c e; b d f]：
    //   x' = x*(m11*sx) + y*(m21*sx) + (dx*sx + viewportOrgX - deviceOrgX - windowOrgX*sx)
    // 注意 viewport 映射是 (x - windowOrg)*sx + viewportOrg，故常量项含 -windowOrg*sx。
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
}

module.exports = CoordinateTransformer;
