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
        // 世界变换（如有）先作用于逻辑坐标
        if (this.worldM11 !== 1 || this.worldM12 !== 0 || this.worldM21 !== 0 ||
            this.worldM22 !== 1 || this.worldDx !== 0 || this.worldDy !== 0) {
            const w = this._applyWorld(x, y);
            x = w.x; y = w.y;
        }
        // 统一使用viewport/window转换逻辑
        let cx = x - this.windowOrgX;
        let cy = y - this.windowOrgY;

        // 根据映射模式调整缩放
        const vp = this._getViewportScale();
        cx = cx * vp.sx + this.viewportOrgX;
        cy = cy * vp.sy + this.viewportOrgY;

        // WMF/EMF坐标系与Canvas一致（Y轴向下），无需翻转
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
                const f = this.pxPerMm * 25.4 * 0.001;
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
