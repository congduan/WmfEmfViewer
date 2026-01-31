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

module.exports = FileTypeDetector;