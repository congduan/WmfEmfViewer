// EMF+绘制模块
const CoordinateTransformer = require('../coordinateTransformer');
const GdiObjectManager = require('../gdiObjectManager');

class EmfPlusDrawer {
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
        console.log('Drawing EMF+ with header:', metafileData.header);
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
            console.log('Processing EMF+ record', i, ':', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')', 'flags:', record.flags);
            this.processEmfPlusRecordType(record.type, record.flags, record.data);
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('EMF+ drawing completed');
    }

    processEmfPlusRecordType(recordType, flags, data) {
        // EMF+记录类型处理
        switch (recordType) {
            case 0x4001: // EmfPlusHeader
                this.processEmfPlusHeader(flags, data);
                break;
            case 0x4002: // EmfPlusEndOfFile
                console.log('EMF+ End of File record');
                break;
            case 0x4003: // EmfPlusComment
                this.processEmfPlusComment(flags, data);
                break;
            case 0x4004: // EmfPlusGetDC
                this.processEmfPlusGetDC(flags, data);
                break;
            case 0x4005: // EmfPlusMultiFormatStart
                this.processEmfPlusMultiFormatStart(flags, data);
                break;
            case 0x4006: // EmfPlusMultiFormatSection
                this.processEmfPlusMultiFormatSection(flags, data);
                break;
            case 0x4007: // EmfPlusMultiFormatEnd
                this.processEmfPlusMultiFormatEnd(flags, data);
                break;
            case 0x4008: // EmfPlusDrawLine
                this.processEmfPlusDrawLine(flags, data);
                break;
            case 0x4009: // EmfPlusDrawRectangle
                this.processEmfPlusDrawRectangle(flags, data);
                break;
            case 0x400A: // EmfPlusFillRectangle
                this.processEmfPlusFillRectangle(flags, data);
                break;
            case 0x400B: // EmfPlusDrawRoundedRectangle
                this.processEmfPlusDrawRoundedRectangle(flags, data);
                break;
            case 0x400C: // EmfPlusFillRoundedRectangle
                this.processEmfPlusFillRoundedRectangle(flags, data);
                break;
            case 0x400D: // EmfPlusDrawEllipse
                this.processEmfPlusDrawEllipse(flags, data);
                break;
            case 0x400E: // EmfPlusFillEllipse
                this.processEmfPlusFillEllipse(flags, data);
                break;
            case 0x400F: // EmfPlusDrawArc
                this.processEmfPlusDrawArc(flags, data);
                break;
            case 0x4010: // EmfPlusFillPie
                this.processEmfPlusFillPie(flags, data);
                break;
            case 0x4011: // EmfPlusDrawPie
                this.processEmfPlusDrawPie(flags, data);
                break;
            case 0x4012: // EmfPlusDrawPolygon
                this.processEmfPlusDrawPolygon(flags, data);
                break;
            case 0x4013: // EmfPlusFillPolygon
                this.processEmfPlusFillPolygon(flags, data);
                break;
            case 0x4014: // EmfPlusDrawPolyline
                this.processEmfPlusDrawPolyline(flags, data);
                break;
            case 0x4015: // EmfPlusDrawCurve
                this.processEmfPlusDrawCurve(flags, data);
                break;
            case 0x4016: // EmfPlusFillClosedCurve
                this.processEmfPlusFillClosedCurve(flags, data);
                break;
            case 0x4017: // EmfPlusDrawClosedCurve
                this.processEmfPlusDrawClosedCurve(flags, data);
                break;
            case 0x4018: // EmfPlusDrawPath
                this.processEmfPlusDrawPath(flags, data);
                break;
            case 0x4019: // EmfPlusFillPath
                this.processEmfPlusFillPath(flags, data);
                break;
            case 0x401A: // EmfPlusDrawImage
                this.processEmfPlusDrawImage(flags, data);
                break;
            case 0x401B: // EmfPlusDrawImagePoints
                this.processEmfPlusDrawImagePoints(flags, data);
                break;
            case 0x401C: // EmfPlusDrawString
                this.processEmfPlusDrawString(flags, data);
                break;
            case 0x401D: // EmfPlusDrawLines
                this.processEmfPlusDrawLines(flags, data);
                break;
            case 0x401E: // EmfPlusDrawBeziers
                this.processEmfPlusDrawBeziers(flags, data);
                break;
            case 0x401F: // EmfPlusDrawClosedBezier
                this.processEmfPlusDrawClosedBezier(flags, data);
                break;
            case 0x4020: // EmfPlusFillClosedBezier
                this.processEmfPlusFillClosedBezier(flags, data);
                break;
            case 0x4021: // EmfPlusDrawBezier
                this.processEmfPlusDrawBezier(flags, data);
                break;
            case 0x4022: // EmfPlusSetRenderingOrigin
                this.processEmfPlusSetRenderingOrigin(flags, data);
                break;
            case 0x4023: // EmfPlusSetAntiAliasMode
                this.processEmfPlusSetAntiAliasMode(flags, data);
                break;
            case 0x4024: // EmfPlusSetTextRenderingHint
                this.processEmfPlusSetTextRenderingHint(flags, data);
                break;
            case 0x4025: // EmfPlusSetInterpolationMode
                this.processEmfPlusSetInterpolationMode(flags, data);
                break;
            case 0x4026: // EmfPlusSetPixelOffsetMode
                this.processEmfPlusSetPixelOffsetMode(flags, data);
                break;
            case 0x4027: // EmfPlusSetCompositingMode
                this.processEmfPlusSetCompositingMode(flags, data);
                break;
            case 0x4028: // EmfPlusSetCompositingQuality
                this.processEmfPlusSetCompositingQuality(flags, data);
                break;
            case 0x4029: // EmfPlusSave
                this.processEmfPlusSave(flags, data);
                break;
            case 0x402A: // EmfPlusRestore
                this.processEmfPlusRestore(flags, data);
                break;
            case 0x402B: // EmfPlusBeginContainer
                this.processEmfPlusBeginContainer(flags, data);
                break;
            case 0x402C: // EmfPlusBeginContainerNoParams
                this.processEmfPlusBeginContainerNoParams(flags, data);
                break;
            case 0x402D: // EmfPlusEndContainer
                this.processEmfPlusEndContainer(flags, data);
                break;
            case 0x402E: // EmfPlusSetWorldTransform
                this.processEmfPlusSetWorldTransform(flags, data);
                break;
            case 0x402F: // EmfPlusResetWorldTransform
                this.processEmfPlusResetWorldTransform(flags, data);
                break;
            case 0x4030: // EmfPlusMultiplyWorldTransform
                this.processEmfPlusMultiplyWorldTransform(flags, data);
                break;
            case 0x4031: // EmfPlusTranslateWorldTransform
                this.processEmfPlusTranslateWorldTransform(flags, data);
                break;
            case 0x4032: // EmfPlusScaleWorldTransform
                this.processEmfPlusScaleWorldTransform(flags, data);
                break;
            case 0x4033: // EmfPlusRotateWorldTransform
                this.processEmfPlusRotateWorldTransform(flags, data);
                break;
            case 0x4034: // EmfPlusSetPageTransform
                this.processEmfPlusSetPageTransform(flags, data);
                break;
            case 0x4035: // EmfPlusResetClip
                this.processEmfPlusResetClip(flags, data);
                break;
            case 0x4036: // EmfPlusSetClipRect
                this.processEmfPlusSetClipRect(flags, data);
                break;
            case 0x4037: // EmfPlusSetClipPath
                this.processEmfPlusSetClipPath(flags, data);
                break;
            case 0x4038: // EmfPlusSetClipRegion
                this.processEmfPlusSetClipRegion(flags, data);
                break;
            case 0x4039: // EmfPlusOffsetClip
                this.processEmfPlusOffsetClip(flags, data);
                break;
            case 0x403A: // EmfPlusFillPath
                this.processEmfPlusFillPath(flags, data);
                break;
            case 0x403B: // EmfPlusDrawDriverString
                this.processEmfPlusDrawDriverString(flags, data);
                break;
            case 0x403C: // EmfPlusDeleteObject
                this.processEmfPlusDeleteObject(flags, data);
                break;
            case