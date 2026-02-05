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
        if (offset + 2 > this.data.length) {
            return 0;
        }
        return ((this.data[offset] & 0xFF) | ((this.data[offset + 1] & 0xFF) << 8)) >>> 0;
    }

    // 读取DWORD值（从指定偏移量）
    readDwordAt(offset) {
        if (offset + 4 > this.data.length) {
            return 0;
        }
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

module.exports = RecordParser;