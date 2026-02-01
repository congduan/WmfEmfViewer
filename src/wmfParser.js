// WMF/EMF解析器和绘制器 - 单文件版本，兼容浏览器环境

// 文件类型检测模块
class FileTypeDetector {
    constructor(data) {
        this.data = new Uint8Array(data);
    }

    detect() {
        // 检查文件类型
        if (this.data.length < 4) return 'unknown';
        
        // 检查Placeable WMF标识: D7 CD C6 9A (placeable WMF signature)
        if (this.data[0] === 0xD7 && this.data[1] === 0xCD && 
            this.data[2] === 0xC6 && this.data[3] === 0x9A) {
            return 'placeable-wmf';
        }
        
        // 检查标准WMF标识: 0x00090001 或 0x00090000
        const signature = this.readDwordAt(0);
        if (signature === 0x00090001 || signature === 0x00090000) {
            return 'wmf';
        }
        
        // 检查EMF标识 (需要更长头)
        if (this.data.length >= 88) {
            // EMF文件头在offset 40处有dSignature字段，值为0x464D4520 (" EMF")
            const dSignature = this.readDwordAt(40);
            if (dSignature === 0x464D4520) { // " EMF"
                return 'emf';
            }
        }
        
        return 'unknown';
    }

    readDwordAt(offset) {
        if (offset + 4 > this.data.length) {
            return 0;
        }
        const value = (this.data[offset] & 0xFF) | 
                     ((this.data[offset + 1] & 0xFF) << 8) | 
                     ((this.data[offset + 2] & 0xFF) << 16) | 
                     ((this.data[offset + 3] & 0xFF) << 24);
        return value >>> 0;
    }
}

