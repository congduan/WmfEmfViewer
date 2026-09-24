// 基础绘制器类。
//
// 只保留**真正被复用**的能力：
//   - 构造器：ctx / 坐标变换器 / GDI 对象表 / 公共绘制状态字段
//   - initCanvas：按文件头计算画布尺寸并设置 window/viewport 映射（WmfDrawer 使用）
//   - finishPath：收尾挂钩（WmfDrawer 调用；EMF/EMF+ 有自己的实现）
//
// 历史说明：本类原先还带 ~55 个仅打印日志的 `processXxx` 桩方法。
// 其中 36 个被 WmfDrawer 覆盖（基类版本即死代码），15 个全库零引用，
// 4 个（FillRgn/CreatePalette/CreatePatternBrush/CreateRegion）仅作为分发表的
// 静默兜底——已在 WMF_RECORD_HANDLERS 中直接登记为 null（该表约定 null = 已识别但无需处理）。
// 三个绘制器之间真正的公共逻辑（字节读取、椭圆/弧几何）已下沉到
// utils/binaryReader 与 utils/geometryUtils，而不是堆在基类的桩方法里。
const CoordinateTransformer = require('../../utils/coordinateTransformer');
const GdiObjectManager = require('../../utils/gdiObjectManager');
const { DEFAULT_DPI, DEFAULT_VIEW_WIDTH, DEFAULT_VIEW_HEIGHT } = require('../../utils/constants');

class BaseDrawer {
    constructor(ctx) {
        this.ctx = ctx;
        this.coordinateTransformer = new CoordinateTransformer();
        this.gdiObjectManager = new GdiObjectManager();
        this.currentPath = []; // 当前路径点集合
        this.pathState = 'idle'; // 路径状态：idle, active, completed
        this.fillColor = '#000000'; // 默认填充颜色
        this.strokeColor = '#000000'; // 默认描边颜色
        this.lineWidth = 1; // 默认线宽
    }

    // 初始化画布
    initCanvas(metafileData, options = {}) {
        let canvasWidth, canvasHeight;

        // 获取view尺寸，默认见 constants.DEFAULT_VIEW_*
        const viewWidth = options.viewWidth || DEFAULT_VIEW_WIDTH;
        const viewHeight = options.viewHeight || DEFAULT_VIEW_HEIGHT;

        if (metafileData.header.placeableHeader) {
            const ph = metafileData.header.placeableHeader;
            // 根据placeableHeader计算画布像素尺寸
            // inch字段表示每英寸的逻辑单位数
            const inch = ph.inch || 1000;
            const logicalWidth = Math.abs(ph.right - ph.left);
            const logicalHeight = Math.abs(ph.bottom - ph.top);

            // 计算物理尺寸（英寸）
            const widthInInch = logicalWidth / inch;
            const heightInInch = logicalHeight / inch;

            // 转换为像素（使用默认 DPI）
            let pixelWidth = widthInInch * DEFAULT_DPI;
            let pixelHeight = heightInInch * DEFAULT_DPI;

            // 在保持宽高比的情况下，尽可能占满view
            // 使用统一的缩放因子，避免宽高比被扭曲
            const scaleToFit = Math.min(
                viewWidth / pixelWidth,
                viewHeight / pixelHeight
            );
            pixelWidth *= scaleToFit;
            pixelHeight *= scaleToFit;

            canvasWidth = Math.round(pixelWidth);
            canvasHeight = Math.round(pixelHeight);

            // 设置 window/viewport 映射：将 placeable 边界映射到画布
            // （与 EMF bounds 分支保持一致；文件内的 SetWindow* 记录会覆盖这里的默认值）
            this.coordinateTransformer.setWindowOrg(ph.left, ph.top);
            this.coordinateTransformer.setWindowExt(logicalWidth, logicalHeight);
            this.coordinateTransformer.setViewportOrg(0, 0);
            this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);

            console.log('Canvas initialized with placeableHeader:', {
                logicalWidth, logicalHeight,
                widthInInch: widthInInch.toFixed(2),
                heightInInch: heightInInch.toFixed(2),
                canvasWidth, canvasHeight,
                viewWidth, viewHeight,
                inch
            });
        } else if (metafileData.header.bounds) {
            const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
            const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;

            // 在保持宽高比的情况下，尽可能占满view
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
    }

    // 收尾挂钩：WmfDrawer 在记录流结束后调用（EMF/EMF+ 有各自的实现）
    finishPath() {
        console.log('Finishing path');
    }
}

module.exports = BaseDrawer;
