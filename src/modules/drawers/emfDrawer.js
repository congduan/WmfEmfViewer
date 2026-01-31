// EMF绘制模块
const CoordinateTransformer = require('../coordinateTransformer');
const GdiObjectManager = require('../gdiObjectManager');

class EmfDrawer {
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
        console.log('Drawing EMF with header:', metafileData.header);
        console.log('Number of records:', metafileData.records.length);

        if (metafileData.header.bounds) {
            const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
            const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
            const canvasWidth = Math.max(Math.min(width, 2000), 800);
            const canvasHeight = Math.max(Math.min(height, 1500), 600);
            this.ctx.canvas.width = canvasWidth;
            this.ctx.canvas.height = canvasHeight;
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
            console.log('Processing EMF record', i, ':', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
            this.processEmfRecordType(record.type, record.data);
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('EMF drawing completed');
    }

    processEmfRecordType(recordType, data) {
        // EMF记录类型处理 - 根据标准EMR常量
        switch (recordType) {
            case 0x00000001: // EMR_HEADER
                this.processEmfHeader(data);
                break;
            case 0x00000002: // EMR_POLYBEZIER
                this.processEmfPolyBezier(data);
                break;
            case 0x00000003: // EMR_POLYGON
                this.processEmfPolygon(data);
                break;
            case 0x00000004: // EMR_POLYLINE
                this.processEmfPolyline(data);
                break;
            case 0x00000005: // EMR_POLYBEZIERTO
                this.processEmfPolyBezierTo(data);
                break;
            case 0x00000006: // EMR_POLYLINETO
                this.processEmfPolylineTo(data);
                break;
            case 0x00000007: // EMR_POLYPOLYLINE
                this.processEmfPolyPolyline(data);
                break;
            case 0x00000008: // EMR_POLYPOLYGON
                this.processEmfPolyPolygon(data);
                break;
            case 0x00000009: // EMR_SETWINDOWEXTEX
                this.processEmfSetWindowExtEx(data);
                break;
            case 0x0000000A: // EMR_SETWINDOWORGEX
                this.processEmfSetWindowOrgEx(data);
                break;
            case 0x0000000B: // EMR_SETVIEWPORTEXTEX
                this.processEmfSetViewportExtEx(data);
                break;
            case 0x0000000C: // EMR_SETVIEWPORTORGEX
                this.processEmfSetViewportOrgEx(data);
                break;
            case 0x0000000D: // EMR_SETBRUSHORGEX
                this.processEmfSetBrushOrgEx(data);
                break;
            case 0x0000000E: // EMR_EOF
                console.log('EMF EOF record');
                break;
            case 0x00000011: // EMR_SETMAPMODE
                this.processEmfSetMapMode(data);
                break;
            case 0x00000017: // EMR_SETTEXTCOLOR
                this.processEmfSetTextColor(data);
                break;
            case 0x00000019: // EMR_SETBKCOLOR
                this.processEmfSetBkColor(data);
                break;
            case 0x0000001B: // EMR_MOVETOEX
                this.processEmfMoveToEx(data);
                break;
            case 0x00000022: // EMR_RESTOREDC
                this.processEmfRestoreDC(data);
                break;
            case 0x00000025: // EMR_SELECTOBJECT
                this.processEmfSelectObject(data);
                break;
            case 0x00000026: // EMR_CREATEPEN
                this.processEmfCreatePen(data);
                break;
            case 0x00000027: // EMR_CREATEBRUSHINDIRECT
                this.processEmfCreateBrushIndirect(data);
                break;
            case 0x0000002A: // EMR_ELLIPSE
                this.processEmfEllipse(data);
                break;
            case 0x0000002B: // EMR_RECTANGLE
                this.processEmfRectangle(data);
                break;
            case 0x00000036: // EMR_LINETO
                this.processEmfLineTo(data);
                break;
            case 0x0000003B: // EMR_BEGINPATH
                this.processEmfBeginPath(data);
                break;
            case 0x0000003C: // EMR_ENDPATH
                this.processEmfEndPath(data);
                break;
            case 0x0000003F: // EMR_STROKEANDFILLPATH
                this.processEmfStrokeAndFillPath(data);
                break;
            case 0x00000040: // EMR_STROKEPATH
                this.processEmfStrokePath(data);
                break;
            case 0x00000044: // EMR_ABORTPATH
                this.processEmfAbortPath(data);
                break;
            case 0x00000053: // EMR_EXTTEXTOUTA
                this.processEmfText(data);
                break;
            case 0x00000054: // EMR_EXTTEXTOUTW
                this.processEmfText(data);
                break;
            default:
                console.log('Unknown EMF record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
                this.tryProcessAsCoordinates(data);
                break;
        }
    }

    // 以下是具体的EMF处理方法
    processEmfHeader(data) {
        console.log('Processing EMF Header');
    }

    processEmfPolyBezier(data) {
        console.log('Processing EMF PolyBezier');
    }

    processEmfPolygon(data) {
        console.log('Processing EMF Polygon');
    }

    processEmfPolyline(data) {
        console.log('Processing EMF Polyline');
    }

    processEmfPolyBezierTo(data) {
        console.log('Processing EMF PolyBezierTo');
    }

    processEmfPolylineTo(data) {
        console.log('Processing EMF PolylineTo');
    }

    processEmfPolyPolyline(data) {
        console.log('Processing EMF PolyPolyline');
    }

    processEmfPolyPolygon(data) {
        console.log('Processing EMF PolyPolygon');
    }

    processEmfSetWindowExtEx(data) {
        console.log('Processing EMF SetWindowExtEx');
    }

    processEmfSetWindowOrgEx(data) {
        console.log('Processing EMF SetWindowOrgEx');
    }

    processEmfSetViewportExtEx(data) {
        console.log('Processing EMF SetViewportExtEx');
    }

    processEmfSetViewportOrgEx(data) {
        console.log('Processing EMF SetViewportOrgEx');
    }

    processEmfSetBrushOrgEx(data) {
        console.log('Processing EMF SetBrushOrgEx');
    }

    processEmfSetMapMode(data) {
        console.log('Processing EMF SetMapMode');
    }

    processEmfSetTextColor(data) {
        console.log('Processing EMF SetTextColor');
    }

    processEmfSetBkColor(data) {
        console.log('Processing EMF SetBkColor');
    }

    processEmfMoveToEx(data) {
        console.log('Processing EMF MoveToEx');
    }

    processEmfRestoreDC(data) {
        console.log('Processing EMF RestoreDC');
    }

    processEmfSelectObject(data) {
        console.log('Processing EMF SelectObject');
    }

    processEmfCreatePen(data) {
        console.log('Processing EMF CreatePen');
    }

    processEmfCreateBrushIndirect(data) {
        console.log('Processing EMF CreateBrushIndirect');
    }

    processEmfEllipse(data) {
        console.log('Processing EMF Ellipse');
    }

    processEmfRectangle(data) {
        console.log('Processing EMF Rectangle');
    }

    processEmfLineTo(data) {
        console.log('Processing EMF LineTo');
    }

    processEmfBeginPath(data) {
        console.log('Processing EMF BeginPath');
    }

    processEmfEndPath(data) {
        console.log('Processing EMF EndPath');
    }

    processEmfStrokeAndFillPath(data) {
        console.log('Processing EMF StrokeAndFillPath');
    }

    processEmfStrokePath(data) {
        console.log('Processing EMF StrokePath');
    }

    processEmfAbortPath(data) {
        console.log('Processing EMF AbortPath');
    }

    processEmfText(data) {
        console.log('Processing EMF Text');
    }

    tryProcessAsCoordinates(data) {
        console.log('Trying to process EMF data as coordinates');
    }

    finishPath() {
        console.log('Finishing EMF path');
    }
}

module.exports = EmfDrawer;