// 记录解析模块
class RecordParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.offset = 0;
    }

    // 重置解析器状态
    reset() {
        this.offset = 0;
    }

    // 设置当前偏移量
    setOffset(offset) {
        this.offset = offset;
    }

    // 获取当前偏移量
    getOffset() {
        return this.offset;
    }

    // 读取WORD值
    readWord() {
        if (this.offset + 2 > this.data.length) {
            return 0;
        }
        const value = (this.data[this.offset] & 0xFF) | ((this.data[this.offset + 1] & 0xFF) << 8);
        this.offset += 2;
        return value >>> 0;
    }

    // 读取DWORD值
    readDword() {
        if (this.offset + 4 > this.data.length) {
            return 0;
        }
        const value = (this.data[this.offset] & 0xFF) | 
                     ((this.data[this.offset + 1] & 0xFF) << 8) | 
                     ((this.data[this.offset + 2] & 0xFF) << 16) | 
                     ((this.data[this.offset + 3] & 0xFF) << 24);
        this.offset += 4;
        return value >>> 0;
    }

    // 读取指定长度的字节
    readBytes(length) {
        if (this.offset + length > this.data.length) {
            length = this.data.length - this.offset;
        }
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    // 读取WORD值（从指定偏移量）
    readWordAt(offset) {
        if (offset + 2 > this.data.length) return 0;
        return ((this.data[offset] & 0xFF) | ((this.data[offset + 1] & 0xFF) << 8)) >>> 0;
    }

    // 读取DWORD值（从指定偏移量）
    readDwordAt(offset) {
        if (offset + 4 > this.data.length) return 0;
        return ((this.data[offset] & 0xFF) | 
               ((this.data[offset + 1] & 0xFF) << 8) | 
               ((this.data[offset + 2] & 0xFF) << 16) | 
               ((this.data[offset + 3] & 0xFF) << 24)) >>> 0;
    }

    // 解析WMF记录
    parseWmfRecord() {
        const sizeInWords = this.readDword();
        const functionId = this.readWord();

        if (sizeInWords === 0) {
            return null;
        }

        const dataSize = (sizeInWords - 3) * 2;
        const recordData = this.readBytes(dataSize);

        return {
            size: sizeInWords,
            functionId,
            data: recordData
        };
    }

    // 解析EMF记录
    parseEmfRecord() {
        if (this.offset + 8 > this.data.length) {
            return null;
        }

        const type = this.readDword();
        const size = this.readDword();

        if (size < 8 || this.offset + size - 8 > this.data.length) {
            return null;
        }

        const recordData = this.readBytes(size - 8);

        return {
            type,
            size,
            data: recordData
        };
    }

    // 解析WMF文件头
    parseWmfHeader() {
        const header = {
            type: this.readWord(),
            headerSize: this.readWord(),
            version: this.readWord(),
            size: this.readDword(),
            numObjects: this.readWord(),
            maxRecord: this.readDword(),
            reserved: this.readWord()
        };

        // 验证headerSize字段（标准WMF应该是9 WORDs = 18字节）
        const expectedHeaderSize = 9;
        if (header.headerSize !== expectedHeaderSize) {
            const bytesToSkip = (header.headerSize * 2) - (this.offset - (this.offset - 18));
            this.offset += bytesToSkip;
        }

        return header;
    }

    // 解析Placeable WMF文件头
    parsePlaceableHeader() {
        this.offset = 0;
        const placeableHeader = {
            key: this.readDword(),
            handle: this.readWord(),
            left: this.readWord(),
            top: this.readWord(),
            right: this.readWord(),
            bottom: this.readWord(),
            inch: this.readWord(),
            reserved: this.readDword(),
            checksum: this.readWord()
        };

        return placeableHeader;
    }

    // 解析EMF文件头
    parseEmfHeader() {
        this.offset = 0;
        
        // 读取iType
        const iType = this.readDword();
        
        // 读取nSize
        const nSize = this.readDword();
        
        // 读取bounds (16字节)
        const bounds = {
            left: this.readDword(),
            top: this.readDword(),
            right: this.readDword(),
            bottom: this.readDword()
        };
        
        // 读取frame (16字节)
        const frame = {
            left: this.readDword(),
            top: this.readDword(),
            right: this.readDword(),
            bottom: this.readDword()
        };
        
        // 验证EMF签名 (在offset 40)
        const dSignature = this.readDword();
        
        // 检查EMF签名
        if (dSignature !== 0x464D4520) {
            return null;
        }
        
        // 解析EMF头部（小端字节序，EMF标准规定）
        const header = {
            iType: this.readDword(),
            nSize: this.readDword(),
            bounds: {
                left: this.readDword(),
                top: this.readDword(),
                right: this.readDword(),
                bottom: this.readDword()
            },
            frame: {
                left: this.readDword(),
                top: this.readDword(),
                right: this.readDword(),
                bottom: this.readDword()
            },
            dSignature: this.readDword(),
            nVersion: this.readDword(),
            nBytes: this.readDword(),
            nRecords: this.readDword(),
            nHandles: this.readWord(),
            sReserved: this.readWord(),
            nDescription: this.readDword(),
            offDescription: this.readDword(),
            nPalEntries: this.readDword(),
            szlDevice: {
                cx: this.readDword(),
                cy: this.readDword()
            },
            szlMillimeters: {
                cx: this.readDword(),
                cy: this.readDword()
            }
        };
        
        // 验证EMF头
        if (header.dSignature !== 0x464D4520) {
            return null;
        }
        
        if (header.iType !== 1) {
            return null;
        }
        
        // 确保边界值合理
        if (header.bounds.right < header.bounds.left) {
            [header.bounds.left, header.bounds.right] = [header.bounds.right, header.bounds.left];
        }
        if (header.bounds.bottom < header.bounds.top) {
            [header.bounds.top, header.bounds.bottom] = [header.bounds.bottom, header.bounds.top];
        }
        
        return header;
    }
}

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

// GDI 对象管理模块
class GdiObjectManager {
    constructor() {
        this.gdiObjects = new Map(); // GDI对象表
        this.objectHandles = []; // 对象句柄列表
        this.nextHandle = 0; // 下一个可用的句柄
    }

    createPen(style, width, color) {
        this.nextHandle++;
        this.objectHandles.push(this.nextHandle);

        const penObj = {
            type: 'pen',
            style,
            width,
            color
        };
        this.gdiObjects.set(this.nextHandle, penObj);
        return this.nextHandle;
    }

