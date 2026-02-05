// EMF+解析器模块
const BaseParser = require('./baseParser');

// EMF+指令类型映射
const EMFPLUS_FUNCTIONS = {
    0x4001: 'EmfPlusHeader',
    0x4002: 'EmfPlusEndOfFile',
    0x4003: 'EmfPlusComment',
    0x4004: 'EmfPlusGetDC',
    0x4005: 'EmfPlusMultiFormatStart',
    0x4006: 'EmfPlusMultiFormatSection',
    0x4007: 'EmfPlusMultiFormatEnd',
    0x4008: 'EmfPlusGetPageTransform',
    0x4009: 'EmfPlusSetPageTransform',
    0x4010: 'EmfPlusClear',
    0x4011: 'EmfPlusFillRects',
    0x4012: 'EmfPlusDrawRects',
    0x4013: 'EmfPlusFillPolygon',
    0x4014: 'EmfPlusDrawPolygon',
    0x4015: 'EmfPlusFillPolyPolygon',
    0x4016: 'EmfPlusDrawPolyPolygon',
    0x4017: 'EmfPlusDrawLines',
    0x4018: 'EmfPlusDrawCurve',
    0x4019: 'EmfPlusFillEllipse',
    0x401A: 'EmfPlusDrawEllipse',
    0x401B: 'EmfPlusFillPie',
    0x401C: 'EmfPlusDrawPie',
    0x401D: 'EmfPlusDrawArc',
    0x401E: 'EmfPlusFillRegion',
    0x401F: 'EmfPlusDrawRegion',
    0x4020: 'EmfPlusFillPath',
    0x4021: 'EmfPlusDrawPath',
    0x4022: 'EmfPlusFillClosedCurve',
    0x4023: 'EmfPlusDrawClosedCurve',
    0x4024: 'EmfPlusFillBeziers',
    0x4025: 'EmfPlusDrawBeziers',
    0x4026: 'EmfPlusDrawImage',
    0x4027: 'EmfPlusDrawImagePoints',
    0x4028: 'EmfPlusDrawString',
    0x4029: 'EmfPlusSetRenderingOrigin',
    0x402A: 'EmfPlusSetAntiAliasMode',
    0x402B: 'EmfPlusSetTextRenderingHint',
    0x402C: 'EmfPlusSetInterpolationMode',
    0x402D: 'EmfPlusSetPixelOffsetMode',
    0x402E: 'EmfPlusSetCompositingMode',
    0x402F: 'EmfPlusSetCompositingQuality',
    0x4030: 'EmfPlusSave',
    0x4031: 'EmfPlusRestore',
    0x4032: 'EmfPlusBeginContainer',
    0x4033: 'EmfPlusBeginContainerNoParams',
    0x4034: 'EmfPlusEndContainer',
    0x4035: 'EmfPlusSetWorldTransform',
    0x4036: 'EmfPlusResetWorldTransform',
    0x4037: 'EmfPlusMultiplyWorldTransform',
    0x4038: 'EmfPlusTranslateWorldTransform',
    0x4039: 'EmfPlusScaleWorldTransform',
    0x403A: 'EmfPlusRotateWorldTransform',
    0x403B: 'EmfPlusSetPageTransform',
    0x403C: 'EmfPlusResetClip',
    0x403D: 'EmfPlusSetClipRect',
    0x403E: 'EmfPlusSetClipPath',
    0x403F: 'EmfPlusSetClipRegion',
    0x4040: 'EmfPlusOffsetClip',
    0x4041: 'EmfPlusDrawDriverString',
    0x4042: 'EmfPlusSetTextContrast',
    0x4043: 'EmfPlusSetTextJustification',
    0x4044: 'EmfPlusSetStringFormat',
    0x4045: 'EmfPlusSetTextAlign',
    0x4046: 'EmfPlusSetTextColor',
    0x4047: 'EmfPlusSetBackgroundColor',
    0x4048: 'EmfPlusSetBackgroundMode',
    0x4049: 'EmfPlusSetStretchBltMode',
    0x404A: 'EmfPlusSetMapMode',
    0x404B: 'EmfPlusSetBkMode',
    0x404C: 'EmfPlusSetPolyFillMode',
    0x404D: 'EmfPlusSetROP2',
    0x404E: 'EmfPlusSetStretchMode',
    0x404F: 'EmfPlusSetArcDirection',
    0x4050: 'EmfPlusSetMiterLimit',
    0x4051: 'EmfPlusSetTextCharExtra',
    0x4052: 'EmfPlusSetWindowOrg',
    0x4053: 'EmfPlusSetWindowExt',
    0x4054: 'EmfPlusSetViewportOrg',
    0x4055: 'EmfPlusSetViewportExt',
    0x4056: 'EmfPlusSetWindowOrgEx',
    0x4057: 'EmfPlusSetWindowExtEx',
    0x4058: 'EmfPlusSetViewportOrgEx',
    0x4059: 'EmfPlusSetViewportExtEx',
    0x405A: 'EmfPlusSetBrushOrg',
    0x405B: 'EmfPlusSetBrushOrgEx',
    0x405C: 'EmfPlusCreatePen',
    0x405D: 'EmfPlusCreateSolidBrush',
    0x405E: 'EmfPlusCreateHatchBrush',
    0x405F: 'EmfPlusCreateLinearGradientBrush',
    0x4060: 'EmfPlusCreatePathGradientBrush',
    0x4061: 'EmfPlusCreateTextureBrush',
    0x4062: 'EmfPlusCreateFont',
    0x4063: 'EmfPlusCreateStringFormat',
    0x4064: 'EmfPlusCreateRegion',
    0x4065: 'EmfPlusCreatePath',
    0x4066: 'EmfPlusCreateGraphics',
    0x4067: 'EmfPlusCreateGraphicsPath',
    0x4068: 'EmfPlusDeleteObject',
    0x4069: 'EmfPlusSelectObject',
    0x406A: 'EmfPlusCreatePen2',
    0x406B: 'EmfPlusCreateBrush',
    0x406C: 'EmfPlusCreateFont2',
    0x406D: 'EmfPlusGetObject',
    0x406E: 'EmfPlusGetDC',
    0x406F: 'EmfPlusReleaseDC',
    0x4070: 'EmfPlusDrawDriverString',
    0x4071: 'EmfPlusDrawString',
    0x4072: 'EmfPlusDrawImage',
    0x4073: 'EmfPlusDrawImagePoints',
    0x4074: 'EmfPlusDrawCurve',
    0x4075: 'EmfPlusFillClosedCurve',
    0x4076: 'EmfPlusDrawClosedCurve',
    0x4077: 'EmfPlusFillBeziers',
    0x4078: 'EmfPlusDrawBeziers',
    0x4079: 'EmfPlusFillPolygon',
    0x407A: 'EmfPlusDrawPolygon',
    0x407B: 'EmfPlusFillPolyPolygon',
    0x407C: 'EmfPlusDrawPolyPolygon',
    0x407D: 'EmfPlusDrawLines',
    0x407E: 'EmfPlusFillEllipse',
    0x407F: 'EmfPlusDrawEllipse',
    0x4080: 'EmfPlusFillPie',
    0x4081: 'EmfPlusDrawPie',
    0x4082: 'EmfPlusDrawArc',
    0x4083: 'EmfPlusFillRects',
    0x4084: 'EmfPlusDrawRects',
    0x4085: 'EmfPlusFillPath',
    0x4086: 'EmfPlusDrawPath',
    0x4087: 'EmfPlusFillRegion',
    0x4088: 'EmfPlusDrawRegion',
    0x4089: 'EmfPlusClear',
    0x408A: 'EmfPlusResetClip',
    0x408B: 'EmfPlusSetClipRect',
    0x408C: 'EmfPlusSetClipPath',
    0x408D: 'EmfPlusSetClipRegion',
    0x408E: 'EmfPlusOffsetClip',
    0x408F: 'EmfPlusSave',
    0x4090: 'EmfPlusRestore',
    0x4091: 'EmfPlusBeginContainer',
    0x4092: 'EmfPlusBeginContainerNoParams',
    0x4093: 'EmfPlusEndContainer',
    0x4094: 'EmfPlusSetWorldTransform',
    0x4095: 'EmfPlusResetWorldTransform',
    0x4096: 'EmfPlusMultiplyWorldTransform',
    0x4097: 'EmfPlusTranslateWorldTransform',
    0x4098: 'EmfPlusScaleWorldTransform',
    0x4099: 'EmfPlusRotateWorldTransform',
    0x409A: 'EmfPlusSetPageTransform',
    0x409B: 'EmfPlusSetRenderingOrigin',
    0x409C: 'EmfPlusSetAntiAliasMode',
    0x409D: 'EmfPlusSetTextRenderingHint',
    0x409E: 'EmfPlusSetInterpolationMode',
    0x409F: 'EmfPlusSetPixelOffsetMode',
    0x40A0: 'EmfPlusSetCompositingMode',
    0x40A1: 'EmfPlusSetCompositingQuality',
    0x40A2: 'EmfPlusSetTextContrast',
    0x40A3: 'EmfPlusSetTextJustification',
    0x40A4: 'EmfPlusSetStringFormat',
    0x40A5: 'EmfPlusSetTextAlign',
    0x40A6: 'EmfPlusSetTextColor',
    0x40A7: 'EmfPlusSetBackgroundColor',
    0x40A8: 'EmfPlusSetBackgroundMode',
    0x40A9: 'EmfPlusSetStretchBltMode',
    0x40AA: 'EmfPlusSetMapMode',
    0x40AB: 'EmfPlusSetBkMode',
    0x40AC: 'EmfPlusSetPolyFillMode',
    0x40AD: 'EmfPlusSetROP2',
    0x40AE: 'EmfPlusSetStretchMode',
    0x40AF: 'EmfPlusSetArcDirection',
    0x40B0: 'EmfPlusSetMiterLimit',
    0x40B1: 'EmfPlusSetTextCharExtra',
    0x40B2: 'EmfPlusSetWindowOrg',
    0x40B3: 'EmfPlusSetWindowExt',
    0x40B4: 'EmfPlusSetViewportOrg',
    0x40B5: 'EmfPlusSetViewportExt',
    0x40B6: 'EmfPlusSetWindowOrgEx',
    0x40B7: 'EmfPlusSetWindowExtEx',
    0x40B8: 'EmfPlusSetViewportOrgEx',
    0x40B9: 'EmfPlusSetViewportExtEx',
    0x40BA: 'EmfPlusSetBrushOrg',
    0x40BB: 'EmfPlusSetBrushOrgEx',
    0x40BC: 'EmfPlusGetObject',
    0x40BD: 'EmfPlusGetDC',
    0x40BE: 'EmfPlusReleaseDC'
};

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
            typeName: EMFPLUS_FUNCTIONS[type] || 'Unknown',
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
                    typeName: emfPlusRecord.typeName,
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

module.exports = EmfPlusParser;