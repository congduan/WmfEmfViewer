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

        let canvasWidth, canvasHeight;
        if (metafileData.header.bounds) {
            const width = metafileData.header.bounds.right - metafileData.header.bounds.left;
            const height = metafileData.header.bounds.bottom - metafileData.header.bounds.top;
            canvasWidth = Math.max(Math.min(width, 2000), 800);
            canvasHeight = Math.max(Math.min(height, 1500), 600);
        } else {
            canvasWidth = 800;
            canvasHeight = 600;
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
        // 根据MS-EMFPLUS规范 2.1.1.1 EmfPlusRecordType Enumeration
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
            case 0x4008: // EmfPlusObject (对象定义)
                this.processEmfPlusObject(flags, data);
                break;
            case 0x4009: // EmfPlusClear
                this.processEmfPlusClear(flags, data);
                break;
            case 0x400A: // EmfPlusFillRects
                this.processEmfPlusFillRectangles(flags, data);
                break;
            case 0x400B: // EmfPlusDrawRects
                this.processEmfPlusDrawRectangles(flags, data);
                break;
            case 0x400C: // EmfPlusFillPolygon
                this.processEmfPlusFillPolygon(flags, data);
                break;
            case 0x400D: // EmfPlusDrawLines
                this.processEmfPlusDrawLines(flags, data);
                break;
            case 0x400E: // EmfPlusFillEllipse
                this.processEmfPlusFillEllipse(flags, data);
                break;
            case 0x400F: // EmfPlusDrawEllipse
                this.processEmfPlusDrawEllipse(flags, data);
                break;
            case 0x4010: // EmfPlusFillPie
                this.processEmfPlusFillPie(flags, data);
                break;
            case 0x4011: // EmfPlusDrawPie
                this.processEmfPlusDrawPie(flags, data);
                break;
            case 0x4012: // EmfPlusDrawArc
                this.processEmfPlusDrawArc(flags, data);
                break;
            case 0x4013: // EmfPlusFillRegion
                this.processEmfPlusFillRegion(flags, data);
                break;
            case 0x4014: // EmfPlusFillPath
                this.processEmfPlusFillPath(flags, data);
                break;
            case 0x4015: // EmfPlusDrawPath
                this.processEmfPlusDrawPath(flags, data);
                break;
            case 0x4016: // EmfPlusFillClosedCurve
                this.processEmfPlusFillClosedCurve(flags, data);
                break;
            case 0x4017: // EmfPlusDrawClosedCurve
                this.processEmfPlusDrawClosedCurve(flags, data);
                break;
            case 0x4018: // EmfPlusDrawCurve
                this.processEmfPlusDrawCurve(flags, data);
                break;
            case 0x4019: // EmfPlusDrawBeziers
                this.processEmfPlusDrawBeziers(flags, data);
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
            case 0x401D: // EmfPlusSetRenderingOrigin
                this.processEmfPlusSetRenderingOrigin(flags, data);
                break;
            case 0x401E: // EmfPlusSetAntiAliasMode
                this.processEmfPlusSetAntiAliasMode(flags, data);
                break;
            case 0x401F: // EmfPlusSetTextRenderingHint
                this.processEmfPlusSetTextRenderingHint(flags, data);
                break;
            case 0x4020: // EmfPlusSetTextContrast
                this.processEmfPlusSetTextContrast(flags, data);
                break;
            case 0x4021: // EmfPlusSetInterpolationMode
                this.processEmfPlusSetInterpolationMode(flags, data);
                break;
            case 0x4022: // EmfPlusSetPixelOffsetMode
                this.processEmfPlusSetPixelOffsetMode(flags, data);
                break;
            case 0x4023: // EmfPlusSetCompositingMode
                this.processEmfPlusSetCompositingMode(flags, data);
                break;
            case 0x4024: // EmfPlusSetCompositingQuality
                this.processEmfPlusSetCompositingQuality(flags, data);
                break;
            case 0x4025: // EmfPlusSave
                this.processEmfPlusSave(flags, data);
                break;
            case 0x4026: // EmfPlusRestore
                this.processEmfPlusRestore(flags, data);
                break;
            case 0x4027: // EmfPlusBeginContainer
                this.processEmfPlusBeginContainer(flags, data);
                break;
            case 0x4028: // EmfPlusBeginContainerNoParams
                this.processEmfPlusBeginContainerNoParams(flags, data);
                break;
            case 0x4029: // EmfPlusEndContainer
                this.processEmfPlusEndContainer(flags, data);
                break;
            case 0x402A: // EmfPlusSetWorldTransform
                this.processEmfPlusSetWorldTransform(flags, data);
                break;
            case 0x402B: // EmfPlusResetWorldTransform
                this.processEmfPlusResetWorldTransform(flags, data);
                break;
            case 0x402C: // EmfPlusMultiplyWorldTransform
                this.processEmfPlusMultiplyWorldTransform(flags, data);
                break;
            case 0x402D: // EmfPlusTranslateWorldTransform
                this.processEmfPlusTranslateWorldTransform(flags, data);
                break;
            case 0x402E: // EmfPlusScaleWorldTransform
                this.processEmfPlusScaleWorldTransform(flags, data);
                break;
            case 0x402F: // EmfPlusRotateWorldTransform
                this.processEmfPlusRotateWorldTransform(flags, data);
                break;
            case 0x4030: // EmfPlusSetPageTransform
                this.processEmfPlusSetPageTransform(flags, data);
                break;
            case 0x4031: // EmfPlusResetClip
                this.processEmfPlusResetClip(flags, data);
                break;
            case 0x4032: // EmfPlusSetClipRect
                this.processEmfPlusSetClipRect(flags, data);
                break;
            case 0x4033: // EmfPlusSetClipPath
                this.processEmfPlusSetClipPath(flags, data);
                break;
            case 0x4034: // EmfPlusSetClipRegion
                this.processEmfPlusSetClipRegion(flags, data);
                break;
            case 0x4035: // EmfPlusOffsetClip
                this.processEmfPlusOffsetClip(flags, data);
                break;
            case 0x4036: // EmfPlusDrawDriverString
                this.processEmfPlusDrawDriverString(flags, data);
                break;
            case 0x4037: // EmfPlusStrokeFillPath (非标准)
                this.processEmfPlusStrokeFillPath(flags, data);
                break;
            case 0x4038: // EmfPlusSerializableObject
                this.processEmfPlusSerializableObject(flags, data);
                break;
            case 0x4039: // EmfPlusSetTSGraphics
                this.processEmfPlusSetTSGraphics(flags, data);
                break;
            case 0x403A: // EmfPlusSetTSClip
                this.processEmfPlusSetTSClip(flags, data);
                break;
            default:
                console.log('Unknown/Unimplemented EMF+ record type:', recordType.toString(16));
                break;
        }
    }

    // 解析EMF头
    parseEmfHeader() {
        // 这里应该实现EMF头的解析逻辑
        // 暂时返回一个模拟的EMF头
        return {
            nSize: 88,
            nVersion: 0x00010000,
            nRecords: 0,
            nHandles: 0,
            nReserved: 0,
            nSize: 88,
            nWidth: 0,
            nHeight: 0,
            nNumberOfPages: 1,
            nPlayCount: 0
        };
    }

    // 处理EMF+绘制线记录
    processEmfPlusDrawLine(flags, data) {
        console.log('Processing EmfPlusDrawLine');
    }

    // 处理EMF+填充多边形记录
    processEmfPlusFillPolygon(flags, data) {
        console.log('Processing EmfPlusFillPolygon');
    }

    // 处理EMF+绘制曲线记录
    processEmfPlusDrawCurve(flags, data) {
        console.log('Processing EmfPlusDrawCurve');
    }

    // 处理EMF+填充闭合曲线记录
    processEmfPlusFillClosedCurve(flags, data) {
        console.log('Processing EmfPlusFillClosedCurve');
    }

    // 处理EMF+绘制闭合曲线记录
    processEmfPlusDrawClosedCurve(flags, data) {
        console.log('Processing EmfPlusDrawClosedCurve');
    }

    // 处理EMF+绘制路径记录
    processEmfPlusDrawPath(flags, data) {
        console.log('Processing EmfPlusDrawPath');
    }

    // 处理EMF+填充路径记录
    processEmfPlusFillPath(flags, data) {
        console.log('Processing EmfPlusFillPath');
    }

    // 处理EMF+绘制图像记录
    processEmfPlusDrawImage(flags, data) {
        console.log('Processing EmfPlusDrawImage');
    }

    // 处理EMF+绘制图像点记录
    processEmfPlusDrawImagePoints(flags, data) {
        console.log('Processing EmfPlusDrawImagePoints');
    }

    // 处理EMF+绘制字符串记录
    processEmfPlusDrawString(flags, data) {
        console.log('Processing EmfPlusDrawString');
    }

    // 处理EMF+绘制多线段记录
    processEmfPlusDrawLines(flags, data) {
        console.log('Processing EmfPlusDrawLines');
    }

    // 处理EMF+绘制贝塞尔曲线记录
    processEmfPlusDrawBeziers(flags, data) {
        console.log('Processing EmfPlusDrawBeziers');
    }

    // 处理EMF+绘制椭圆记录
    processEmfPlusDrawEllipse(flags, data) {
        console.log('Processing EmfPlusDrawEllipse');
    }

    // 处理EMF+填充椭圆记录
    processEmfPlusFillEllipse(flags, data) {
        console.log('Processing EmfPlusFillEllipse');
    }

    // 处理EMF+绘制弧线记录
    processEmfPlusDrawArc(flags, data) {
        console.log('Processing EmfPlusDrawArc');
    }

    // 处理EMF+填充饼图记录
    processEmfPlusFillPie(flags, data) {
        console.log('Processing EmfPlusFillPie');
    }

    // 处理EMF+绘制饼图记录
    processEmfPlusDrawPie(flags, data) {
        console.log('Processing EmfPlusDrawPie');
    }

    // 处理EMF+绘制驱动字符串记录
    processEmfPlusDrawDriverString(flags, data) {
        console.log('Processing EmfPlusDrawDriverString');
    }

    // 处理EMF+设置渲染原点记录
    processEmfPlusSetRenderingOrigin(flags, data) {
        console.log('Processing EmfPlusSetRenderingOrigin');
    }

    // 处理EMF+设置抗锯齿模式记录
    processEmfPlusSetAntiAliasMode(flags, data) {
        console.log('Processing EmfPlusSetAntiAliasMode');
    }

    // 处理EMF+设置文本渲染提示记录
    processEmfPlusSetTextRenderingHint(flags, data) {
        console.log('Processing EmfPlusSetTextRenderingHint');
    }

    // 处理EMF+设置插值模式记录
    processEmfPlusSetInterpolationMode(flags, data) {
        console.log('Processing EmfPlusSetInterpolationMode');
    }

    // 处理EMF+设置像素偏移模式记录
    processEmfPlusSetPixelOffsetMode(flags, data) {
        console.log('Processing EmfPlusSetPixelOffsetMode');
    }

    // 处理EMF+设置合成模式记录
    processEmfPlusSetCompositingMode(flags, data) {
        console.log('Processing EmfPlusSetCompositingMode');
    }

    // 处理EMF+设置合成质量记录
    processEmfPlusSetCompositingQuality(flags, data) {
        console.log('Processing EmfPlusSetCompositingQuality');
    }

    // 处理EMF+保存记录
    processEmfPlusSave(flags, data) {
        console.log('Processing EmfPlusSave');
    }

    // 处理EMF+恢复记录
    processEmfPlusRestore(flags, data) {
        console.log('Processing EmfPlusRestore');
    }

    // 处理EMF+开始容器记录
    processEmfPlusBeginContainer(flags, data) {
        console.log('Processing EmfPlusBeginContainer');
    }

    // 处理EMF+开始无参数容器记录
    processEmfPlusBeginContainerNoParams(flags, data) {
        console.log('Processing EmfPlusBeginContainerNoParams');
    }

    // 处理EMF+结束容器记录
    processEmfPlusEndContainer(flags, data) {
        console.log('Processing EmfPlusEndContainer');
    }

    // 处理EMF+设置世界变换记录
    processEmfPlusSetWorldTransform(flags, data) {
        console.log('Processing EmfPlusSetWorldTransform');
    }

    // 处理EMF+重置世界变换记录
    processEmfPlusResetWorldTransform(flags, data) {
        console.log('Processing EmfPlusResetWorldTransform');
    }

    // 处理EMF+乘以世界变换记录
    processEmfPlusMultiplyWorldTransform(flags, data) {
        console.log('Processing EmfPlusMultiplyWorldTransform');
    }

    // 处理EMF+平移世界变换记录
    processEmfPlusTranslateWorldTransform(flags, data) {
        console.log('Processing EmfPlusTranslateWorldTransform');
    }

    // 处理EMF+缩放世界变换记录
    processEmfPlusScaleWorldTransform(flags, data) {
        console.log('Processing EmfPlusScaleWorldTransform');
    }

    // 处理EMF+旋转世界变换记录
    processEmfPlusRotateWorldTransform(flags, data) {
        console.log('Processing EmfPlusRotateWorldTransform');
    }

    // 处理EMF+设置页面变换记录
    processEmfPlusSetPageTransform(flags, data) {
        console.log('Processing EmfPlusSetPageTransform');
    }

    // 处理EMF+重置裁剪记录
    processEmfPlusResetClip(flags, data) {
        console.log('Processing EmfPlusResetClip');
    }

    // 处理EMF+设置裁剪矩形记录
    processEmfPlusSetClipRect(flags, data) {
        console.log('Processing EmfPlusSetClipRect');
    }

    // 处理EMF+设置裁剪路径记录
    processEmfPlusSetClipPath(flags, data) {
        console.log('Processing EmfPlusSetClipPath');
    }

    // 处理EMF+设置裁剪区域记录
    processEmfPlusSetClipRegion(flags, data) {
        console.log('Processing EmfPlusSetClipRegion');
    }

    // 处理EMF+偏移裁剪记录
    processEmfPlusOffsetClip(flags, data) {
        console.log('Processing EmfPlusOffsetClip');
    }

    // 补充缺失的处理方法
    processEmfPlusHeader(flags, data) {
        console.log('Processing EmfPlusHeader');
    }

    processEmfPlusComment(flags, data) {
        console.log('Processing EmfPlusComment');
    }

    processEmfPlusGetDC(flags, data) {
        console.log('Processing EmfPlusGetDC');
    }

    processEmfPlusObject(flags, data) {
        console.log('Processing EmfPlusObject');
    }

    processEmfPlusFillRectangles(flags, data) {
        console.log('Processing EmfPlusFillRectangles');
    }

    processEmfPlusDrawRectangles(flags, data) {
        console.log('Processing EmfPlusDrawRectangles');
    }

    processEmfPlusFillRegion(flags, data) {
        console.log('Processing EmfPlusFillRegion');
    }

    processEmfPlusSetTextContrast(flags, data) {
        console.log('Processing EmfPlusSetTextContrast');
    }

    processEmfPlusStrokeFillPath(flags, data) {
        console.log('Processing EmfPlusStrokeFillPath');
    }

    processEmfPlusSerializableObject(flags, data) {
        console.log('Processing EmfPlusSerializableObject');
    }

    processEmfPlusSetTSGraphics(flags, data) {
        console.log('Processing EmfPlusSetTSGraphics');
    }

    processEmfPlusSetTSClip(flags, data) {
        console.log('Processing EmfPlusSetTSClip');
    }
}

module.exports = EmfPlusDrawer;