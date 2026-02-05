// 坐标转换模块
class CoordinateTransformer {
    constructor() {
        this.mapMode = 1; // 默认映射模式：MM_TEXT (1)
        this.windowOrgX = 0; // 窗口原点X
        this.windowOrgY = 0; // 窗口原点Y
        this.windowExtX = 800; // 窗口范围X
        this.windowExtY = 600; // 窗口范围Y
        this.viewportOrgX = 0; // 视口原点X
        this.viewportOrgY = 0; // 视口原点Y
        this.viewportExtX = 800; // 视口范围X
        this.viewportExtY = 600; // 视口范围Y
    }

    // 获取当前缩放比例
    getScale() {
        if (this.windowExtX !== 0 && this.windowExtY !== 0) {
            return {
                x: this.viewportExtX / this.windowExtX,
                y: this.viewportExtY / this.windowExtY
            };
        }
        return { x: 1, y: 1 };
    }

    transform(x, y, canvasWidth, canvasHeight) {
        // 统一使用viewport/window转换逻辑
        // 公式: 设备坐标 = (逻辑坐标 - windowOrg) * (viewportExt / windowExt) + viewportOrg
        let cx = x - this.windowOrgX;
        let cy = y - this.windowOrgY;

        // 根据映射模式调整缩放
        switch (this.mapMode) {
            case 0x01: // MM_TEXT - 使用viewport/window转换
            case 0x07: // MM_ISOTROPIC
            case 0x08: // MM_ANISOTROPIC
                if (this.windowExtX !== 0 && this.windowExtY !== 0) {
                    const scaleX = this.viewportExtX / this.windowExtX;
                    const scaleY = this.viewportExtY / this.windowExtY;
                    cx = cx * scaleX + this.viewportOrgX;
                    cy = cy * scaleY + this.viewportOrgY;
                }
                break;
            case 0x02: // MM_LOMETRIC
                cx = cx * 0.1;
                cy = cy * 0.1;
                break;
            case 0x03: // MM_HIMETRIC
                cx = cx * 0.01;
                cy = cy * 0.01;
                break;
            case 0x04: // MM_LOENGLISH
                cx = cx * 0.254;
                cy = cy * 0.254;
                break;
            case 0x05: // MM_HIENGLISH
                cx = cx * 0.0254;
                cy = cy * 0.0254;
                break;
            case 0x06: // MM_TWIPS
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

    setMapMode(mode) {
        this.mapMode = mode;
    }

    setWindowOrg(x, y) {
        this.windowOrgX = x;
        this.windowOrgY = y;
    }

    setWindowExt(x, y) {
        this.windowExtX = x;
        this.windowExtY = y;
    }

    setViewportOrg(x, y) {
        this.viewportOrgX = x;
        this.viewportOrgY = y;
    }

    setViewportExt(x, y) {
        this.viewportExtX = x;
        this.viewportExtY = y;
    }
}

module.exports = CoordinateTransformer;