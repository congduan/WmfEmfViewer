// WMF/EMF/EMF+解析器和绘制器 - 浏览器兼容版本
// 自动生成的打包文件，包含所有模块化组件

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
        
        // 检查EMF/EMF+标识 (需要更长头)
        if (this.data.length >= 88) {
            // EMF文件头在offset 40处有dSignature字段，值为0x464D4520 (" EMF")
            const dSignature = this.readDwordAt(40);
            if (dSignature === 0x464D4520) { // " EMF"
                // 检查是否是EMF+文件
                if (this.isEmfPlusFile()) {
                    return 'emf+';
                } else {
                    return 'emf';
                }
            }
        }
        
        return 'unknown';
    }

    // 检查是否是EMF+文件
    isEmfPlusFile() {
        try {
            // 首先解析EMF头，获取头大小
            if (this.data.length < 88) return false;
            
            // 读取EMF头大小（在offset 4处）
            const headerSize = this.readDwordAt(4);
            
            // 跳过EMF头，检查第一个记录是否是EMF+记录
            const firstRecordOffset = headerSize;
            if (firstRecordOffset + 12 > this.data.length) return false;
            
            // 读取第一个记录的类型
            const recordType = this.readDwordAt(firstRecordOffset);
            
            // EMF+记录类型范围通常从0x4001开始
            return recordType >= 0x4001 && recordType <= 0x4044;
        } catch (error) {
            return false;
        }
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

        // WMF/EMF坐标系与Canvas一致（Y轴向下），无需翻转
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
        // WMF对象句柄是0基索引，使用对象表来管理
        this.objectTable = [];
    }

    createPen(style, width, color) {
        return this.createObject({
            type: 'pen',
            style,
            width,
            color
        });
    }

    createBrush(style, color) {
        return this.createObject({
            type: 'brush',
            style,
            color
        });
    }

    createObject(obj) {
        const index = this.objectTable.findIndex(item => item == null);
        if (index === -1) {
            this.objectTable.push(obj);
            return this.objectTable.length - 1;
        }
        this.objectTable[index] = obj;
        return index;
    }

    selectObject(handle) {
        return this.objectTable[handle];
    }

    deleteObject(handle) {
        if (handle >= 0 && handle < this.objectTable.length) {
            this.objectTable[handle] = null;
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
        this.objectTable = [];
    }
}



// 基础解析器类 - 提供共享的字节读取方法
class BaseParser {
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

