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

module.exports = BaseParser;