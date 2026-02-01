// EMF解析器模块
const BaseParser = require('./baseParser');

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

module.exports = EmfParser;