    // 读取BYTE值
    readByte() {
        if (this.offset >= this.data.length) {
            return 0;
        }
        const value = this.data[this.offset];
        this.offset += 1;
        return value & 0xFF;
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

    // 读取DWORD值（无符号32位）
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

    // 读取LONG值（有符号32位）
    readLong() {
        if (this.offset + 4 > this.data.length) {
            return 0;
        }
        const value = (this.data[this.offset] & 0xFF) | 
                     ((this.data[this.offset + 1] & 0xFF) << 8) | 
                     ((this.data[this.offset + 2] & 0xFF) << 16) | 
                     ((this.data[this.offset + 3] & 0xFF) << 24);
        this.offset += 4;
        return value | 0; // 转换为有符号整数
    }

    // 读取SHORT值（有符号16位）
    readShort() {
        if (this.offset + 2 > this.data.length) {
            return 0;
        }
        const value = (this.data[this.offset] & 0xFF) | ((this.data[this.offset + 1] & 0xFF) << 8);
        this.offset += 2;
        // 转换为有符号16位整数
        return value > 0x7FFF ? value - 0x10000 : value;
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

    // 读取DWORD值（从指定偏移量，不改变当前偏移）
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

    // 读取WORD值（从指定偏移量，不改变当前偏移）
    readWordAt(offset) {
        if (offset + 2 > this.data.length) {
            return 0;
        }
        return ((this.data[offset] & 0xFF) | ((this.data[offset + 1] & 0xFF) << 8)) >>> 0;
    }
}



// WMF解析器模块

class WmfParser extends BaseParser {
    constructor(data) {
        super(data);
    }

    // 解析Placeable WMF文件头
    // 根据MS-WMF规范 2.3.2.1 META_PLACEABLE Record
    parsePlaceableHeader() {
        this.offset = 0;
        const placeableHeader = {
            key: this.readDword(),           // 0x9AC6CDD7
            handle: this.readWord(),         // 必须为0
            left: this.readShort(),          // 有符号16位整数
            top: this.readShort(),           // 有符号16位整数
            right: this.readShort(),         // 有符号16位整数
            bottom: this.readShort(),        // 有符号16位整数
            inch: this.readWord(),           // 逻辑单位数/英寸
            reserved: this.readDword(),      // 必须为0
            checksum: this.readWord()        // 校验和
        };

        // 验证Placeable WMF签名
        if (placeableHeader.key !== 0x9AC6CDD7) {
            console.warn('Invalid Placeable WMF key:', placeableHeader.key.toString(16));
        }

        return placeableHeader;
    }

    // 解析WMF文件头
    // 根据MS-WMF规范 2.3.2.2 META_HEADER Object
    parseWmfHeader() {
        const header = {
            type: this.readWord(),          // 文件类型: 1=内存, 2=磁盘
            headerSize: this.readWord(),    // 头部大小(WORDs): 固定为9
            version: this.readWord(),       // WMF版本
            size: this.readDword(),         // 文件大小(WORDs)
            numObjects: this.readWord(),    // 对象数量
            maxRecord: this.readDword(),    // 最大记录大小(WORDs)
            reserved: this.readWord()       // 保留字段，必须为0
        };

        // 验证headerSize字段（标准WMF头应该是9 WORDs = 18字节）
        const expectedHeaderSize = 9;
        if (header.headerSize !== expectedHeaderSize) {
            console.warn('Non-standard WMF header size:', header.headerSize, 'expected:', expectedHeaderSize);
        }

        return header;
    }

    // 解析WMF记录
    // 根据MS-WMF规范 2.3.1 WMF Records
    // 每条记录格式: Size(DWORD) + Function(WORD) + Parameters
    parseWmfRecord() {
        if (this.offset + 6 > this.data.length) {
            return null;
        }

        const recordStart = this.offset;
        const sizeInWords = this.readDword();  // 记录大小（WORDs）包括自身
        const functionId = this.readWord();    // 记录函数ID

        // 记录大小必须至少为3个WORD（6字节）
        if (sizeInWords < 3) {
            console.warn('Invalid WMF record size:', sizeInWords, 'at offset:', recordStart);
            return null;
        }

        // 计算参数数据大小: (总大小 - Size字段2WORDs - Function字段1WORD) * 2字节
        const dataSize = (sizeInWords - 3) * 2;
        
        // 检查数据是否超出文件范围
        if (this.offset + dataSize > this.data.length) {
            console.warn('WMF record data exceeds file length at offset:', recordStart);
            return null;
        }

        const recordData = this.readBytes(dataSize);

        return {
            size: sizeInWords,
            functionId,
            data: recordData
        };
    }

    // 解析完整的WMF文件
    parse(fileType) {
        try {
            console.log('Starting WMF parsing...');
            // 解析placeable WMF文件头（如果存在）
            let placeableHeader = null;
            if (fileType === 'placeable-wmf') {
                placeableHeader = this.parsePlaceableHeader();
                console.log('Placeable WMF Header:', placeableHeader);
            }

            // 解析标准WMF文件头（从当前offset开始）
            const startOffset = this.getOffset();
            const header = this.parseWmfHeader();
            console.log('WMF Header:', header);

            // 验证头信息
            if (!header || header.headerSize <= 0) {
                throw new Error('Invalid WMF header');
            }

            // 跳到第一个记录位置
            const targetOffset = startOffset + header.headerSize * 2;
            if (this.getOffset() < targetOffset) {
                console.log('Skipping extra bytes from', this.getOffset(), 'to', targetOffset);
                this.setOffset(targetOffset);
            }

            // 解析WMF记录
            const records = [];
            console.log('Starting WMF record parsing from offset:', this.getOffset(), 'total length:', this.data.length);
            let iterationCount = 0;
            while (this.getOffset() < this.data.length && iterationCount < 1000) {
                iterationCount++;
                try {
                    const record = this.parseWmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed WMF record:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')', 'new offset:', this.getOffset());
                    } else {
                        console.log('No valid record at offset:', this.getOffset(), 'stopping');
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing WMF record at offset', this.getOffset(), ':', error.message);
                    this.setOffset(this.getOffset() + 2);
                }
            }
            console.log('Ended at offset:', this.getOffset(), 'parsed', records.length, 'records');

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
}



// EMF解析器模块

class EmfParser extends BaseParser {
    constructor(data) {
        super(data);
    }

    // 解析EMF文件头
    // 根据MS-EMF规范 2.3.4.2 EMR_HEADER Record
    parseEmfHeader() {
        this.offset = 0;
        
        // EMR_HEADER 最小为88字节，扩展版本可能更大
        if (this.data.length < 88) {
            console.error('File too small to be valid EMF');
            return null;
        }
        
        const header = {
            // EMR 基础记录头 (8字节)
            iType: this.readDword(),         // 记录类型，必须为0x00000001 (EMR_HEADER)
            nSize: this.readDword(),         // 记录大小(字节)
            
            // RECTL Bounds (16字节) - 设备单位边界
            bounds: {
                left: this.readLong(),       // 有符号32位
                top: this.readLong(),
                right: this.readLong(),
                bottom: this.readLong()
            },
            
            // RECTL Frame (16字节) - 0.01毫米单位边界
            frame: {
                left: this.readLong(),
                top: this.readLong(),
                right: this.readLong(),
                bottom: this.readLong()
            },
            
            // EMF签名和版本信息
            dSignature: this.readDword(),     // 必须为0x464D4520 (" EMF")
            nVersion: this.readDword(),       // 版本号，通常为0x00010000
            nBytes: this.readDword(),         // 文件总字节数
            nRecords: this.readDword(),       // 元文件中记录总数
            nHandles: this.readWord(),        // 句柄表中的句柄数
            sReserved: this.readWord(),       // 保留，必须为0
            nDescription: this.readDword(),   // 描述字符串长度(字符数)
            offDescription: this.readDword(), // 描述字符串偏移量
            nPalEntries: this.readDword(),    // 调色板条目数
            
            // 参考设备尺寸（像素）
            szlDevice: {
                cx: this.readLong(),
                cy: this.readLong()
            },
            
            // 参考设备尺寸（毫米）
            szlMillimeters: {
                cx: this.readLong(),
                cy: this.readLong()
            }
        };
        
        // 验证EMF签名
        if (header.dSignature !== 0x464D4520) {
            console.error('Invalid EMF signature:', header.dSignature.toString(16), 'expected: 464d4520');
            return null;
        }
        
        // 验证记录类型
        if (header.iType !== 0x00000001) {
            console.error('Invalid EMR_HEADER type:', header.iType, 'expected: 1');
            return null;
        }
        
        // 验证记录大小
        if (header.nSize < 88) {
            console.error('Invalid EMR_HEADER size:', header.nSize, 'expected: >= 88');
            return null;
        }
        
        console.log('EMF Header validated successfully');
        console.log('  Version:', header.nVersion.toString(16));
        console.log('  Total bytes:', header.nBytes);
        console.log('  Total records:', header.nRecords);
        console.log('  Bounds:', header.bounds);
        console.log('  Device size:', header.szlDevice);
        
        return header;
    }

    // 解析EMF记录
    // 根据MS-EMF规范 2.3.1 EMF Records
    // 每条记录格式: Type(DWORD) + Size(DWORD) + Parameters
    parseEmfRecord() {
        if (this.offset + 8 > this.data.length) {
            return null;
        }

        const recordStart = this.offset;
        const type = this.readDword();   // 记录类型
        const size = this.readDword();   // 记录大小（字节），包括Type和Size字段

        // 记录大小必须至少为8字节
        if (size < 8) {
            console.warn('Invalid EMF record size:', size, 'at offset:', recordStart);
            return null;
        }

        // 检查是否超出文件边界
        if (this.offset + size - 8 > this.data.length) {
            console.warn('EMF record exceeds file length at offset:', recordStart);
            return null;
        }

        // 读取参数数据
        const recordData = this.readBytes(size - 8);

        return {
            type,
            size,
            data: recordData
        };
    }

    // 解析完整的EMF文件
    parse() {
        try {
            // 解析EMF文件头
            const header = this.parseEmfHeader();
            
            // 验证头信息
            if (!header || header.nSize <= 0) {
                throw new Error('Invalid EMF header');
            }

            // 跳过EMF文件头
            this.setOffset(header.nSize);

            // 解析EMF记录
            const records = [];
            let recordCount = 0;
            
            while (this.getOffset() < this.data.length && recordCount < header.nRecords) {
                try {
                    const record = this.parseEmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed EMF record:', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
                        recordCount++;
                    } else {
                        console.warn('Failed to parse EMF record at offset:', this.getOffset());
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing EMF record:', error.message);
                    // 跳过错误记录，继续解析下一条
                    this.setOffset(this.getOffset() + 8);
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
}



// EMF+解析器模块

class EmfPlusParser extends BaseParser {
    constructor(data) {
        super(data);
    }

    // 解析EMF+记录
    // 根据MS-EMFPLUS规范 2.3.1 EMF+ Records
    // EMF+记录嵌入在EMF记录中，通过EMR_COMMENT_EMFPLUS记录(类型0x00000046)传递
    parseEmfPlusRecord(emfRecordData) {
        let offset = 0;
        
        // EMF+ Comment记录数据结构:
        // DataSize (DWORD) - 实际EMF+数据大小
        // CommentIdentifier (DWORD) - 必须为0x2B464D45 ("EMF+")
        // EMF+记录数据
        
        if (emfRecordData.length < 8) {
            return null;
        }
        
        // 读取DataSize
        const dataSize = (emfRecordData[offset] & 0xFF) |
                        ((emfRecordData[offset + 1] & 0xFF) << 8) |
                        ((emfRecordData[offset + 2] & 0xFF) << 16) |
                        ((emfRecordData[offset + 3] & 0xFF) << 24);
        offset += 4;
        
        // 读取CommentIdentifier并验证
        const commentId = (emfRecordData[offset] & 0xFF) |
                         ((emfRecordData[offset + 1] & 0xFF) << 8) |
                         ((emfRecordData[offset + 2] & 0xFF) << 16) |
                         ((emfRecordData[offset + 3] & 0xFF) << 24);
        offset += 4;
        
        // 验证EMF+ Comment标识符
        if (commentId !== 0x2B464D45) {
            return null; // 不是EMF+记录
        }
        
        // EMF+记录头结构 (16字节):
        // Type (WORD) - 记录类型 + 标志位
        // Flags (WORD) - 标志
        // Size (DWORD) - 记录大小
        // DataSize (DWORD) - 数据大小
        
        if (offset + 12 > emfRecordData.length) {
            return null;
        }
        
        const type = (emfRecordData[offset] & 0xFF) | ((emfRecordData[offset + 1] & 0xFF) << 8);
        offset += 2;
        
        const flags = (emfRecordData[offset] & 0xFF) | ((emfRecordData[offset + 1] & 0xFF) << 8);
        offset += 2;
        
        const size = (emfRecordData[offset] & 0xFF) |
                    ((emfRecordData[offset + 1] & 0xFF) << 8) |
                    ((emfRecordData[offset + 2] & 0xFF) << 16) |
                    ((emfRecordData[offset + 3] & 0xFF) << 24);
        offset += 4;
        
        const recordDataSize = (emfRecordData[offset] & 0xFF) |
                              ((emfRecordData[offset + 1] & 0xFF) << 8) |
                              ((emfRecordData[offset + 2] & 0xFF) << 16) |
                              ((emfRecordData[offset + 3] & 0xFF) << 24);
        offset += 4;
        
        // 读取记录数据
        const recordData = emfRecordData.slice(offset, offset + recordDataSize);

        return {
            type,
            flags,
            size,
            dataSize: recordDataSize,
            data: recordData
        };
    }

    // 从EMF文件中解析EMF+记录
    parseEmfRecord() {
        if (this.offset + 8 > this.data.length) {
            return null;
        }

        const recordStart = this.offset;
        const type = this.readDword();   // EMF记录类型
        const size = this.readDword();   // EMF记录大小

        if (size < 8) {
            return null;
        }

        if (this.offset + size - 8 > this.data.length) {
            return null;
        }

        const recordData = this.readBytes(size - 8);

        // 如果是EMF+ Comment记录，进一步解析EMF+数据
        if (type === 0x00000046) { // EMR_COMMENT_EMFPLUS
            const emfPlusRecord = this.parseEmfPlusRecord(recordData);
            if (emfPlusRecord) {
                return {
                    type: emfPlusRecord.type,
                    flags: emfPlusRecord.flags,
                    size: emfPlusRecord.size,
                    data: emfPlusRecord.data,
                    isEmfPlus: true
                };
            }
        }

        return {
            type,
            size,
            data: recordData,
            isEmfPlus: false
        };
    }

    // 解析完整的EMF+文件
    parse() {
        try {
            // 首先解析EMF头（EMF+文件始终包含EMF头）
            const emfHeader = this.parseEmfHeader();
            
            // 验证头信息
            if (!emfHeader || emfHeader.nSize <= 0) {
                throw new Error('Invalid EMF header');
            }

            // 跳过EMF文件头
            this.setOffset(emfHeader.nSize);

            // 解析记录
            const records = [];
            let recordCount = 0;
            
            while (this.getOffset() < this.data.length && recordCount < emfHeader.nRecords) {
                try {
                    const record = this.parseEmfRecord();
                    if (record) {
                        // 只保留EMF+记录
                        if (record.isEmfPlus) {
                            records.push(record);
                            console.log('Parsed EMF+ record:', record.type, '(0x' + record.type.toString(16).padStart(4, '0') + ')', 'flags:', record.flags);
                        } else {
                            console.log('Skipped EMF record:', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
                        }
                        recordCount++;
                    } else {
                        console.warn('Failed to parse record at offset:', this.getOffset());
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing record:', error.message);
                    // 跳过错误记录
                    this.setOffset(this.getOffset() + 8);
                }
            }

            console.log('Total EMF+ records parsed:', records.length);
            return { header: emfHeader, records };
        } catch (error) {
            console.error('EMF+ parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    // 解析EMF文件头（EMF+包含EMF头）
    // 根据MS-EMF规范 2.3.4.2 EMR_HEADER Record
    parseEmfHeader() {
        this.offset = 0;
        
        if (this.data.length < 88) {
            return null;
        }
        
        const header = {
            iType: this.readDword(),
            nSize: this.readDword(),
            bounds: {
                left: this.readLong(),
                top: this.readLong(),
                right: this.readLong(),
                bottom: this.readLong()
            },
            frame: {
                left: this.readLong(),
                top: this.readLong(),
                right: this.readLong(),
                bottom: this.readLong()
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
                cx: this.readLong(),
                cy: this.readLong()
            },
            szlMillimeters: {
                cx: this.readLong(),
                cy: this.readLong()
            }
        };
        
        // 验证EMF头
        if (header.dSignature !== 0x464D4520) {
            return null;
        }
        
        if (header.iType !== 1) {
            return null;
        }
        
        return header;
    }
}



// 基础绘制器类 - 提供共享的绘制方法


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



// WMF绘制模块

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



// EMF绘制模块


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



// EMF+绘制模块


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



// 元文件解析器 - 浏览器兼容版本
class MetafileParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector(data);
        this.fileType = this.fileTypeDetector.detect();
        console.log('Metafile Parser initialized with data length:', data.length, 'type:', this.fileType);
    }

    parse() {
        console.log('Starting', this.fileType.toUpperCase(), 'parsing...');

        try {
            switch (this.fileType) {
                case 'emf+':
                    return this.parseEmfPlus();
                case 'emf':
                    return this.parseEmf();
                case 'wmf':
                case 'placeable-wmf':
                    return this.parseWmf();
                default:
                    console.log('Unknown file type, trying all methods...');
                    const emfPlusResult = this.tryParseEmfPlus();
                    if (emfPlusResult && emfPlusResult.records.length > 0) {
                        return emfPlusResult;
                    }
                    const emfResult = this.tryParseEmf();
                    if (emfResult && emfResult.records.length > 0) {
                        return emfResult;
                    }
                    const wmfResult = this.tryParseWmf();
                    if (wmfResult && wmfResult.records.length > 0) {
                        return wmfResult;
                    }
                    throw new Error('Failed to parse file with any format');
            }
        } catch (error) {
            console.error('Parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    parseWmf() {
        const wmfParser = new WmfParser(this.data);
        return wmfParser.parse(this.fileType);
    }

    parseEmf() {
        const emfParser = new EmfParser(this.data);
        return emfParser.parse();
    }

    parseEmfPlus() {
        const emfPlusParser = new EmfPlusParser(this.data);
        return emfPlusParser.parse();
    }

    tryParseWmf() {
        try {
            const wmfParser = new WmfParser(this.data);
            return wmfParser.parse('wmf');
        } catch (error) {
            console.log('WMF parsing failed:', error.message);
            return null;
        }
    }

    tryParseEmf() {
        try {
            const emfParser = new EmfParser(this.data);
            return emfParser.parse();
        } catch (error) {
            console.log('EMF parsing failed:', error.message);
            return null;
        }
    }

    tryParseEmfPlus() {
        try {
            const emfPlusParser = new EmfPlusParser(this.data);
            return emfPlusParser.parse();
        } catch (error) {
            console.log('EMF+ parsing failed:', error.message);
            return null;
        }
    }
}

// 在浏览器环境中导出全局变量
if (typeof window !== 'undefined') {
    window.MetafileParser = MetafileParser;
    window.FileTypeDetector = FileTypeDetector;
    window.CoordinateTransformer = CoordinateTransformer;
    window.GdiObjectManager = GdiObjectManager;
    window.BaseParser = BaseParser;
    window.WmfParser = WmfParser;
    window.EmfParser = EmfParser;
    window.EmfPlusParser = EmfPlusParser;
    window.BaseDrawer = BaseDrawer;
    window.WmfDrawer = WmfDrawer;
    window.EmfDrawer = EmfDrawer;
    window.EmfPlusDrawer = EmfPlusDrawer;
}
