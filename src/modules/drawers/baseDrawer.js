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
        if (metafileData.header.bounds) {
            const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
            const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
            const canvasWidth = Math.max(Math.min(width, 2000), 800);
            const canvasHeight = Math.max(Math.min(height, 1500), 600);
            this.ctx.canvas.width = canvasWidth;
            this.ctx.canvas.height = canvasHeight;
        } else if (metafileData.header.placeableHeader) {
            const ph = metafileData.header.placeableHeader;
            const width = Math.abs(ph.right - ph.left);
            const height = Math.abs(ph.bottom - ph.top);
            const canvasWidth = Math.max(Math.min(width, 2000), 800);
            const canvasHeight = Math.max(Math.min(height, 1500), 600);
            this.ctx.canvas.width = canvasWidth;
            this.ctx.canvas.height = canvasHeight;
            this.coordinateTransformer.setWindowOrg(ph.left, ph.top);
        } else {
            this.ctx.canvas.width = 800;
            this.ctx.canvas.height = 600;
        }
        console.log('Canvas size set to:', this.ctx.canvas.width, 'x', this.ctx.canvas.height);

        // 清空Canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
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