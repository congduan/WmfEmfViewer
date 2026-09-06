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
        // 统一使用viewport/window转换逻辑
        let cx = x - this.windowOrgX;
        let cy = y - this.windowOrgY;

        // 根据映射模式调整缩放
        switch (this.mapMode) {
            case MAP_MODE.MM_TEXT: // 使用viewport/window转换
            case MAP_MODE.MM_ISOTROPIC:
            case MAP_MODE.MM_ANISOTROPIC:
                if (this.windowExtX !== 0 && this.windowExtY !== 0) {
                    const scaleX = this.viewportExtX / this.windowExtX;
                    const scaleY = this.viewportExtY / this.windowExtY;
                    cx = cx * scaleX + this.viewportOrgX;
                    cy = cy * scaleY + this.viewportOrgY;
                }
                break;
            case MAP_MODE.MM_LOMETRIC:
                cx = cx * 0.1;
                cy = cy * 0.1;
                break;
            case MAP_MODE.MM_HIMETRIC:
                cx = cx * 0.01;
                cy = cy * 0.01;
                break;
            case MAP_MODE.MM_LOENGLISH:
                cx = cx * 0.254;
                cy = cy * 0.254;
                break;
            case MAP_MODE.MM_HIENGLISH:
                cx = cx * 0.0254;
                cy = cy * 0.0254;
                break;
            case MAP_MODE.MM_TWIPS:
                cx = cx * (1.0 / 1440.0);
                cy = cy * (1.0 / 1440.0);
                break;
            default:
                // 默认使用viewport/window转换
                if (this.windowExtX !== 0 && this.windowExtY !== 0) {
                    const scaleX = this.viewportExtX / this.windowExtX;
                    const scaleY = this.viewportExtY / this.windowExtY;
                    cx = cx * scaleX + this.viewportOrgX;
                    cy = cy * scaleY + this.viewportOrgY;
                }
        }

        // WMF/EMF坐标系与Canvas一致（Y轴向下），无需翻转
        return { x: cx, y: cy };
    }

    /** @param {number} mode */
    setMapMode(mode) {
        this.mapMode = mode;
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
