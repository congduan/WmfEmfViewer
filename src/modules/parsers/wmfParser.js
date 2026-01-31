// WMF解析器模块
class WmfParser {
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

module.exports = WmfParser;