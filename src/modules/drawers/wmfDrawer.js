// WMF绘制模块
const BaseDrawer = require('./baseDrawer');

class WmfDrawer extends BaseDrawer {
    constructor(ctx) {
        super(ctx);
    }

    draw(metafileData) {
        console.log('Drawing WMF with header:', metafileData.header);
        console.log('Number of records:', metafileData.records.length);

        // 初始化画布
        this.initCanvas(metafileData);

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
        // 根据MS-WMF规范2.3.1的函数ID处理不同的WMF命令
        // 函数ID格式: 高字节为类别，低字节为功能
        switch (record.functionId) {
            case 0x0000: // META_EOF - End of File
                console.log('WMF End of File record');
                break;
                
            // ========== 状态记录 (State Records) ==========
            case 0x0103: // META_SETMAPMODE
                this.processSetMapMode(record.data);
                break;
            case 0x020B: // META_SETWINDOWORG
                this.processSetWindowOrg(record.data);
                break;
            case 0x020C: // META_SETWINDOWEXT
                this.processSetWindowExt(record.data);
                break;
            case 0x020D: // META_SETVIEWPORTORG
                this.processSetViewportOrg(record.data);
                break;
            case 0x020E: // META_SETVIEWPORTEXT
                this.processSetViewportExt(record.data);
                break;
            case 0x0201: // META_SETBKCOLOR
                this.processSetBkColor(record.data);
                break;
            case 0x0102: // META_SETBKMODE
                this.processSetBkMode(record.data);
                break;
            case 0x0209: // META_SETTEXTCOLOR
                this.processSetTextColor(record.data);
                break;
            case 0x0104: // META_SETROP2
                this.processSetROP2(record.data);
                break;
            case 0x0106: // META_SETPOLYFILLMODE
                this.processSetPolyFillMode(record.data);
                break;
            case 0x0107: // META_SETSTRETCHBLTMODE
                this.processSetStretchBltMode(record.data);
                break;
            case 0x0302: // META_SETTEXTALIGN
                this.processSetTextAlign(record.data);
                break;
                
            // ========== 对象创建记录 (Object Creation Records) ==========
            case 0x02FA: // META_CREATEPENINDIRECT
                this.processCreatePenIndirect(record.data);
                break;
            case 0x02FC: // META_CREATEBRUSHINDIRECT
                this.processCreateBrushIndirect(record.data);
                break;
            case 0x02FB: // META_CREATEFONTINDIRECT
                this.processCreateFontIndirect(record.data);
                break;
            case 0x00F8: // META_CREATEPALETTE
                this.processCreatePalette(record.data);
                break;
            case 0x01F9: // META_CREATEPATTERNBRUSH
                this.processCreatePatternBrush(record.data);
                break;
            case 0x00F7: // META_CREATEREGION
                this.processCreateRegion(record.data);
                break;
                
            // ========== 对象选择/删除记录 ==========
            case 0x012D: // META_SELECTOBJECT
                this.processSelectObject(record.data);
                break;
            case 0x01F0: // META_DELETEOBJECT
                this.processDeleteObject(record.data);
                break;
                
            // ========== 绘图记录 (Drawing Records) ==========
            case 0x0213: // META_MOVETO (旧版) 或 0x0214 META_LINETO
                this.processMoveTo(record.data);
                break;
            case 0x0214: // META_LINETO
                this.processLineTo(record.data);
                break;
            case 0x041B: // META_RECTANGLE
                this.processRectangle(record.data);
                break;
            case 0x061C: // META_ROUNDRECT
                this.processRoundRect(record.data);
                break;
            case 0x0418: // META_ELLIPSE
                this.processEllipse(record.data);
                break;
            case 0x0817: // META_ARC
                this.processArc(record.data);
                break;
            case 0x081A: // META_PIE
                this.processPie(record.data);
                break;
            case 0x0830: // META_CHORD
                this.processChord(record.data);
                break;
            case 0x0325: // META_POLYLINE
                this.processPolyline(record.data);
                break;
            case 0x0324: // META_POLYGON
                this.processPolygon(record.data);
                break;
            case 0x0538: // META_POLYPOLYGON
                this.processPolyPolygon(record.data);
                break;
                
            // ========== 文本记录 ==========
            case 0x0521: // META_TEXTOUT
                this.processTextOut(record.data);
                break;
            case 0x0A32: // META_EXTTEXTOUT
                this.processExtTextOut(record.data);
                break;
            case 0x0626: // META_ESCAPE
                this.processEscape(record.data);
                break;
                
            // ========== 位图操作记录 ==========
            case 0x0940: // META_DIBBITBLT
                this.processDibBitBlt(record.data);
                break;
            case 0x0B41: // META_DIBSTRETCHBLT
                this.processDibStretchBlt(record.data);
                break;
            case 0x0F43: // META_STRETCHDIB
                this.processStretchDib(record.data);
                break;
                
            // ========== 填充记录 ==========
            case 0x0419: // META_FILLREGION
                this.processFillRgn(record.data);
                break;
            case 0x0416: // META_FLOODFILL
                this.processFloodFill(record.data);
                break;
            case 0x0228: // META_FILLPOLYGON (非标准)
                this.processPolygon(record.data);
                break;
                
            // ========== 状态管理 ==========
            case 0x001E: // META_SAVEDC
                this.processSaveDC(record.data);
                break;
            case 0x0127: // META_RESTOREDC
                this.processRestoreDC(record.data);
                break;
                
            default:
                console.log('Unknown/Unimplemented WMF function:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
                break;
        }
    }

    // ========== 辅助方法 ==========
    readWordFromData(data, offset) {
        if (offset + 1 >= data.length) return 0;
        return data[offset] | (data[offset + 1] << 8);
    }

    readDwordFromData(data, offset) {
        if (offset + 3 >= data.length) return 0;
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    }

    readStringFromData(data, offset, length) {
        let str = '';
        for (let i = 0; i < length && offset + i < data.length; i++) {
            if (data[offset + i] !== 0) {
                str += String.fromCharCode(data[offset + i]);
            }
        }
        return str;
    }

    rgbToHex(rgb) {
        const r = (rgb & 0xFF).toString(16).padStart(2, '0');
        const g = ((rgb >> 8) & 0xFF).toString(16).padStart(2, '0');
        const b = ((rgb >> 16) & 0xFF).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // ========== 实现绘制方法 ==========
    processSetMapMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetMapMode:', mode);
        this.coordinateTransformer.setMapMode(mode);
    }

    processSetWindowOrg(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetWindowOrg:', x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
    }

    processSetWindowExt(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetWindowExt:', x, y);
        this.coordinateTransformer.setWindowExt(x, y);
    }

    processSetViewportOrg(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetViewportOrg:', x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
    }

    processSetViewportExt(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetViewportExt:', x, y);
        this.coordinateTransformer.setViewportExt(x, y);
    }

    processSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        console.log('SetBkColor:', color);
    }

    processSetBkMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetBkMode:', mode);
    }

    processSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        console.log('SetTextColor:', color);
        this.ctx.fillStyle = this.rgbToHex(color);
    }

    processSetROP2(data) {
        if (data.length < 2) return;
        const rop2 = this.readWordFromData(data, 0);
        console.log('SetROP2:', rop2);
    }

    processSetPolyFillMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetPolyFillMode:', mode);
    }

    processSetStretchBltMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetStretchBltMode:', mode);
    }

    processSetTextAlign(data) {
        if (data.length < 2) return;
        const align = this.readWordFromData(data, 0);
        console.log('SetTextAlign:', align);
    }

    processCreatePenIndirect(data) {
        if (data.length < 10) return;
        const style = this.readWordFromData(data, 0);
        const width = this.readWordFromData(data, 2);
        const color = this.readDwordFromData(data, 6);
        console.log('CreatePenIndirect:', style, width, color);
        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createPen(style, width, penColor);
    }

    processCreateBrushIndirect(data) {
        if (data.length < 8) return;
        const style = this.readWordFromData(data, 0);
        const color = this.readDwordFromData(data, 2);
        console.log('CreateBrushIndirect:', style, color);
        const brushColor = this.rgbToHex(color);
        this.gdiObjectManager.createBrush(style, brushColor);
    }

    processSelectObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        console.log('SelectObject:', objectIndex);
        const obj = this.gdiObjectManager.selectObject(objectIndex);
        if (obj) {
            this.applyGdiObject(obj);
        } else if (objectIndex >= 0x80000000) {
            this.applyStockObject(objectIndex);
        }
    }

    applyGdiObject(obj) {
        if (obj.type === 'pen') {
            this.ctx.strokeStyle = obj.color;
            this.ctx.lineWidth = obj.width || 1;
            this.strokeColor = obj.color;
        } else if (obj.type === 'brush') {
            this.ctx.fillStyle = obj.color;
            this.fillColor = obj.color;
        }
    }

    applyStockObject(stockIndex) {
        const color = this.gdiObjectManager.getStockObject(stockIndex);
        if (color) {
            this.ctx.fillStyle = color;
            this.fillColor = color;
        }
    }

    processDeleteObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        console.log('DeleteObject:', objectIndex);
        this.gdiObjectManager.deleteObject(objectIndex);
    }

    processMoveTo(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('MoveTo:', x, y, '->', transformed.x, transformed.y);
        this.ctx.moveTo(transformed.x, transformed.y);
    }

    processLineTo(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('LineTo:', x, y, '->', transformed.x, transformed.y);
        this.ctx.lineTo(transformed.x, transformed.y);
        this.ctx.stroke();
    }

    processRectangle(data) {
        if (data.length < 8) return;
        const bottom = this.readWordFromData(data, 0);
        const right = this.readWordFromData(data, 2);
        const top = this.readWordFromData(data, 4);
        const left = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('Rectangle:', left, top, right, bottom);
        this.ctx.fillRect(transformedLeftTop.x, transformedLeftTop.y, 
            transformedRightBottom.x - transformedLeftTop.x, 
            transformedRightBottom.y - transformedLeftTop.y);
        this.ctx.strokeRect(transformedLeftTop.x, transformedLeftTop.y, 
            transformedRightBottom.x - transformedLeftTop.x, 
            transformedRightBottom.y - transformedLeftTop.y);
    }

    processPolyline(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        console.log('Polyline, numPoints:', numPoints);
        
        if (data.length < 2 + numPoints * 4) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const x = this.readWordFromData(data, 2 + i * 4);
            const y = this.readWordFromData(data, 4 + i * 4);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            if (i === 0) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
        }
        this.ctx.stroke();
    }

    processPolygon(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        console.log('Polygon, numPoints:', numPoints);
        
        if (data.length < 2 + numPoints * 4) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const x = this.readWordFromData(data, 2 + i * 4);
            const y = this.readWordFromData(data, 4 + i * 4);
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

    processPolyPolygon(data) {
        if (data.length < 2) return;
        const numPolygons = this.readWordFromData(data, 0);
        console.log('PolyPolygon, numPolygons:', numPolygons);
        
        if (data.length < 2 + numPolygons * 2) return;
        
        // 读取每个多边形的点数
        const pointCounts = [];
        let offset = 2;
        for (let i = 0; i < numPolygons; i++) {
            pointCounts.push(this.readWordFromData(data, offset));
            offset += 2;
        }
        
        // 绘制每个多边形
        for (let i = 0; i < numPolygons; i++) {
            const numPoints = pointCounts[i];
            console.log(`  Polygon ${i}: ${numPoints} points`);
            
            if (offset + numPoints * 4 > data.length) break;
            
            this.ctx.beginPath();
            for (let j = 0; j < numPoints; j++) {
                const x = this.readWordFromData(data, offset);
                const y = this.readWordFromData(data, offset + 2);
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                
                if (j === 0) {
                    this.ctx.moveTo(transformed.x, transformed.y);
                } else {
                    this.ctx.lineTo(transformed.x, transformed.y);
                }
                offset += 4;
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    processTextOut(data) {
        if (data.length < 2) return;
        const textLength = this.readWordFromData(data, 0);
        if (data.length < 2 + textLength + 4) return;
        
        const text = this.readStringFromData(data, 2, textLength);
        const y = this.readWordFromData(data, 2 + textLength);
        const x = this.readWordFromData(data, 4 + textLength);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('TextOut:', text, 'at', x, y, '->', transformed.x, transformed.y);
        this.ctx.fillText(text, transformed.x, transformed.y);
    }

    processSaveDC(data) {
        console.log('SaveDC');
        this.ctx.save();
    }

    processRestoreDC(data) {
        console.log('RestoreDC');
        this.ctx.restore();
    }
}

module.exports = WmfDrawer;