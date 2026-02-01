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

        // 设置Canvas大小和坐标转换
        if (metafileData.header.bounds) {
            const bounds = metafileData.header.bounds;
            const width = bounds.right - bounds.left;
            const height = bounds.bottom - bounds.top;
            
            // 设置Canvas大小
            const canvasWidth = Math.max(Math.min(width, 2000), 800);
            const canvasHeight = Math.max(Math.min(height, 1500), 600);
            this.ctx.canvas.width = canvasWidth;
            this.ctx.canvas.height = canvasHeight;
            
            // 设置窗口范围用于坐标转换
            this.coordinateTransformer.setWindowOrg(bounds.left, bounds.top);
            this.coordinateTransformer.setWindowExt(width, height);
            this.coordinateTransformer.setViewportOrg(0, 0);
            this.coordinateTransformer.setViewportExt(canvasWidth, canvasHeight);
            
            console.log('Window:', { org: [bounds.left, bounds.top], ext: [width, height] });
            console.log('Viewport:', { org: [0, 0], ext: [canvasWidth, canvasHeight] });
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
            case 0x0000000F: // EMR_SETPIXELV
                this.processEmfSetPixelV(data);
                break;
            case 0x00000010: // EMR_SETMAPPERFLAGS
                this.processEmfSetMapperFlags(data);
                break;
            case 0x00000011: // EMR_SETMAPMODE
                this.processEmfSetMapMode(data);
                break;
            case 0x00000012: // EMR_SETBKMODE
                this.processEmfSetBkMode(data);
                break;
            case 0x00000013: // EMR_SETPOLYFILLMODE
                this.processEmfSetPolyFillMode(data);
                break;
            case 0x00000014: // EMR_SETROP2
                this.processEmfSetRop2(data);
                break;
            case 0x00000015: // EMR_SETSTRETCHBLTMODE
                this.processEmfSetStretchBltMode(data);
                break;
            case 0x00000016: // EMR_SETTEXTALIGN
                this.processEmfSetTextAlign(data);
                break;
            case 0x00000017: // EMR_SETTEXTCOLOR
                this.processEmfSetTextColor(data);
                break;
            case 0x00000018: // EMR_SETCOLORADJUSTMENT
                this.processEmfSetColorAdjustment(data);
                break;
            case 0x00000019: // EMR_SETBKCOLOR
                this.processEmfSetBkColor(data);
                break;
            case 0x0000001A: // EMR_OFFSETCLIPRGN
                this.processEmfOffsetClipRgn(data);
                break;
            case 0x0000001B: // EMR_MOVETOEX
                this.processEmfMoveToEx(data);
                break;
            case 0x0000001C: // EMR_SETMETARGN
                this.processEmfSetMetaRgn(data);
                break;
            case 0x0000001D: // EMR_EXCLUDECLIPRECT
                this.processEmfExcludeClipRect(data);
                break;
            case 0x0000001E: // EMR_INTERSECTCLIPRECT
                this.processEmfIntersectClipRect(data);
                break;
            case 0x0000001F: // EMR_SCALEVIEWPORTEXTEX
                this.processEmfScaleViewportExtEx(data);
                break;
            case 0x00000020: // EMR_SCALEWINDOWEXTEX
                this.processEmfScaleWindowExtEx(data);
                break;
            case 0x00000021: // EMR_SAVEDC
                this.processEmfSaveDC(data);
                break;
            case 0x00000022: // EMR_RESTOREDC
                this.processEmfRestoreDC(data);
                break;
            case 0x00000023: // EMR_SETWORLDTRANSFORM
                this.processEmfSetWorldTransform(data);
                break;
            case 0x00000024: // EMR_MODIFYWORLDTRANSFORM
                this.processEmfModifyWorldTransform(data);
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
            case 0x00000028: // EMR_DELETEOBJECT
                this.processEmfDeleteObject(data);
                break;
            case 0x00000029: // EMR_ANGLEARC
                this.processEmfAngleArc(data);
                break;
            case 0x0000002A: // EMR_ELLIPSE
                this.processEmfEllipse(data);
                break;
            case 0x0000002B: // EMR_RECTANGLE
                this.processEmfRectangle(data);
                break;
            case 0x0000002C: // EMR_ROUNDRECT
                this.processEmfRoundRect(data);
                break;
            case 0x0000002D: // EMR_ARC
                this.processEmfArc(data);
                break;
            case 0x0000002E: // EMR_CHORD
                this.processEmfChord(data);
                break;
            case 0x0000002F: // EMR_PIE
                this.processEmfPie(data);
                break;
            case 0x00000030: // EMR_SELECTPALETTE
                this.processEmfSelectPalette(data);
                break;
            case 0x00000031: // EMR_CREATEPALETTE
                this.processEmfCreatePalette(data);
                break;
            case 0x00000032: // EMR_SETPALETTEENTRIES
                this.processEmfSetPaletteEntries(data);
                break;
            case 0x00000033: // EMR_RESIZEPALETTE
                this.processEmfResizePalette(data);
                break;
            case 0x00000034: // EMR_REALIZEPALETTE
                this.processEmfRealizePalette(data);
                break;
            case 0x00000035: // EMR_EXTFLOODFILL
                this.processEmfExtFloodFill(data);
                break;
            case 0x00000036: // EMR_LINETO
                this.processEmfLineTo(data);
                break;
            case 0x00000037: // EMR_ARCTO
                this.processEmfArcTo(data);
                break;
            case 0x00000038: // EMR_POLYDRAW
                this.processEmfPolyDraw(data);
                break;
            case 0x00000039: // EMR_SETARCDIRECTION
                this.processEmfSetArcDirection(data);
                break;
            case 0x0000003A: // EMR_SETMITERLIMIT
                this.processEmfSetMiterLimit(data);
                break;
            case 0x0000003B: // EMR_BEGINPATH
                this.processEmfBeginPath(data);
                break;
            case 0x0000003C: // EMR_ENDPATH
                this.processEmfEndPath(data);
                break;
            case 0x0000003D: // EMR_CLOSEFIGURE
                this.processEmfCloseFigure(data);
                break;
            case 0x0000003E: // EMR_FILLPATH
                this.processEmfFillPath(data);
                break;
            case 0x0000003F: // EMR_STROKEANDFILLPATH
                this.processEmfStrokeAndFillPath(data);
                break;
            case 0x00000040: // EMR_STROKEPATH
                this.processEmfStrokePath(data);
                break;
            case 0x00000041: // EMR_FLATTENPATH
                this.processEmfFlattenPath(data);
                break;
            case 0x00000042: // EMR_WIDENPATH
                this.processEmfWidenPath(data);
                break;
            case 0x00000043: // EMR_SELECTCLIPPATH
                this.processEmfSelectClipPath(data);
                break;
            case 0x00000044: // EMR_ABORTPATH
                this.processEmfAbortPath(data);
                break;
            case 0x0000004B: // EMR_EXTCREATEFONTINDIRECTW
                this.processEmfExtCreateFontIndirectW(data);
                break;
            case 0x0000004C: // EMR_EXTTEXTOUTA
                this.processEmfExtTextOutA(data);
                break;
            case 0x00000051: // EMR_BITBLT
                this.processEmfBitBlt(data);
                break;
            case 0x00000052: // EMR_STRETCHBLT
                this.processEmfStretchBlt(data);
                break;
            case 0x00000053: // EMR_EXTTEXTOUTA
                this.processEmfExtTextOutA(data);
                break;
            case 0x00000054: // EMR_EXTTEXTOUTW
                this.processEmfExtTextOutW(data);
                break;
            case 0x00000062: // EMR_CREATEMONOBRUSH
                this.processEmfCreateMonoBrush(data);
                break;
            case 0x00000064: // EMR_CREATEBRUSHINDIRECT (alternative)
                this.processEmfCreateBrushIndirect(data);
                break;
            case 0x0000006D: // EMR_CREATECOLORSPACEW
                this.processEmfCreateColorSpaceW(data);
                break;
            default:
                console.log('Unknown EMF record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
                this.tryProcessAsCoordinates(data);
                break;
        }
    }

    // 辅助方法：从数据中读取DWORD（4字节无符号整数）
    readDwordFromData(data, offset) {
        if (offset + 4 > data.length) return 0;
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    }

    // 辅助方法：从数据中读取有符号LONG（4字节有符号整数）
    readLongFromData(data, offset) {
        if (offset + 4 > data.length) return 0;
        const value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
        // 转换为有符号整数
        return value > 0x7FFFFFFF ? value - 0x100000000 : value;
    }

    // 辅助方法：将RGB颜色值转换为十六进制字符串
    rgbToHex(rgb) {
        const r = (rgb & 0xFF).toString(16).padStart(2, '0');
        const g = ((rgb >> 8) & 0xFF).toString(16).padStart(2, '0');
        const b = ((rgb >> 16) & 0xFF).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // 应用GDI对象样式
    applyGdiObject(obj) {
        if (obj.type === 'pen') {
            this.ctx.strokeStyle = obj.color;
            this.ctx.lineWidth = obj.width || 1;
        } else if (obj.type === 'brush') {
            this.ctx.fillStyle = obj.color;
        }
    }

    // 应用Stock对象（Windows预定义对象）
    applyStockObject(handle) {
        const stockObjects = {
            0x80000000: { type: 'brush', color: '#ffffff' }, // WHITE_BRUSH
            0x80000001: { type: 'brush', color: '#c0c0c0' }, // LTGRAY_BRUSH
            0x80000002: { type: 'brush', color: '#808080' }, // GRAY_BRUSH
            0x80000003: { type: 'brush', color: '#404040' }, // DKGRAY_BRUSH
            0x80000004: { type: 'brush', color: '#000000' }, // BLACK_BRUSH
            0x80000005: { type: 'brush', color: 'transparent' }, // NULL_BRUSH
            0x80000007: { type: 'pen', color: '#000000', width: 1 }, // BLACK_PEN
            0x80000008: { type: 'pen', color: '#ffffff', width: 1 }, // WHITE_PEN
            0x80000009: { type: 'pen', color: 'transparent', width: 0 } // NULL_PEN
        };
        
        const obj = stockObjects[handle];
        if (obj) {
            this.applyGdiObject(obj);
        }
    }

    // 以下是具体的EMF处理方法
    processEmfHeader(data) {
        console.log('Processing EMF header');
    }

    processEmfPolyBezier(data) {
        // EMR_POLYBEZIER: Bounds(16) + Count(4) + Points[]
        if (data.length < 20) return;
        
        const count = this.readDwordFromData(data, 16);
        console.log('Processing EMF PolyBezier, count:', count);
        
        if (data.length < 20 + count * 8) return;
        
        if (count >= 4 && count % 3 === 1) { // 贝塞尔曲线需要 1+3n 个点
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = this.readLongFromData(data, 20 + i * 8);
                const y = this.readLongFromData(data, 24 + i * 8);
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                points.push(transformed);
            }
            
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 3) {
                if (i + 2 < points.length) {
                    this.ctx.bezierCurveTo(
                        points[i].x, points[i].y,
                        points[i + 1].x, points[i + 1].y,
                        points[i + 2].x, points[i + 2].y
                    );
                }
            }
            this.ctx.stroke();
        }
    }

    processEmfPolygon(data) {
        // EMR_POLYGON: Bounds(16) + Count(4) + Points[]
        if (data.length < 20) return;
        
        const count = this.readDwordFromData(data, 16);
        console.log('Processing EMF Polygon, count:', count);
        
        if (data.length < 20 + count * 8) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const x = this.readLongFromData(data, 20 + i * 8);
            const y = this.readLongFromData(data, 24 + i * 8);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            if (i === 0) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    processEmfPolyline(data) {
        // EMR_POLYLINE: Bounds(16) + Count(4) + Points[]
        if (data.length < 20) return;
        
        const count = this.readDwordFromData(data, 16);
        console.log('Processing EMF Polyline, count:', count);
        
        if (data.length < 20 + count * 8) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const x = this.readLongFromData(data, 20 + i * 8);
            const y = this.readLongFromData(data, 24 + i * 8);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            if (i === 0) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
        }
        this.ctx.stroke();
    }

    processEmfPolyBezierTo(data) {
        // EMR_POLYBEZIERTO: Bounds(16) + Count(4) + Points[]
        // 使用当前位置作为起点，绘制贝塞尔曲线
        if (data.length < 20) return;
        
        const count = this.readDwordFromData(data, 16);
        console.log('Processing EMF PolyBezierTo, count:', count);
        
        if (data.length < 20 + count * 8 || count % 3 !== 0) return;
        
        const points = [];
        for (let i = 0; i < count; i++) {
            const x = this.readLongFromData(data, 20 + i * 8);
            const y = this.readLongFromData(data, 24 + i * 8);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            points.push(transformed);
        }
        
        for (let i = 0; i < points.length; i += 3) {
            if (i + 2 < points.length) {
                this.ctx.bezierCurveTo(
                    points[i].x, points[i].y,
                    points[i + 1].x, points[i + 1].y,
                    points[i + 2].x, points[i + 2].y
                );
            }
        }
        this.ctx.stroke();
    }

    processEmfPolylineTo(data) {
        // EMR_POLYLINETO: Bounds(16) + Count(4) + Points[]
        // 使用当前位置作为起点
        if (data.length < 20) return;
        
        const count = this.readDwordFromData(data, 16);
        console.log('Processing EMF PolylineTo, count:', count);
        
        if (data.length < 20 + count * 8) return;
        
        for (let i = 0; i < count; i++) {
            const x = this.readLongFromData(data, 20 + i * 8);
            const y = this.readLongFromData(data, 24 + i * 8);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            this.ctx.lineTo(transformed.x, transformed.y);
        }
        this.ctx.stroke();
    }

    processEmfPolyPolyline(data) {
        // EMR_POLYPOLYLINE: Bounds(16) + NumberOfPolylines(4) + Count(4) + PolylineCounts[] + Points[]
        if (data.length < 24) return;
        
        const numberOfPolylines = this.readDwordFromData(data, 16);
        const totalCount = this.readDwordFromData(data, 20);
        console.log('Processing EMF PolyPolyline, polylines:', numberOfPolylines, 'total points:', totalCount);
        
        if (data.length < 24 + numberOfPolylines * 4 + totalCount * 8) return;
        
        // 读取每条折线的点数
        const counts = [];
        for (let i = 0; i < numberOfPolylines; i++) {
            counts.push(this.readDwordFromData(data, 24 + i * 4));
        }
        
        // 读取所有点并绘制每条折线
        let pointOffset = 24 + numberOfPolylines * 4;
        for (let i = 0; i < numberOfPolylines; i++) {
            const count = counts[i];
            this.ctx.beginPath();
            
            for (let j = 0; j < count; j++) {
                const x = this.readLongFromData(data, pointOffset);
                const y = this.readLongFromData(data, pointOffset + 4);
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                
                if (j === 0) {
                    this.ctx.moveTo(transformed.x, transformed.y);
                } else {
                    this.ctx.lineTo(transformed.x, transformed.y);
                }
                pointOffset += 8;
            }
            this.ctx.stroke();
        }
    }

    processEmfPolyPolygon(data) {
        // EMR_POLYPOLYGON: Bounds(16) + NumberOfPolygons(4) + Count(4) + PolygonCounts[] + Points[]
        if (data.length < 24) return;
        
        const numberOfPolygons = this.readDwordFromData(data, 16);
        const totalCount = this.readDwordFromData(data, 20);
        console.log('Processing EMF PolyPolygon, polygons:', numberOfPolygons, 'total points:', totalCount);
        
        if (data.length < 24 + numberOfPolygons * 4 + totalCount * 8) return;
        
        // 读取每个多边形的点数
        const counts = [];
        for (let i = 0; i < numberOfPolygons; i++) {
            counts.push(this.readDwordFromData(data, 24 + i * 4));
        }
        
        // 读取所有点并绘制每个多边形
        let pointOffset = 24 + numberOfPolygons * 4;
        for (let i = 0; i < numberOfPolygons; i++) {
            const count = counts[i];
            this.ctx.beginPath();
            
            for (let j = 0; j < count; j++) {
                const x = this.readLongFromData(data, pointOffset);
                const y = this.readLongFromData(data, pointOffset + 4);
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                
                if (j === 0) {
                    this.ctx.moveTo(transformed.x, transformed.y);
                } else {
                    this.ctx.lineTo(transformed.x, transformed.y);
                }
                pointOffset += 8;
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    processEmfSetWindowExtEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        console.log('EMF SetWindowExtEx:', x, y);
        this.coordinateTransformer.setWindowExt(x, y);
    }

    processEmfSetWindowOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        console.log('EMF SetWindowOrgEx:', x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
    }

    processEmfSetViewportExtEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        console.log('EMF SetViewportExtEx:', x, y);
        this.coordinateTransformer.setViewportExt(x, y);
    }

    processEmfSetViewportOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        console.log('EMF SetViewportOrgEx:', x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
    }

    processEmfSetBrushOrgEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        console.log('EMF SetBrushOrgEx:', x, y);
    }

    processEmfSetMapMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        this.coordinateTransformer.setMapMode(mode);
        console.log('EMF SetMapMode:', mode);
    }

    processEmfSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.strokeColor = this.rgbToHex(color);
        this.ctx.strokeStyle = this.strokeColor;
        console.log('EMF SetTextColor:', color, '->', this.strokeColor);
    }

    processEmfSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.fillColor = this.rgbToHex(color);
        this.ctx.fillStyle = this.fillColor;
        console.log('EMF SetBkColor:', color, '->', this.fillColor);
    }

    processEmfMoveToEx(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.moveTo(transformed.x, transformed.y);
        console.log('EMF MoveToEx:', x, y, '->', transformed.x, transformed.y);
    }

    processEmfRestoreDC(data) {
        if (data.length < 4) return;
        const savedDC = this.readDwordFromData(data, 0);
        console.log('EMF RestoreDC:', savedDC);
    }

    processEmfSelectObject(data) {
        if (data.length < 4) return;
        const objectHandle = this.readDwordFromData(data, 0);
        console.log('EMF SelectObject:', objectHandle);

        const obj = this.gdiObjectManager.selectObject(objectHandle);
        if (obj) {
            this.applyGdiObject(obj);
        } else if (objectHandle >= 0x80000000) {
            this.applyStockObject(objectHandle);
        }
    }

    processEmfCreatePen(data) {
        if (data.length < 12) return;
        const penStyle = this.readDwordFromData(data, 0);
        const width = this.readDwordFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        console.log('EMF CreatePen:', penStyle, width, color);

        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createPen(penStyle, width, penColor);
    }

    processEmfCreateBrushIndirect(data) {
        if (data.length < 16) return;
        const brushStyle = this.readDwordFromData(data, 0);
        const color = this.readDwordFromData(data, 4);
        console.log('EMF CreateBrushIndirect:', brushStyle, color);

        const brushColor = this.rgbToHex(color);
        this.gdiObjectManager.createBrush(brushStyle, brushColor);
    }

    processEmfEllipse(data) {
        if (data.length < 16) return;
        const left = this.readDwordFromData(data, 0);
        const top = this.readDwordFromData(data, 4);
        const right = this.readDwordFromData(data, 8);
        const bottom = this.readDwordFromData(data, 12);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.beginPath();
        this.ctx.ellipse(
            (transformedLeftTop.x + transformedRightBottom.x) / 2,
            (transformedLeftTop.y + transformedRightBottom.y) / 2,
            (transformedRightBottom.x - transformedLeftTop.x) / 2,
            (transformedRightBottom.y - transformedLeftTop.y) / 2,
            0,
            0,
            Math.PI * 2
        );
        this.ctx.stroke();
    }

    processEmfRectangle(data) {
        if (data.length < 16) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('EMF Rectangle:', x, y, width, height);
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.stroke();
    }

    processEmfLineTo(data) {
        if (data.length < 8) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.lineTo(transformed.x, transformed.y);
        this.ctx.stroke();
        console.log('EMF LineTo:', x, y, '->', transformed.x, transformed.y);
    }

    processEmfBeginPath(data) {
        console.log('EMF BeginPath');
        this.ctx.beginPath();
        this.pathState = 'active';
    }

    processEmfEndPath(data) {
        console.log('EMF EndPath');
        this.pathState = 'completed';
    }

    processEmfStrokeAndFillPath(data) {
        console.log('EMF StrokeAndFillPath');
        this.ctx.fill();
        this.ctx.stroke();
        this.pathState = 'idle';
    }

    processEmfStrokePath(data) {
        console.log('EMF StrokePath');
        this.ctx.stroke();
        this.pathState = 'idle';
    }

    processEmfAbortPath(data) {
        console.log('EMF AbortPath');
        this.pathState = 'idle';
    }

    processEmfSetBkMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        console.log('EMF SetBkMode:', mode);
        // 1 = TRANSPARENT, 2 = OPAQUE
    }

    processEmfSetRop2(data) {
        if (data.length < 4) return;
        const rop2 = this.readDwordFromData(data, 0);
        console.log('EMF SetRop2:', rop2);
        // ROP2 mode for binary raster operations
    }

    processEmfSetStretchBltMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        console.log('EMF SetStretchBltMode:', mode);
        // Stretch mode for bitmap operations
    }

    processEmfSetTextAlign(data) {
        if (data.length < 4) return;
        const align = this.readDwordFromData(data, 0);
        console.log('EMF SetTextAlign:', align);
        // Text alignment mode
    }

    processEmfDeleteObject(data) {
        if (data.length < 4) return;
        const objectHandle = this.readDwordFromData(data, 0);
        console.log('EMF DeleteObject:', objectHandle);
        this.gdiObjectManager.deleteObject(objectHandle);
    }

    processEmfExtCreateFontIndirectW(data) {
        if (data.length < 320) return;
        // EMR_EXTCREATEFONTINDIRECTW 结构很复杂，包含字体信息
        // 简化处理：只提取字体高度
        const height = this.readDwordFromData(data, 4);
        console.log('EMF ExtCreateFontIndirectW, height:', height);
        // 这里应该创建字体对象并存储到GDI对象管理器
    }

    processEmfExtTextOutA(data) {
        // ANSI版本的文本输出
        this.processEmfTextOut(data, false);
    }

    processEmfExtTextOutW(data) {
        // Unicode版本的文本输出
        this.processEmfTextOut(data, true);
    }

    processEmfTextOut(data, isUnicode) {
        if (data.length < 76) return;
        
        // EMR_EXTTEXTOUTW/A 结构
        // Bounds (16 bytes), iGraphicsMode (4), exScale (4), eyScale (4)
        // EmrText structure starts at offset 28
        const x = this.readDwordFromData(data, 32);  // Reference point X
        const y = this.readDwordFromData(data, 36);  // Reference point Y
        const stringLength = this.readDwordFromData(data, 40);  // Number of characters
        const offString = this.readDwordFromData(data, 44);  // Offset to string
        
        console.log(`EMF ExtTextOut${isUnicode ? 'W' : 'A'}:`, x, y, 'length:', stringLength);
        
        if (stringLength > 0 && offString < data.length) {
            let text = '';
            try {
                if (isUnicode && offString + stringLength * 2 <= data.length) {
                    // Unicode text (UTF-16LE)
                    for (let i = 0; i < stringLength; i++) {
                        const charCode = data[offString + i * 2] | (data[offString + i * 2 + 1] << 8);
                        if (charCode > 0) {
                            text += String.fromCharCode(charCode);
                        }
                    }
                } else if (!isUnicode && offString + stringLength <= data.length) {
                    // ANSI text
                    for (let i = 0; i < stringLength; i++) {
                        text += String.fromCharCode(data[offString + i]);
                    }
                }
                
                // 绘制文本
                if (text.length > 0) {
                    const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                    this.ctx.fillText(text, transformed.x, transformed.y);
                    console.log('  Rendered text:', text.substring(0, 50));
                }
            } catch (error) {
                console.log('  Error reading text:', error.message);
            }
        }
    }

    processEmfBitBlt(data) {
        if (data.length < 100) return;
        // EMR_BITBLT 结构 (MS-EMF 2.3.1.1)
        // Bounds (16 bytes, offset 0-15): 目标矩形边界
        // xDest (4 bytes, offset 16): 目标X坐标
        // yDest (4 bytes, offset 20): 目标Y坐标  
        // cxDest (4 bytes, offset 24): 目标宽度
        // cyDest (4 bytes, offset 28): 目标高度
        
        const boundsLeft = this.readLongFromData(data, 0);
        const boundsTop = this.readLongFromData(data, 4);
        const boundsRight = this.readLongFromData(data, 8);
        const boundsBottom = this.readLongFromData(data, 12);
        
        const destX = this.readLongFromData(data, 16);
        const destY = this.readLongFromData(data, 20);
        const destWidth = this.readLongFromData(data, 24);
        const destHeight = this.readLongFromData(data, 28);
        
        // 使用 bounds 来计算实际宽高（如果 cx/cy 为0）
        const actualWidth = destWidth > 0 ? destWidth : (boundsRight - boundsLeft);
        const actualHeight = destHeight > 0 ? destHeight : (boundsBottom - boundsTop);
        
        console.log('EMF BitBlt: dest=', destX, destY, 'size=', actualWidth, 'x', actualHeight);
        
        // 尝试渲染嵌入的位图数据
        try {
            const offBmiSrc = this.readDwordFromData(data, 76);
            const cbBmiSrc = this.readDwordFromData(data, 80);
            const offBitsSrc = this.readDwordFromData(data, 84);
            const cbBitsSrc = this.readDwordFromData(data, 88);
            
            // 偏移量是相对于整个记录的，需要减去8字节（type+size）
            const bmiOffset = offBmiSrc - 8;
            const bitsOffset = offBitsSrc - 8;
            
            if (cbBitsSrc > 0 && bitsOffset >= 0 && bitsOffset + cbBitsSrc <= data.length && cbBmiSrc >= 40) {
                // 解析 BITMAPINFOHEADER
                const biWidth = this.readLongFromData(data, bmiOffset + 4);
                const biHeight = this.readLongFromData(data, bmiOffset + 8);
                const biBitCount = data[bmiOffset + 14] | (data[bmiOffset + 15] << 8);
                const biCompression = this.readDwordFromData(data, bmiOffset + 16);
                
                console.log('  Bitmap:', biWidth, 'x', biHeight, 'bits:', biBitCount, 'compression:', biCompression);
                
                // 如果是24位或32位未压缩位图，尝试渲染
                if (biCompression === 0 && (biBitCount === 24 || biBitCount === 32)) {
                    this.renderBitmap(destX, destY, actualWidth, actualHeight, 
                                     biWidth, biHeight, biBitCount, data, bitsOffset, cbBitsSrc);
                    return;
                }
            }
        } catch (error) {
            console.log('  Failed to render bitmap:', error.message);
        }
        
        // 降级：绘制一个占位符矩形表示图像位置
        const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformed2 = this.coordinateTransformer.transform(destX + actualWidth, destY + actualHeight, this.ctx.canvas.width, this.ctx.canvas.height);
        
        const w = Math.abs(transformed2.x - transformed1.x);
        const h = Math.abs(transformed2.y - transformed1.y);
        
        if (w > 0 && h > 0) {
            const savedFillStyle = this.ctx.fillStyle;
            const savedStrokeStyle = this.ctx.strokeStyle;
            
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.strokeStyle = '#cccccc';
            this.ctx.fillRect(transformed1.x, transformed1.y, w, h);
            this.ctx.strokeRect(transformed1.x, transformed1.y, w, h);
            
            this.ctx.fillStyle = savedFillStyle;
            this.ctx.strokeStyle = savedStrokeStyle;
        }
    }

    processEmfStretchBlt(data) {
        if (data.length < 100) return;
        // EMR_STRETCHBLT 结构 (MS-EMF 2.3.1.6)
        // Bounds (16 bytes, offset 0-15): 目标矩形边界
        // xDest (4 bytes, offset 16): 目标X坐标
        // yDest (4 bytes, offset 20): 目标Y坐标
        // cxDest (4 bytes, offset 24): 目标宽度
        // cyDest (4 bytes, offset 28): 目标高度
        
        const boundsLeft = this.readLongFromData(data, 0);
        const boundsTop = this.readLongFromData(data, 4);
        const boundsRight = this.readLongFromData(data, 8);
        const boundsBottom = this.readLongFromData(data, 12);
        
        const destX = this.readLongFromData(data, 16);
        const destY = this.readLongFromData(data, 20);
        const destWidth = this.readLongFromData(data, 24);
        const destHeight = this.readLongFromData(data, 28);
        
        // 使用 bounds 来计算实际宽高（如果 cx/cy 为0）
        const actualWidth = destWidth > 0 ? destWidth : (boundsRight - boundsLeft);
        const actualHeight = destHeight > 0 ? destHeight : (boundsBottom - boundsTop);
        
        console.log('EMF StretchBlt: dest=', destX, destY, 'size=', actualWidth, 'x', actualHeight);
        
        // 尝试渲染嵌入的位图数据
        try {
            const offBmiSrc = this.readDwordFromData(data, 80);
            const cbBmiSrc = this.readDwordFromData(data, 84);
            const offBitsSrc = this.readDwordFromData(data, 88);
            const cbBitsSrc = this.readDwordFromData(data, 92);
            
            // 偏移量是相对于整个记录的，需要减去8字节（type+size）
            const bmiOffset = offBmiSrc - 8;
            const bitsOffset = offBitsSrc - 8;
            
            if (cbBitsSrc > 0 && bitsOffset >= 0 && bitsOffset + cbBitsSrc <= data.length && cbBmiSrc >= 40) {
                // 解析 BITMAPINFOHEADER
                const biWidth = this.readLongFromData(data, bmiOffset + 4);
                const biHeight = this.readLongFromData(data, bmiOffset + 8);
                const biBitCount = data[bmiOffset + 14] | (data[bmiOffset + 15] << 8);
                const biCompression = this.readDwordFromData(data, bmiOffset + 16);
                
                console.log('  Bitmap:', biWidth, 'x', biHeight, 'bits:', biBitCount, 'compression:', biCompression);
                
                // 如果是24位或32位未压缩位图，尝试渲染
                if (biCompression === 0 && (biBitCount === 24 || biBitCount === 32)) {
                    this.renderBitmap(destX, destY, actualWidth, actualHeight, 
                                     biWidth, biHeight, biBitCount, data, bitsOffset, cbBitsSrc);
                    return;
                }
            }
        } catch (error) {
            console.log('  Failed to render bitmap:', error.message);
        }
        
        // 降级：绘制一个占位符矩形表示图像位置
        const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformed2 = this.coordinateTransformer.transform(destX + actualWidth, destY + actualHeight, this.ctx.canvas.width, this.ctx.canvas.height);
        
        const w = Math.abs(transformed2.x - transformed1.x);
        const h = Math.abs(transformed2.y - transformed1.y);
        
        if (w > 0 && h > 0) {
            const savedFillStyle = this.ctx.fillStyle;
            const savedStrokeStyle = this.ctx.strokeStyle;
            
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.strokeStyle = '#cccccc';
            this.ctx.fillRect(transformed1.x, transformed1.y, w, h);
            this.ctx.strokeRect(transformed1.x, transformed1.y, w, h);
            
            this.ctx.fillStyle = savedFillStyle;
            this.ctx.strokeStyle = savedStrokeStyle;
        }
    }

    processEmfCreateMonoBrush(data) {
        console.log('EMF CreateMonoBrush');
        // 创建单色画刷，简化处理
        this.gdiObjectManager.createBrush(0, '#000000');
    }

    processEmfCreateColorSpaceW(data) {
        console.log('EMF CreateColorSpaceW');
        // 创建颜色空间，简化处理，大多数情况可以忽略
    }

    processEmfText(data) {
        // 保持向后兼容
        this.processEmfTextOut(data, true);
    }

    // === 新增的EMF记录处理方法 ===

    processEmfSetPixelV(data) {
        // EMR_SETPIXELV: Point(8) + Color(4)
        if (data.length < 12) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        const hexColor = this.rgbToHex(color);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        
        this.ctx.fillStyle = hexColor;
        this.ctx.fillRect(transformed.x, transformed.y, 1, 1);
        console.log('EMF SetPixelV:', x, y, hexColor);
    }

    processEmfSetMapperFlags(data) {
        if (data.length < 4) return;
        const flags = this.readDwordFromData(data, 0);
        console.log('EMF SetMapperFlags:', flags);
    }

    processEmfSetPolyFillMode(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        console.log('EMF SetPolyFillMode:', mode);
        // 1 = ALTERNATE, 2 = WINDING
        if (mode === 1) {
            this.ctx.fillRule = 'evenodd';
        } else if (mode === 2) {
            this.ctx.fillRule = 'nonzero';
        }
    }

    processEmfSetColorAdjustment(data) {
        console.log('EMF SetColorAdjustment');
        // 颜色调整，浏览器Canvas中不常用
    }

    processEmfOffsetClipRgn(data) {
        if (data.length < 8) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        console.log('EMF OffsetClipRgn:', x, y);
        // Canvas中裁剪区域偏移不直接支持
    }

    processEmfSetMetaRgn(data) {
        console.log('EMF SetMetaRgn');
        // 设置元区域
    }

    processEmfExcludeClipRect(data) {
        if (data.length < 16) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        console.log('EMF ExcludeClipRect:', left, top, right, bottom);
        // Canvas不直接支持排除裁剪
    }

    processEmfIntersectClipRect(data) {
        if (data.length < 16) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(
            transformedLeftTop.x,
            transformedLeftTop.y,
            transformedRightBottom.x - transformedLeftTop.x,
            transformedRightBottom.y - transformedLeftTop.y
        );
        this.ctx.clip();
        console.log('EMF IntersectClipRect:', left, top, right, bottom);
    }

    processEmfScaleViewportExtEx(data) {
        if (data.length < 16) return;
        const xNum = this.readLongFromData(data, 0);
        const xDenom = this.readLongFromData(data, 4);
        const yNum = this.readLongFromData(data, 8);
        const yDenom = this.readLongFromData(data, 12);
        console.log('EMF ScaleViewportExtEx:', xNum, xDenom, yNum, yDenom);
        // 需要更新坐标转换器的viewport范围
    }

    processEmfScaleWindowExtEx(data) {
        if (data.length < 16) return;
        const xNum = this.readLongFromData(data, 0);
        const xDenom = this.readLongFromData(data, 4);
        const yNum = this.readLongFromData(data, 8);
        const yDenom = this.readLongFromData(data, 12);
        console.log('EMF ScaleWindowExtEx:', xNum, xDenom, yNum, yDenom);
        // 需要更新坐标转换器的window范围
    }

    processEmfSaveDC(data) {
        this.ctx.save();
        console.log('EMF SaveDC');
    }

    processEmfSetWorldTransform(data) {
        if (data.length < 24) return;
        // XFORM结构：M11, M12, M21, M22, Dx, Dy (每个4字节float)
        console.log('EMF SetWorldTransform');
        // Canvas中的transform需要从XFORM转换
    }

    processEmfModifyWorldTransform(data) {
        if (data.length < 28) return;
        console.log('EMF ModifyWorldTransform');
        // 修改世界坐标变换
    }

    processEmfAngleArc(data) {
        if (data.length < 20) return;
        const centerX = this.readLongFromData(data, 0);
        const centerY = this.readLongFromData(data, 4);
        const radius = this.readDwordFromData(data, 8);
        const startAngle = this.readDwordFromData(data, 12); // 以度为单位
        const sweepAngle = this.readDwordFromData(data, 16); // 以度为单位
        
        const transformed = this.coordinateTransformer.transform(centerX, centerY, this.ctx.canvas.width, this.ctx.canvas.height);
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = ((startAngle + sweepAngle) * Math.PI) / 180;
        
        this.ctx.beginPath();
        this.ctx.arc(transformed.x, transformed.y, radius, startRad, endRad, sweepAngle < 0);
        this.ctx.stroke();
        console.log('EMF AngleArc:', centerX, centerY, radius, startAngle, sweepAngle);
    }

    processEmfRoundRect(data) {
        if (data.length < 24) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        const cornerWidth = this.readLongFromData(data, 16);
        const cornerHeight = this.readLongFromData(data, 20);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = transformedRightBottom.x - transformedLeftTop.x;
        const height = transformedRightBottom.y - transformedLeftTop.y;
        const rx = cornerWidth / 2;
        const ry = cornerHeight / 2;
        
        this.ctx.beginPath();
        this.ctx.roundRect(transformedLeftTop.x, transformedLeftTop.y, width, height, [rx]);
        this.ctx.stroke();
        console.log('EMF RoundRect:', left, top, right, bottom);
    }

    processEmfArc(data) {
        if (data.length < 32) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        const startX = this.readLongFromData(data, 16);
        const startY = this.readLongFromData(data, 20);
        const endX = this.readLongFromData(data, 24);
        const endY = this.readLongFromData(data, 28);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
        const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
        const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
        const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;
        
        // 简化处理：绘制椭圆弧
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        console.log('EMF Arc:', left, top, right, bottom);
    }

    processEmfChord(data) {
        // EMR_CHORD结构与EMR_ARC相同
        if (data.length < 32) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
        const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
        const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
        const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;
        
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        console.log('EMF Chord:', left, top, right, bottom);
    }

    processEmfPie(data) {
        // EMR_PIE结构与EMR_ARC相同
        if (data.length < 32) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
        const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
        const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
        const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        console.log('EMF Pie:', left, top, right, bottom);
    }

    processEmfSelectPalette(data) {
        if (data.length < 4) return;
        const paletteHandle = this.readDwordFromData(data, 0);
        console.log('EMF SelectPalette:', paletteHandle);
    }

    processEmfCreatePalette(data) {
        console.log('EMF CreatePalette');
        // 调色板创建，Canvas中不常用
    }

    processEmfSetPaletteEntries(data) {
        console.log('EMF SetPaletteEntries');
    }

    processEmfResizePalette(data) {
        console.log('EMF ResizePalette');
    }

    processEmfRealizePalette(data) {
        console.log('EMF RealizePalette');
    }

    processEmfExtFloodFill(data) {
        if (data.length < 16) return;
        const x = this.readLongFromData(data, 0);
        const y = this.readLongFromData(data, 4);
        const color = this.readDwordFromData(data, 8);
        const fillType = this.readDwordFromData(data, 12);
        console.log('EMF ExtFloodFill:', x, y, color, fillType);
        // Canvas不直接支持填充操作
    }

    processEmfArcTo(data) {
        // EMR_ARCTO与EMR_ARC结构相同，但会移动当前位置
        if (data.length < 32) return;
        const left = this.readLongFromData(data, 0);
        const top = this.readLongFromData(data, 4);
        const right = this.readLongFromData(data, 8);
        const bottom = this.readLongFromData(data, 12);
        
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
        const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
        const radiusX = Math.abs(transformedRightBottom.x - transformedLeftTop.x) / 2;
        const radiusY = Math.abs(transformedRightBottom.y - transformedLeftTop.y) / 2;
        
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        console.log('EMF ArcTo:', left, top, right, bottom);
    }

    processEmfPolyDraw(data) {
        // EMR_POLYDRAW: Bounds(16) + Count(4) + Points[] + Types[]
        if (data.length < 20) return;
        const count = this.readDwordFromData(data, 16);
        console.log('EMF PolyDraw, count:', count);
        
        if (data.length < 20 + count * 8 + count) return;
        
        // 读取点和类型
        for (let i = 0; i < count; i++) {
            const x = this.readLongFromData(data, 20 + i * 8);
            const y = this.readLongFromData(data, 24 + i * 8);
            const type = data[20 + count * 8 + i];
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            // type: 1=MOVETO, 2=LINETO, 4=BEZIERTO, 128=CLOSEFIGURE
            if (type & 1) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else if (type & 2) {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
            if (type & 128) {
                this.ctx.closePath();
            }
        }
        this.ctx.stroke();
    }

    processEmfSetArcDirection(data) {
        if (data.length < 4) return;
        const direction = this.readDwordFromData(data, 0);
        console.log('EMF SetArcDirection:', direction);
        // 1 = counterclockwise, 2 = clockwise
    }

    processEmfSetMiterLimit(data) {
        if (data.length < 4) return;
        const miterLimit = this.readDwordFromData(data, 0);
        this.ctx.miterLimit = miterLimit;
        console.log('EMF SetMiterLimit:', miterLimit);
    }

    processEmfCloseFigure(data) {
        this.ctx.closePath();
        console.log('EMF CloseFigure');
    }

    processEmfFillPath(data) {
        this.ctx.fill();
        this.pathState = 'idle';
        console.log('EMF FillPath');
    }

    processEmfFlattenPath(data) {
        console.log('EMF FlattenPath');
        // 将路径中的曲线转换为直线
    }

    processEmfWidenPath(data) {
        console.log('EMF WidenPath');
        // 扩展路径边界
    }

    processEmfSelectClipPath(data) {
        if (data.length < 4) return;
        const mode = this.readDwordFromData(data, 0);
        console.log('EMF SelectClipPath, mode:', mode);
        // 1=AND, 2=OR, 3=XOR, 4=DIFF, 5=COPY
        if (mode === 5) {
            this.ctx.clip();
        }
    }

    tryProcessAsCoordinates(data) {
        // 尝试将数据解析为坐标点
        if (data.length < 16) return;
        
        const points = [];
        for (let i = 0; i < data.length - 8; i += 8) {
            const x = this.readDwordFromData(data, i);
            const y = this.readDwordFromData(data, i + 4);
            
            // 检查坐标值是否合理
            if (Math.abs(x) < 50000 && Math.abs(y) < 50000) {
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                points.push(transformed);
            }
        }
        
        // 如果有足够的点，绘制折线
        if (points.length >= 3) {
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
            console.log('Drew polyline with', points.length, 'points from unknown record');
        }
    }

    finishPath() {
        // 完成路径绘制
        if (this.pathState === 'active' || this.pathState === 'completed') {
            this.ctx.stroke();
            this.pathState = 'idle';
        }
    }

    // 渲染DIB位图数据到Canvas
    renderBitmap(destX, destY, destWidth, destHeight, biWidth, biHeight, biBitCount, data, bitsOffset, bitsSize) {
        try {
            // 创建临时canvas来处理位图
            const bytesPerPixel = biBitCount / 8;
            const rowSize = Math.ceil(biWidth * bytesPerPixel / 4) * 4; // 4字节对齐
            const absHeight = Math.abs(biHeight);
            const isBottomUp = biHeight > 0;
            
            // 创建ImageData
            const imageData = this.ctx.createImageData(biWidth, absHeight);
            const pixels = imageData.data;
            
            // 读取位图数据
            for (let y = 0; y < absHeight; y++) {
                const srcY = isBottomUp ? (absHeight - 1 - y) : y;
                const srcRowOffset = bitsOffset + srcY * rowSize;
                
                for (let x = 0; x < biWidth; x++) {
                    const srcOffset = srcRowOffset + x * bytesPerPixel;
                    const dstOffset = (y * biWidth + x) * 4;
                    
                    if (srcOffset + bytesPerPixel <= bitsOffset + bitsSize) {
                        // DIB格式是BGR(A)，需要转换为RGBA
                        pixels[dstOffset + 2] = data[srcOffset];     // R
                        pixels[dstOffset + 1] = data[srcOffset + 1]; // G
                        pixels[dstOffset] = data[srcOffset + 2];     // B
                        pixels[dstOffset + 3] = biBitCount === 32 ? data[srcOffset + 3] : 255; // A
                    }
                }
            }
            
            // 创建临时canvas
            const tempCanvas = typeof document !== 'undefined' 
                ? document.createElement('canvas')
                : this.ctx.canvas.constructor !== undefined 
                    ? new this.ctx.canvas.constructor(biWidth, absHeight)
                    : null;
            
            if (tempCanvas) {
                tempCanvas.width = biWidth;
                tempCanvas.height = absHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(imageData, 0, 0);
                
                // 转换坐标并绘制到目标canvas
                const transformed1 = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
                const transformed2 = this.coordinateTransformer.transform(destX + destWidth, destY + destHeight, this.ctx.canvas.width, this.ctx.canvas.height);
                
                const w = Math.abs(transformed2.x - transformed1.x);
                const h = Math.abs(transformed2.y - transformed1.y);
                
                console.log('  Rendering bitmap to:', transformed1.x, transformed1.y, w, h);
                this.ctx.drawImage(tempCanvas, transformed1.x, transformed1.y, w, h);
            } else {
                // 如果无法创建临时canvas（Node环境），直接使用putImageData
                const transformed = this.coordinateTransformer.transform(destX, destY, this.ctx.canvas.width, this.ctx.canvas.height);
                this.ctx.putImageData(imageData, transformed.x, transformed.y);
            }
        } catch (error) {
            console.error('Error rendering bitmap:', error.message);
        }
    }
}

module.exports = EmfDrawer;