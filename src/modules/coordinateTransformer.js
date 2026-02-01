// 坐标转换模块
class CoordinateTransformer {
    constructor() {
        this.mapMode = 0; // 默认映射模式：MM_TEXT
        this.windowOrgX = 0; // 窗口原点X
        this.windowOrgY = 0; // 窗口原点Y
        this.windowExtX = 800; // 窗口范围X
        this.windowExtY = 600; // 窗口范围Y
        this.viewportOrgX = 0; // 视口原点X
        this.viewportOrgY = 0; // 视口原点Y
        this.viewportExtX = 800; // 视口范围X
        this.viewportExtY = 600; // 视口范围Y
    }

    transform(x, y, canvasWidth, canvasHeight) {
        let cx = x - this.windowOrgX;
        let cy = y - this.windowOrgY;

        // 根据映射模式调整缩放
        switch (this.mapMode) {
            case 0x01: // MM_TEXT
                cx = cx * 1.0;
                cy = cy * 1.0;
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
            case 0x07: // MM_ISOTROPIC
            case 0x08: // MM_ANISOTROPIC
                if (this.windowExtX !== 0 && this.windowExtY !== 0) {
                    const scaleX = this.viewportExtX / this.windowExtX;
                    const scaleY = this.viewportExtY / this.windowExtY;
                    cx = cx * scaleX + this.viewportOrgX;
                    cy = cy * scaleY + this.viewportOrgY;
                }
                break;
            default:
                if (this.windowExtX !== 0 && this.windowExtY !== 0) {
                    const scaleX = canvasWidth / this.windowExtX;
                    const scaleY = canvasHeight / this.windowExtY;
                    cx = cx * scaleX;
                    cy = cy * scaleY;
                } else {
                    // 默认缩放比例
                    const scale = Math.min(canvasWidth / 1000, canvasHeight / 1000);
                    cx = cx * scale;
                    cy = cy * scale;
                }
        }

        // 调整坐标系（WMF的Y轴向下，Canvas的Y轴向上）
        cy = canvasHeight - cy;

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