    createBrush(style, color) {
        this.nextHandle++;
        this.objectHandles.push(this.nextHandle);

        const brushObj = {
            type: 'brush',
            style,
            color
        };
        this.gdiObjects.set(this.nextHandle, brushObj);
        return this.nextHandle;
    }

    selectObject(handle) {
        return this.gdiObjects.get(handle);
    }

    deleteObject(handle) {
        this.gdiObjects.delete(handle);
        const index = this.objectHandles.indexOf(handle);
        if (index > -1) {
            this.objectHandles.splice(index, 1);
        }
    }

    getStockObject(stockIndex) {
        const stockColors = {
            0x80000005: '#ffffff', // NULL_BRUSH
            0x80000004: '#000000', // BLACK_BRUSH
            0x80000003: '#808080', // DKGRAY_BRUSH
            0x80000002: '#c0c0c0', // LTGRAY_BRUSH
            0x80000001: '#ffffff', // WHITE_BRUSH
            0x80000007: '#000000', // BLACK_PEN
            0x80000006: '#ffffff', // WHITE_PEN
            0x80000008: 'transparent'  // NULL_PEN
        };

        return stockColors[stockIndex];
    }

    clear() {
        this.gdiObjects.clear();
        this.objectHandles = [];
        this.nextHandle = 0;
    }
}

