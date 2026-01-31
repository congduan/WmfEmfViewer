// EMF+解析器模块
class EmfPlusParser {
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

    // 读取WORD值
    readWord() {
        if (this.offset + 2 > this.data.length) {
            return 0;
        }
        const value = (this.data[this.offset] & 0xFF) | ((this.data[this.offset + 1] & 0xFF) << 8);
        this.offset += 2;
        return value >>> 0;
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

    // 读取指定长度的字节
    readBytes(length) {
        if (this.offset + length > this.data.length) {
            length = this.data.length - this.offset;
        }
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    // 解析EMF+记录
    parseEmfPlusRecord() {
        if (this.offset + 8 > this.data.length) {
            return null;
        }

        // EMF+记录头结构: Type (4 bytes), Flags (4 bytes), Size (4 bytes), Data
        const type = this.readDword();
        const flags = this.readDword();
        const size = this.readDword();

        if (size < 12 || this.offset + size - 12 > this.data.length) {
            return null;
        }

        const recordData = this.readBytes(size - 12);

        return {
            type,
            flags,
            size,
            data: recordData
        };
    }

    // 解析完整的EMF+文件
    parse() {
        try {
            // 首先尝试解析EMF头
            const emfHeader = this.parseEmfHeader();
            
            // 验证头信息
            if (!emfHeader || emfHeader.nSize <= 0) {
                throw new Error('Invalid EMF header');
            }

            // 跳过EMF文件头
            this.setOffset(emfHeader.nSize);

            // 解析EMF+记录
            const records = [];
            let recordCount = 0;
            
            while (this.getOffset() < this.data.length) {
                try {
                    const record = this.parseEmfPlusRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed EMF+ record:', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')', 'flags:', record.flags);
                        recordCount++;
                    } else {
                        console.warn('Failed to parse EMF+ record at offset:', this.getOffset());
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing EMF+ record:', error.message);
                    // 跳过错误记录，继续解析下一条
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
        
        // 验证EMF签名 (在offset 40处)
        const dSignature = this.readDword();
        
        // 检查EMF签名
        if (dSignature !== 0x464D4520) {
            return null;
        }
        
        // 解析EMF头部（小端字节序）
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

module.exports = EmfPlusParser;