// EMF解析器模块
const BaseParser = require('./baseParser');

// EMF指令类型映射
const EMF_FUNCTIONS = {
    0x00000001: 'EMR_HEADER',
    0x00000002: 'EMR_POLYBEZIER',
    0x00000003: 'EMR_POLYGON',
    0x00000004: 'EMR_POLYLINE',
    0x00000005: 'EMR_POLYBEZIERTO',
    0x00000006: 'EMR_POLYLINETO',
    0x00000007: 'EMR_LINETO',
    0x00000008: 'EMR_MOVETOEX',
    0x00000009: 'EMR_RECTANGLE',
    0x0000000A: 'EMR_ROUNDRECT',
    0x0000000B: 'EMR_ELLIPSE',
    0x0000000C: 'EMR_ARC',
    0x0000000D: 'EMR_CHORD',
    0x0000000E: 'EMR_PIE',
    0x0000000F: 'EMR_SETWINDOWORGEX',
    0x00000010: 'EMR_SETWINDOWEXTEX',
    0x00000011: 'EMR_SETVIEWPORTORGEX',
    0x00000012: 'EMR_SETVIEWPORTEXTEX',
    0x00000013: 'EMR_SETBRUSHORGEX',
    0x00000014: 'EMR_SETMAPMODE',
    0x00000015: 'EMR_SETBKMODE',
    0x00000016: 'EMR_SETTEXTALIGN',
    0x00000017: 'EMR_SETCOLORADJUSTMENT',
    0x00000018: 'EMR_SETTEXTCOLOR',
    0x00000019: 'EMR_SETBKCOLOR',
    0x0000001A: 'EMR_SETSTRETCHBLTMODE',
    0x0000001B: 'EMR_SETROP2',
    0x0000001C: 'EMR_SETRELABS',
    0x0000001D: 'EMR_SETMAPPERFLAGS',
    0x0000001E: 'EMR_SETDIBITSTODEVICE',
    0x0000001F: 'EMR_SETPALETTEENTRIES',
    0x00000020: 'EMR_SETTEXTMAPPINGMODE',
    0x00000021: 'EMR_SETTEXTJUSTIFICATION',
    0x00000022: 'EMR_GDICOMMENT',
    0x00000023: 'EMR_FILLPATH',
    0x00000024: 'EMR_STROKEANDFILLPATH',
    0x00000025: 'EMR_STROKEPATH',
    0x00000026: 'EMR_SELECTCLIPPATH',
    0x00000027: 'EMR_EOF',
    0x00000028: 'EMR_SELECTOBJECT',
    0x00000029: 'EMR_CREATEPEN',
    0x0000002A: 'EMR_DELETEOBJECT',
    0x0000002B: 'EMR_CREATEBRUSHINDIRECT',
    0x0000002C: 'EMR_SELECTPALETTE',
    0x0000002D: 'EMR_CREATEPALETTE',
    0x0000002E: 'EMR_CREATEFONTINDIRECTA',
    0x0000002F: 'EMR_EXTTEXTOUTA',
    0x00000030: 'EMR_EXTTEXTOUTW',
    0x00000031: 'EMR_POLYPOLYLINE',
    0x00000032: 'EMR_POLYPOLYGON',
    0x00000033: 'EMR_POLYBEZIER16',
    0x00000034: 'EMR_POLYGON16',
    0x00000035: 'EMR_POLYLINE16',
    0x00000036: 'EMR_POLYBEZIERTO16',
    0x00000037: 'EMR_POLYLINETO16',
    0x00000038: 'EMR_POLYPOLYLINE16',
    0x00000039: 'EMR_POLYPOLYGON16',
    0x0000003A: 'EMR_SETARCDIRECTION',
    0x0000003B: 'EMR_SETMITERLIMIT',
    0x0000003C: 'EMR_BEGINPATH',
    0x0000003D: 'EMR_ENDPATH',
    0x0000003E: 'EMR_CLOSEFIGURE',
    0x0000003F: 'EMR_FILLRGN',
    0x00000040: 'EMR_FRAMERGN',
    0x00000041: 'EMR_INVERTRGN',
    0x00000042: 'EMR_PAINTRGN',
    0x00000043: 'EMR_EXTFILLRGN',
    0x00000044: 'EMR_BITBLT',
    0x00000045: 'EMR_STRETCHBLT',
    0x00000046: 'EMR_MASKBLT',
    0x00000047: 'EMR_PLGBLT',
    0x00000048: 'EMR_DIBBITBLT',
    0x00000049: 'EMR_DIBSTRETCHBLT',
    0x0000004A: 'EMR_STRETCHDIBITS',
    0x0000004B: 'EMR_PATBLT',
    0x0000004C: 'EMR_SAVEDC',
    0x0000004D: 'EMR_RESTOREDC',
    0x0000004E: 'EMR_FILLRECT',
    0x0000004F: 'EMR_EXTFILLRECT',
    0x00000050: 'EMR_LINETO',
    0x00000051: 'EMR_FLOODFILL',
    0x00000052: 'EMR_EXTSELECTCLIPRGN',
    0x00000053: 'EMR_INTERSECTCLIPRGN',
    0x00000054: 'EMR_OFFSETCLIPRGN',
    0x00000055: 'EMR_SCALECLIPRGN',
    0x00000056: 'EMR_EXCLUDECLIPRECT',
    0x00000057: 'EMR_INTERSECTCLIPRECT',
    0x00000058: 'EMR_SELECTOBJECT',
    0x00000059: 'EMR_CREATEPATTERNBRUSH',
    0x0000005A: 'EMR_CREATEBITMAPBRUSH',
    0x0000005B: 'EMR_CREATEDIBPATTERNBRUSHPT',
    0x0000005C: 'EMR_CREATEMONOBRUSH',
    0x0000005D: 'EMR_SETTEXTCOLOR',
    0x0000005E: 'EMR_SETBKCOLOR',
    0x0000005F: 'EMR_CREATEFONTINDIRECTW',
    0x00000060: 'EMR_EXTTEXTOUTW',
    0x00000061: 'EMR_POLYTEXTW',
    0x00000062: 'EMR_GLYPHBLT',
    0x00000063: 'EMR_TRANSPARENTBLT',
    0x00000064: 'EMR_PLOTSTAMP',
    0x00000065: 'EMR_EXTSELECTCLIPRGN',
    0x00000066: 'EMR_SETMETARGN',
    0x00000067: 'EMR_CREATECOLORSPACE',
    0x00000068: 'EMR_SETCOLORSPACE',
    0x00000069: 'EMR_DELETECOLORSPACE',
    0x0000006A: 'EMR_GLSBOUNDEDRECORD',
    0x0000006B: 'EMR_GLSUNBOUNDEDRECORD',
    0x0000006C: 'EMR_PIXEL',
    0x0000006D: 'EMR_DRAWPATTERNRECT',
    0x0000006E: 'EMR_EXTFLOODFILL',
    0x0000006F: 'EMR_LASTRECORD'
};

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
            typeName: EMF_FUNCTIONS[type] || 'Unknown',
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

module.exports = EmfParser;