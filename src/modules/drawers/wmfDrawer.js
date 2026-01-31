// WMF绘制模块
const CoordinateTransformer = require('../coordinateTransformer');
const GdiObjectManager = require('../gdiObjectManager');

class WmfDrawer {
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

    draw(metafileData) {
        console.log('Drawing WMF with header:', metafileData.header);
        console.log('Number of records:', metafileData.records.length);

        if (metafileData.header.placeableHeader) {
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

        // 处理每个记录
        for (let i = 0; i < metafileData.records.length; i++) {
            const record = metafileData.records[i];
            console.log('Processing WMF record', i, ':', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
            this.processRecord(record);
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('WMF drawing completed');
    }

    processRecord(record) {
        // 根据函数ID处理不同的WMF命令
        switch (record.functionId) {
            case 0x0000: // End of File
                console.log('WMF End of File record');
                break;
            case 0x0001: // SetWindowOrg
                this.processSetWindowOrg(record.data);
                break;
            case 0x0002: // SetWindowExt
                this.processSetWindowExt(record.data);
                break;
            case 0x0003: // SetViewportOrg
                this.processSetViewportOrg(record.data);
                break;
            case 0x0004: // SetViewportExt
                this.processSetViewportExt(record.data);
                break;
            case 0x0201: // MoveTo
                this.processMoveTo(record.data);
                break;
            case 0x0202: // LineTo
                this.processLineTo(record.data);
                break;
            case 0x0203: // Rectangle
                this.processRectangle(record.data);
                break;
            case 0x0204: // RoundRect
                this.processRoundRect(record.data);
                break;
            case 0x0205: // Ellipse
                this.processEllipse(record.data);
                break;
            case 0x0206: // Arc
                this.processArc(record.data);
                break;
            case 0x0207: // Pie
                this.processPie(record.data);
                break;
            case 0x0208: // Chord
                this.processChord(record.data);
                break;
            case 0x0209: // Polyline
                this.processPolyline(record.data);
                break;
            case 0x020A: // Polygon
                this.processPolygon(record.data);
                break;
            case 0x020B: // TextOut
                this.processTextOut(record.data);
                break;
            case 0x020C: // GetTextExtent
                this.processGetTextExtent(record.data);
                break;
            case 0x0626: // META_ESCAPE
                this.processEscape(record.data);
                break;
            case 0x020D: // CreatePenIndirect
                this.processCreatePenIndirect(record.data);
                break;
            case 0x020E: // CreateBrushIndirect
                this.processCreateBrushIndirect(record.data);
                break;
            case 0x020F: // SelectObject
                this.processSelectObject(record.data);
                break;
            case 0x0210: // DeleteObject
                this.processDeleteObject(record.data);
                break;
            case 0x02C8: // SetMapMode
                this.processSetMapMode(record.data);
                break;
            case 0x02CA: // SetTextJustification
                this.processSetTextJustification(record.data);
                break;
            case 0x02CB: // SetTextColor
                this.processSetTextColor(record.data);
                break;
            case 0x02CC: // SetBkColor
                this.processSetBkColor(record.data);
                break;
            case 0x02CD: // SetBkMode
                this.processSetBkMode(record.data);
                break;
            case 0x02CE: // SetROP2
                this.processSetROP2(record.data);
                break;
            case 0x02CF: // SetPolyFillMode
                this.processSetPolyFillMode(record.data);
                break;
            case 0x02D0: // SetStretchBltMode
                this.processSetStretchBltMode(record.data);
                break;
            case 0x02D1: // SetTextStretch
                this.processSetTextStretch(record.data);
                break;
            case 0x0103: // SetWindowOrgEx
                this.processSetWindowOrgEx(record.data);
                break;
            case 0x0104: // SetWindowExtEx
                this.processSetWindowExtEx(record.data);
                break;
            case 0x0105: // SetViewportOrgEx
                this.processSetViewportOrgEx(record.data);
                break;
            case 0x0106: // SetViewportExtEx
                this.processSetViewportExtEx(record.data);
                break;
            case 0x0111: // FillRect
                this.processFillRect(record.data);
                break;
            case 0x0112: // FrameRect
                this.processFrameRect(record.data);
                break;
            case 0x0113: // InvertRect
                this.processInvertRect(record.data);
                break;
            case 0x0114: // PaintRect
                this.processPaintRect(record.data);
                break;
            case 0x0115: // FillRgn
                this.processFillRgn(record.data);
                break;
            case 0x0116: // FrameRgn
                this.processFrameRgn(record.data);
                break;
            case 0x0117: // InvertRgn
                this.processInvertRgn(record.data);
                break;
            case 0x0118: // PaintRgn
                this.processPaintRgn(record.data);
                break;
            case 0x012d: // SetBkColor
                this.processSetBkColor(record.data);
                break;
            case 0x01f0: // SetTextColor
                this.processSetTextColor(record.data);
                break;
            case 0x02fa: // SelectObject
                this.processSelectObject(record.data);
                break;
            case 0x02fc: // CreatePenIndirect
                this.processCreatePenIndirect(record.data);
                break;
            case 0x0324: // SetTextColor
                this.processSetTextColor(record.data);
                break;
            case 0x0538: // Polyline
                this.processPolyline(record.data);
                break;
            default:
                console.log('Unknown WMF function:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
                // 尝试通用处理逻辑，解析为图形数据
                this.tryProcessAsCoordinates(record.data);
                break;
        }
    }

    // 以下是具体的处理方法，从原wmfDrawer.js中提取
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

    tryProcessAsCoordinates(data) {
        console.log('Trying to process as coordinates');
    }

    finishPath() {
        console.log('Finishing path');
    }
}

module.exports = WmfDrawer;