// EMF+解析器模块
const BaseParser = require('./baseParser');

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

module.exports = EmfPlusParser;