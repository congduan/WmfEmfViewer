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
    // 0x4008 起依据 [MS-EMFPLUS] 2.1.1 枚举（与 emfPlusDrawer 的分发一致）
    0x4008: 'EmfPlusObject',
    0x4009: 'EmfPlusClear',
    0x400A: 'EmfPlusFillRects',
    0x400B: 'EmfPlusDrawRects',
    0x400C: 'EmfPlusFillPolygon',
    0x400D: 'EmfPlusDrawLines',
    0x400E: 'EmfPlusFillEllipse',
    0x400F: 'EmfPlusDrawEllipse',
    0x4010: 'EmfPlusFillPie',
    0x4011: 'EmfPlusDrawPie',
    0x4012: 'EmfPlusDrawArc',
    0x4013: 'EmfPlusFillRegion',
    0x4014: 'EmfPlusDrawRegion',
    0x4015: 'EmfPlusFillPath',
    0x4016: 'EmfPlusDrawPath',
    0x4017: 'EmfPlusFillClosedCurve',
    0x4018: 'EmfPlusDrawClosedCurve',
    0x4019: 'EmfPlusDrawCurve',
    0x401A: 'EmfPlusDrawBeziers',
    0x401B: 'EmfPlusDrawImage',
    0x401C: 'EmfPlusDrawImagePoints',
    0x401D: 'EmfPlusDrawString',
    0x401E: 'EmfPlusSetRenderingOrigin',
    0x401F: 'EmfPlusSetAntiAliasMode',
    0x4020: 'EmfPlusSetTextRenderingHint',
    0x4021: 'EmfPlusSetCompositingMode',
    0x4022: 'EmfPlusSetCompositingQuality',
    0x4023: 'EmfPlusSave',
    0x4024: 'EmfPlusRestore',
    0x4025: 'EmfPlusBeginContainer',
    0x4026: 'EmfPlusBeginContainerNoParams',
    0x4027: 'EmfPlusEndContainer',
    0x4028: 'EmfPlusSetWorldTransform',
    0x4029: 'EmfPlusResetWorldTransform',
    0x402A: 'EmfPlusMultiplyWorldTransform',
    0x402B: 'EmfPlusTranslateWorldTransform',
    0x402C: 'EmfPlusScaleWorldTransform',
    0x402D: 'EmfPlusRotateWorldTransform',
    0x402E: 'EmfPlusSetPageTransform',
    0x402F: 'EmfPlusResetClip',
    0x4030: 'EmfPlusSetClipRect',
    0x4031: 'EmfPlusSetClipPath',
    0x4032: 'EmfPlusSetClipRegion',
    0x4033: 'EmfPlusOffsetClip',
    0x4034: 'EmfPlusDrawDriverString',
    // 0x4035 起为 Terminal Server 扩展，罕见
    0x4035: 'EmfPlusSerializableObject',
    0x4036: 'EmfPlusSetTSGraphics',
    0x4037: 'EmfPlusSetTSClip'
};

class EmfPlusParser extends BaseParser {
    constructor(data) {
        super(data);
    }

    // EMF+ 记录头结构（MS-EMFPLUS 2.3.1，共 12 字节）：
    // Type(2) + Flags(2) + Size(4，含 12 字节头的记录总大小) + DataSize(4，数据字节数)
    parseEmfPlusRecord(emfRecordData) {
        const list = this.parseEmfPlusRecords(emfRecordData);
        return list.length ? list[0] : null;
    }

    // 解析同一 EMR_COMMENT 载荷中的全部 EMF+ 记录。
    // [MS-EMFPLUS] 2.3.1：EMF+ 记录头为 12 字节——
    //   Type(2) + Flags(2) + Size(4，含 12 字节头的记录总大小) + DataSize(4，数据字节数)
    // 旧实现按 8 字节头读取，把 DataSize 误当记录体首字段，整条流错位 4 字节。
    parseEmfPlusRecords(emfRecordData) {
        const results = [];
        if (emfRecordData.length < 16) return results;

        const dataSize = (emfRecordData[0] & 0xFF) | ((emfRecordData[1] & 0xFF) << 8) |
                         ((emfRecordData[2] & 0xFF) << 16) | ((emfRecordData[3] & 0xFF) << 24);
        const commentId = (emfRecordData[4] & 0xFF) | ((emfRecordData[5] & 0xFF) << 8) |
                          ((emfRecordData[6] & 0xFF) << 16) | ((emfRecordData[7] & 0xFF) << 24);
        if (commentId !== 0x2B464D45) return results; // 'EMF+'

        // EMF+ 记录流起始于偏移 8（DataSize + 'EMF+' 之后），总长受 DataSize 约束
        const end = Math.min(8 + dataSize, emfRecordData.length);
        let offset = 8;
        while (offset + 12 <= end) {
            const type = (emfRecordData[offset] & 0xFF) | ((emfRecordData[offset + 1] & 0xFF) << 8);
            const flags = (emfRecordData[offset + 2] & 0xFF) | ((emfRecordData[offset + 3] & 0xFF) << 8);
            const size = (emfRecordData[offset + 4] & 0xFF) | ((emfRecordData[offset + 5] & 0xFF) << 8) |
                         ((emfRecordData[offset + 6] & 0xFF) << 16) | ((emfRecordData[offset + 7] & 0xFF) << 24);
            const bodySize = (emfRecordData[offset + 8] & 0xFF) | ((emfRecordData[offset + 9] & 0xFF) << 8) |
                             ((emfRecordData[offset + 10] & 0xFF) << 16) | ((emfRecordData[offset + 11] & 0xFF) << 24);
            if (size < 12 || offset + size > end) break;
            // 记录体：紧随 12 字节头，长度 DataSize（兜底不超过 size-12）
            const dataLen = Math.max(0, Math.min(bodySize, size - 12, end - offset - 12));
            const recordData = emfRecordData.slice(offset + 12, offset + 12 + dataLen);
            results.push({
                type,
                typeName: EMFPLUS_FUNCTIONS[type] || 'Unknown',
                flags,
                size,
                dataSize: dataLen,
                data: recordData
            });
            offset += size;
        }
        return results;
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

        // 如果是EMF+ Comment记录，进一步解析EMF+数据（一个 Comment 可含多条 EMF+ 记录）
        if (type === 0x00000046) { // EMR_COMMENT_EMFPLUS
            const emfPlusRecords = this.parseEmfPlusRecords(recordData);
            if (emfPlusRecords.length > 0) {
                return emfPlusRecords.map(r => ({
                    type: r.type,
                    typeName: r.typeName,
                    flags: r.flags,
                    size: r.size,
                    data: r.data,
                    isEmfPlus: true
                }));
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
                        // parseEmfRecord 可能返回数组（一个 EMR_COMMENT 含多条 EMF+ 记录）
                        const recordList = Array.isArray(record) ? record : [record];
                        for (const r of recordList) {
                            // 只保留EMF+记录
                            if (r.isEmfPlus) {
                                records.push(r);
                                // 性能：每条记录一次日志会拖慢大文件解析，仅在调试模式输出
                                if (globalThis.__WMF_DEBUG__) {
                                    console.log('Parsed EMF+ record:', r.type, '(0x' + r.type.toString(16).padStart(4, '0') + ')', 'flags:', r.flags);
                                }
                            } else {
                                if (globalThis.__WMF_DEBUG__) {
                                    console.log('Skipped EMF record:', r.type, '(0x' + r.type.toString(16).padStart(8, '0') + ')');
                                }
                            }
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