// 绘制模块
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
        console.log('Drawing metafile with header:', metafileData.header);
        console.log('Number of records:', metafileData.records.length);

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
        this.ctx.lineWidth = 2; // 增加线宽使图形更清晰
        this.fillColor = '#ffffff';
        this.strokeColor = '#000000';
        console.log('Drawing styles set');

        // 重置路径状态
        this.currentPath = [];
        this.pathState = 'idle';

        // 处理每个记录
        for (let i = 0; i < metafileData.records.length; i++) {
            const record = metafileData.records[i];
            console.log('Processing record', i, ':', record.type || record.functionId, '(0x' + (record.type || record.functionId).toString(16).padStart(record.type ? 8 : 4, '0') + ')');
            
            // 根据记录类型处理
            if (record.type !== undefined) {
                // EMF记录
                this.processEmfRecordType(record.type, record.data);
            } else {
                // WMF记录
                this.processRecord(record);
            }
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('Metafile drawing completed');
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
            case 0x2B4E: // 11086 - 可能是EMF函数
                this.processEmfFunction(record.data);
                break;
            // 扩展WMF函数
            case 0x1D6C: // 可能是EMF+函数
                this.processEmfPlusFunction(record.data);
                break;
            default:
                console.log('Unknown WMF function:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
                // 尝试通用处理逻辑，解析为图形数据
                this.tryProcessAsCoordinates(record.data);
                break;
        }
    }

    // 辅助方法：从数据中读取WORD值
    readWordFromData(data, offset) {
        if (offset + 2 > data.length) return 0;
        return ((data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8)) >>> 0;
    }

    // 辅助方法：从数据中读取DWORD值
    readDwordFromData(data, offset) {
        if (offset + 4 > data.length) return 0;
        return ((data[offset] & 0xFF) | 
               ((data[offset + 1] & 0xFF) << 8) | 
               ((data[offset + 2] & 0xFF) << 16) | 
               ((data[offset + 3] & 0xFF) << 24)) >>> 0;
    }

    // 辅助方法：从数据中读取字符串
    readStringFromData(data, offset, length) {
        let str = '';
        for (let i = 0; i < length && offset + i < data.length; i++) {
            str += String.fromCharCode(data[offset + i]);
        }
        return str;
    }

    // 辅助方法：RGB颜色转换为十六进制
    rgbToHex(color) {
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    // 处理剩余的路径
    finishPath() {
        if (this.pathState === 'active' && this.currentPath.length > 0) {
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.pathState = 'completed';
        }
        this.currentPath = [];
        this.pathState = 'idle';
    }

    // 应用GDI对象
    applyGdiObject(obj) {
        if (obj.type === 'pen') {
            this.ctx.strokeStyle = obj.color;
            this.ctx.lineWidth = obj.width;
            this.strokeColor = obj.color;
            console.log('Applied pen:', obj.color, obj.width);
        } else if (obj.type === 'brush') {
            this.ctx.fillStyle = obj.color;
            this.fillColor = obj.color;
            console.log('Applied brush:', obj.color);
        } else if (obj.type === 'font') {
            console.log('Applied font:', obj.name, obj.height);
        }
    }

    // 应用Stock对象
    applyStockObject(stockIndex) {
        const color = this.gdiObjectManager.getStockObject(stockIndex);
        if (color && color !== 'transparent') {
            this.ctx.strokeStyle = color;
            this.ctx.fillStyle = color;
            this.strokeColor = color;
            this.fillColor = color;
            console.log('Applied stock object:', stockIndex.toString(16), color);
        }
    }

    // 以下是具体的记录处理方法
    processSetWindowOrg(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowOrg:', x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
    }

    processSetWindowExt(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowExt:', x, y);
        this.coordinateTransformer.setWindowExt(x, y);
    }

    processSetViewportOrg(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportOrg:', x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
    }

    processSetViewportExt(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportExt:', x, y);
        this.coordinateTransformer.setViewportExt(x, y);
    }

    processSetWindowOrgEx(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowOrgEx:', x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
    }

    processSetWindowExtEx(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowExtEx:', x, y);
        this.coordinateTransformer.setWindowExt(x, y);
    }

    processSetViewportOrgEx(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportOrgEx:', x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
    }

    processSetViewportExtEx(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportExtEx:', x, y);
        this.coordinateTransformer.setViewportExt(x, y);
    }

    processFillRect(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('FillRect:', x, y, width, height);
        this.ctx.fillRect(x, y, width, height);
    }

    processFrameRect(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('FrameRect:', x, y, width, height);
        this.ctx.strokeRect(x, y, width, height);
    }

    processInvertRect(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('InvertRect:', x, y, width, height);
        // 简单实现：填充灰色
        this.ctx.fillStyle = '#808080';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = this.fillColor;
    }

    processPaintRect(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('PaintRect:', x, y, width, height);
        this.ctx.fillRect(x, y, width, height);
    }

    processFillRgn(data) {
        console.log('FillRgn not fully implemented');
    }

    processFrameRgn(data) {
        console.log('FrameRgn not fully implemented');
    }

    processInvertRgn(data) {
        console.log('InvertRgn not fully implemented');
    }

    processPaintRgn(data) {
        console.log('PaintRgn not fully implemented');
    }

    processSetMapMode(data) {
        const mode = this.readWordFromData(data, 0);
        console.log('SetMapMode:', mode);
        this.coordinateTransformer.setMapMode(mode);
    }

    processEmfFunction(data) {
        console.log('EMF function detected, processing');
        console.log('EMF function data length:', data.length);
    }

    processEmfPlusFunction(data) {
        console.log('EMF+ function detected, processing');
        console.log('EMF+ function data length:', data.length);
    }

    processMoveTo(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.moveTo(transformed.x, transformed.y);
        console.log('MoveTo:', x, y, '->', transformed.x, transformed.y);
    }

    processLineTo(data) {
        if (data.length < 4) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.lineTo(transformed.x, transformed.y);
        this.ctx.stroke();
        console.log('LineTo:', x, y, '->', transformed.x, transformed.y);
    }

    processRectangle(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const width = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const height = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        console.log('Rectangle:', x, y, width, height);
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.stroke();
    }

    processRoundRect(data) {
        if (data.length < 12) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const width = this.readWordFromData(data, 8);
        const height = this.readWordFromData(data, 10);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        const rectWidth = Math.abs(transformedRightBottom.x - transformedLeftTop.x);
        const rectHeight = Math.abs(transformedRightBottom.y - transformedLeftTop.y);
        const x = Math.min(transformedLeftTop.x, transformedRightBottom.x);
        const y = Math.min(transformedLeftTop.y, transformedRightBottom.y);
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, rectWidth, rectHeight, [width, height]);
        this.ctx.stroke();
    }

    processEllipse(data) {
        if (data.length < 8) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
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

    processArc(data) {
        if (data.length < 16) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const startX = this.readWordFromData(data, 8);
        const startY = this.readWordFromData(data, 10);
        const endX = this.readWordFromData(data, 12);
        const endY = this.readWordFromData(data, 14);
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

    processPie(data) {
        if (data.length < 20) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const startX = this.readWordFromData(data, 8);
        const startY = this.readWordFromData(data, 10);
        const endX = this.readWordFromData(data, 12);
        const endY = this.readWordFromData(data, 14);
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

    processChord(data) {
        if (data.length < 20) return;
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        const startX = this.readWordFromData(data, 8);
        const startY = this.readWordFromData(data, 10);
        const endX = this.readWordFromData(data, 12);
        const endY = this.readWordFromData(data, 14);
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

    processPolyline(data) {
        console.log('Processing Polyline, data length:', data.length);
        const points = [];
        let offset = 0;
        while (offset + 4 <= data.length) {
            const x = this.readWordFromData(data, offset);
            const y = this.readWordFromData(data, offset + 2);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            points.push(transformed);
            offset += 4;
        }
        
        if (points.length >= 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
        }
    }

    processPolygon(data) {
        console.log('Processing Polygon, data length:', data.length);
        const points = [];
        let offset = 0;
        while (offset + 4 <= data.length) {
            const x = this.readWordFromData(data, offset);
            const y = this.readWordFromData(data, offset + 2);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            points.push(transformed);
            offset += 4;
        }
        
        if (points.length >= 3) {
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    processTextOut(data) {
        if (data.length < 6) return;
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        const textLength = this.readWordFromData(data, 4);
        const text = this.readStringFromData(data, 6, textLength);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('TextOut:', text, 'at', x, y, '->', transformed.x, transformed.y);
        this.ctx.fillText(text, transformed.x, transformed.y);
    }

    processGetTextExtent(data) {
        if (data.length < 8) return;
        const textLength = this.readWordFromData(data, 0);
        const text = this.readStringFromData(data, 2, textLength);
        console.log('GetTextExtent:', text);
    }

    processCreatePenIndirect(data) {
        if (data.length < 12) return;
        const style = this.readWordFromData(data, 0);
        const width = this.readWordFromData(data, 2);
        const color = this.readDwordFromData(data, 4);
        console.log('CreatePenIndirect:', style, width, color);

        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createPen(style, width, penColor);
    }

    processCreateBrushIndirect(data) {
        if (data.length < 16) return;
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

    processDeleteObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        console.log('DeleteObject:', objectIndex);
        this.gdiObjectManager.deleteObject(objectIndex);
    }

    processEscape(data) {
        if (data.length < 2) return;
        const escapeFunction = this.readWordFromData(data, 0);
        console.log('META_ESCAPE function:', escapeFunction, '(0x' + escapeFunction.toString(16) + ')');

        if (escapeFunction === 0x000F) {
            console.log('META_ESCAPE_ENHANCED_METAFILE detected, parsing embedded EMF...');
            this.parseEmbeddedEmf(data.slice(2));
        }
    }

    parseEmbeddedEmf(data) {
        console.log('Parsing embedded EMF data, length:', data.length);

        if (data.length < 88) {
            console.log('EMF data too short');
            return;
        }

        const dSignature = this.readDwordFromData(data, 40);
        if (dSignature !== 0x464D4520) {
            console.log('Invalid EMF signature, expected 0x464D4520, got 0x' + dSignature.toString(16));
            return;
        }

        const header = {
            iType: this.readDwordFromData(data, 0),
            nSize: this.readDwordFromData(data, 4),
            bounds: {
                left: this.readDwordFromData(data, 8),
                top: this.readDwordFromData(data, 12),
                right: this.readDwordFromData(data, 16),
                bottom: this.readDwordFromData(data, 20)
            },
            frame: {
                left: this.readDwordFromData(data, 24),
                top: this.readDwordFromData(data, 28),
                right: this.readDwordFromData(data, 32),
                bottom: this.readDwordFromData(data, 36)
            },
            dSignature: dSignature,
            nVersion: this.readDwordFromData(data, 44),
            nBytes: this.readDwordFromData(data, 48),
            nRecords: this.readDwordFromData(data, 52),
            nHandles: this.readWordFromData(data, 56),
            sReserved: this.readWordFromData(data, 58),
            nDescription: this.readDwordFromData(data, 60),
            offDescription: this.readDwordFromData(data, 64),
            nPalEntries: this.readDwordFromData(data, 68),
            szlDevice: {
                cx: this.readDwordFromData(data, 72),
                cy: this.readDwordFromData(data, 76)
            },
            szlMillimeters: {
                cx: this.readDwordFromData(data, 80),
                cy: this.readDwordFromData(data, 84)
            }
        };

        console.log('Embedded EMF Header:', header);

        let offset = header.nSize;
        let recordCount = 0;

        while (offset < data.length && recordCount < header.nRecords) {
            const type = this.readDwordFromData(data, offset);
            const size = this.readDwordFromData(data, offset + 4);

            if (size < 8 || offset + size > data.length) {
                console.log('Invalid EMF record at offset', offset);
                break;
            }

            const recordData = data.slice(offset + 8, offset + size);
            console.log('Embedded EMF record:', type, '(0x' + type.toString(16).padStart(8, '0') + ')');

            this.processEmfRecordType(type, recordData);

            offset += size;
            recordCount++;
        }

        console.log('Parsed', recordCount, 'embedded EMF records');
    }

    processSetTextJustification(data) {
        if (data.length < 4) return;
        const extraSpace = this.readWordFromData(data, 0);
        const breakCount = this.readWordFromData(data, 2);
        console.log('SetTextJustification:', extraSpace, breakCount);
    }

    processSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.strokeColor = this.rgbToHex(color);
        this.ctx.strokeStyle = this.strokeColor;
        console.log('SetTextColor:', color, '->', this.strokeColor);
    }

    processSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        this.fillColor = this.rgbToHex(color);
        this.ctx.fillStyle = this.fillColor;
        console.log('SetBkColor:', color, '->', this.fillColor);
    }

    processSetBkMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetBkMode:', mode);
    }

    processSetROP2(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetROP2:', mode);
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

    processSetTextStretch(data) {
        if (data.length < 2) return;
        const stretch = this.readWordFromData(data, 0);
        console.log('SetTextStretch:', stretch);
    }

    processEmfHeader(data) {
        console.log('Processing EMF header');
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
        const left = this.readDwordFromData(data, 0);
        const top = this.readDwordFromData(data, 4);
        const right = this.readDwordFromData(data, 8);
        const bottom = this.readDwordFromData(data, 12);
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

    processEmfText(data) {
        if (data.length < 20) return;
        const x = this.readDwordFromData(data, 0);
        const y = this.readDwordFromData(data, 4);
        const flags = this.readDwordFromData(data, 8);
        const breakExtra = this.readDwordFromData(data, 12);
        const breakCount = this.readDwordFromData(data, 16);
        
        // 简化处理，只输出文本位置
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.fillText('Text', transformed.x, transformed.y);
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
}

// 元文件解析器模块 - 整合所有模块化组件
class MetafileParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector(data);
        this.recordParser = new RecordParser(data);
        this.fileType = this.fileTypeDetector.detect();
        console.log('Metafile Parser initialized with data length:', data.length, 'type:', this.fileType);
    }

    parse() {
        console.log('Starting', this.fileType.toUpperCase(), 'parsing...');

        try {
            if (this.fileType === 'emf') {
                const emfResult = this.parseEmf();
                if (emfResult && emfResult.records.length > 0) {
                    return emfResult;
                } else {
                    console.log('EMF parsing failed, trying WMF parsing...');
                    this.recordParser.reset();
                    return this.parseWmf();
                }
            } else if (this.fileType === 'wmf' || this.fileType === 'placeable-wmf') {
                return this.parseWmf();
            } else {
                console.log('Unknown file type, trying both methods...');
                this.recordParser.reset();
                const emfResult = this.tryParseEmf();
                if (emfResult && emfResult.records.length > 0) {
                    return emfResult;
                }
                this.recordParser.reset();
                return this.parseWmf();
            }
        } catch (error) {
            console.error('Parsing error:', error.message);
            try {
                this.recordParser.reset();
                return this.parseWmf();
            } catch (wmfError) {
                return {
                    header: null,
                    records: [],
                    error: error.message
                };
            }
        }
    }

    parseEmf() {
        try {
            // 解析EMF文件头
            const header = this.recordParser.parseEmfHeader();
            
            // 验证头信息
            if (!header || header.nSize <= 0) {
                throw new Error('Invalid EMF header');
            }

            // 跳过EMF文件头
            this.recordParser.setOffset(header.nSize);

            // 解析EMF记录
            const records = [];
            let recordCount = 0;
            
            while (this.recordParser.getOffset() < this.data.length && recordCount < header.nRecords) {
                try {
                    const record = this.recordParser.parseEmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed EMF record:', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
                        recordCount++;
                    } else {
                        console.warn('Failed to parse EMF record at offset:', this.recordParser.getOffset());
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing EMF record:', error.message);
                    // 跳过错误记录，继续解析下一条
                    this.recordParser.setOffset(this.recordParser.getOffset() + 8); // 至少跳过记录头
                }
            }

            console.log('Total EMF records parsed:', records.length);
            return { header, records };
        } catch (error) {
            console.error('EMF parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    parseWmf() {
        try {
            console.log('Starting WMF parsing...');
            // 解析placeable WMF文件头（如果存在）
            let placeableHeader = null;
            if (this.fileType === 'placeable-wmf') {
                placeableHeader = this.recordParser.parsePlaceableHeader();
                console.log('Placeable WMF Header:', placeableHeader);
            }

            // 解析标准WMF文件头（从当前offset开始）
            const startOffset = this.recordParser.getOffset();
            const header = this.recordParser.parseWmfHeader();
            console.log('WMF Header:', header);

            // 验证头信息
            if (!header || header.headerSize <= 0) {
                throw new Error('Invalid WMF header');
            }

            // 跳到第一个记录位置（WMF头部 + headerSize指定了头部区域）
            // 对于placeable WMF，可能存在额外对齐字节
            const targetOffset = startOffset + header.headerSize * 2;
            if (this.recordParser.getOffset() < targetOffset) {
                console.log('Skipping extra bytes from', this.recordParser.getOffset(), 'to', targetOffset);
                this.recordParser.setOffset(targetOffset);
            }

            // 解析WMF记录
            const records = [];
            console.log('Starting WMF record parsing from offset:', this.recordParser.getOffset(), 'total length:', this.data.length);
            let iterationCount = 0;
            while (this.recordParser.getOffset() < this.data.length && iterationCount < 1000) {
                iterationCount++;
                try {
                    const record = this.recordParser.parseWmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed WMF record:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')', 'new offset:', this.recordParser.getOffset());
                    } else {
                        console.log('No valid record at offset:', this.recordParser.getOffset(), 'stopping');
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing WMF record at offset', this.recordParser.getOffset(), ':', error.message);
                    this.recordParser.setOffset(this.recordParser.getOffset() + 2);
                }
            }
            console.log('Ended at offset:', this.recordParser.getOffset(), 'parsed', records.length, 'records');

            console.log('Total WMF records parsed:', records.length);
            return { header: { ...header, placeableHeader }, records };
        } catch (error) {
            console.error('WMF parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    tryParseEmf() {
        try {
            // 尝试解析为EMF
            const emfHeader = this.recordParser.parseEmfHeader();
            if (emfHeader && emfHeader.nSize > 0 && emfHeader.nRecords > 0) {
                // 成功解析EMF头，继续解析记录
                return this.parseEmf();
            }
        } catch (error) {
            console.log('EMF parsing failed:', error.message);
        }
        return null;
    }
}

// 浏览器环境支持
if (typeof window !== 'undefined') {
    window.FileTypeDetector = FileTypeDetector;
    window.RecordParser = RecordParser;
    window.CoordinateTransformer = CoordinateTransformer;
    window.GdiObjectManager = GdiObjectManager;
    window.WmfDrawer = WmfDrawer;
    window.MetafileParser = MetafileParser;
} else if (typeof module !== 'undefined' && module.exports) {
    // Node.js环境支持
    module.exports = {
        FileTypeDetector,
        RecordParser,
        CoordinateTransformer,
        GdiObjectManager,
        WmfDrawer,
        MetafileParser
    };
}
