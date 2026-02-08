// 基础绘制器类 - 提供共享的绘制方法
const CoordinateTransformer = require('../coordinateTransformer');
const GdiObjectManager = require('../gdiObjectManager');

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
    initCanvas(metafileData) {
        let canvasWidth, canvasHeight;

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

            // 转换为像素（使用96 DPI）
            let pixelWidth = widthInInch * 96;
            let pixelHeight = heightInInch * 96;

            // 限制最大尺寸，同时保持宽高比
            // 使用统一的缩放因子，避免宽高比被扭曲
            const maxWidth = 2000;
            const maxHeight = 1500;
            const minWidth = 400;
            const minHeight = 300;

            // 首先应用最大尺寸限制（保持宽高比）
            const scaleToFit = Math.min(
                maxWidth / pixelWidth,
                maxHeight / pixelHeight,
                1
            );
            pixelWidth *= scaleToFit;
            pixelHeight *= scaleToFit;

            // 然后应用最小尺寸限制（保持宽高比）
            const scaleToMin = Math.max(
                minWidth / pixelWidth,
                minHeight / pixelHeight,
                1
            );
            pixelWidth *= scaleToMin;
            pixelHeight *= scaleToMin;

            canvasWidth = Math.round(pixelWidth);
            canvasHeight = Math.round(pixelHeight);

            // 保存逻辑尺寸用于坐标转换
            this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);

            console.log('Canvas initialized with placeableHeader:', {
                logicalWidth, logicalHeight,
                widthInInch: widthInInch.toFixed(2),
                heightInInch: heightInInch.toFixed(2),
                canvasWidth, canvasHeight,
                inch
            });
        } else if (metafileData.header.bounds) {
            const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
            const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
            canvasWidth = Math.max(Math.min(width, 2000), 800);
            canvasHeight = Math.max(Math.min(height, 1500), 600);
            this.coordinateTransformer.setWindowExt(width, height);
            this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
        } else {
            canvasWidth = 800;
            canvasHeight = 600;
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

    // 处理剩余的路径
    finishPath() {
        console.log('Finishing path');
    }

    // 尝试通用处理逻辑，解析为图形数据
    tryProcessAsCoordinates(data) {
        console.log('Trying to process as coordinates');
    }

    // 以下是一些通用的处理方法，可以在子类中覆盖
    processSetWindowOrg(data) {
        console.log('Processing SetWindowOrg');
    }

    processSetWindowExt(data) {
        console.log('Processing SetWindowExt');
    }

    processSetViewportOrg(data) {
        console.log('Processing SetViewportOrg');
    }

    processSetViewportExt(data) {
        console.log('Processing SetViewportExt');
    }

    processMoveTo(data) {
        console.log('Processing MoveTo');
    }

    processLineTo(data) {
        console.log('Processing LineTo');
    }

    processRectangle(data) {
        console.log('Processing Rectangle');
    }

    processRoundRect(data) {
        console.log('Processing RoundRect');
    }

    processEllipse(data) {
        console.log('Processing Ellipse');
    }

    processArc(data) {
        console.log('Processing Arc');
    }

    processPie(data) {
        console.log('Processing Pie');
    }

    processChord(data) {
        console.log('Processing Chord');
    }

    processPolyline(data) {
        console.log('Processing Polyline');
    }

    processPolygon(data) {
        console.log('Processing Polygon');
    }

    processTextOut(data) {
        console.log('Processing TextOut');
    }

    processGetTextExtent(data) {
        console.log('Processing GetTextExtent');
    }

    processEscape(data) {
        console.log('Processing Escape');
    }

    processCreatePenIndirect(data) {
        console.log('Processing CreatePenIndirect');
    }

    processCreateBrushIndirect(data) {
        console.log('Processing CreateBrushIndirect');
    }

    processSelectObject(data) {
        console.log('Processing SelectObject');
    }

    processDeleteObject(data) {
        console.log('Processing DeleteObject');
    }

    processSetMapMode(data) {
        console.log('Processing SetMapMode');
    }

    processSetTextJustification(data) {
        console.log('Processing SetTextJustification');
    }

    processSetTextColor(data) {
        console.log('Processing SetTextColor');
    }

    processSetBkColor(data) {
        console.log('Processing SetBkColor');
    }

    processSetBkMode(data) {
        console.log('Processing SetBkMode');
    }

    processSetROP2(data) {
        console.log('Processing SetROP2');
    }

    processSetPolyFillMode(data) {
        console.log('Processing SetPolyFillMode');
    }

    processSetStretchBltMode(data) {
        console.log('Processing SetStretchBltMode');
    }

    processSetTextStretch(data) {
        console.log('Processing SetTextStretch');
    }

    processSetWindowOrgEx(data) {
        console.log('Processing SetWindowOrgEx');
    }

    processSetWindowExtEx(data) {
        console.log('Processing SetWindowExtEx');
    }

    processSetViewportOrgEx(data) {
        console.log('Processing SetViewportOrgEx');
    }

    processSetViewportExtEx(data) {
        console.log('Processing SetViewportExtEx');
    }

    processFillRect(data) {
        console.log('Processing FillRect');
    }

    processFrameRect(data) {
        console.log('Processing FrameRect');
    }

    processInvertRect(data) {
        console.log('Processing InvertRect');
    }

    processPaintRect(data) {
        console.log('Processing PaintRect');
    }

    processFillRgn(data) {
        console.log('Processing FillRgn');
    }

    processFrameRgn(data) {
        console.log('Processing FrameRgn');
    }

    processInvertRgn(data) {
        console.log('Processing InvertRgn');
    }

    processPaintRgn(data) {
        console.log('Processing PaintRgn');
    }

    processSetTextAlign(data) {
        console.log('Processing SetTextAlign');
    }

    processCreateFontIndirect(data) {
        console.log('Processing CreateFontIndirect');
    }

    processCreatePalette(data) {
        console.log('Processing CreatePalette');
    }

    processCreatePatternBrush(data) {
        console.log('Processing CreatePatternBrush');
    }

    processCreateRegion(data) {
        console.log('Processing CreateRegion');
    }

    processPolyPolygon(data) {
        console.log('Processing PolyPolygon');
    }

    processExtTextOut(data) {
        console.log('Processing ExtTextOut');
    }

    processDibBitBlt(data) {
        console.log('Processing DibBitBlt');
    }

    processDibStretchBlt(data) {
        console.log('Processing DibStretchBlt');
    }

    processStretchDib(data) {
        console.log('Processing StretchDib');
    }

    processFloodFill(data) {
        console.log('Processing FloodFill');
    }

    processSaveDC(data) {
        console.log('Processing SaveDC');
    }

    processRestoreDC(data) {
        console.log('Processing RestoreDC');
    }
}

module.exports = BaseDrawer;