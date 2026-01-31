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
        
        // 检查EMF标识 (需要更长头)
        if (this.data.length >= 88) {
            // EMF文件头在offset 40处有dSignature字段，值为0x464D4520 (" EMF")
            const dSignature = this.readDwordAt(40);
            if (dSignature === 0x464D4520) { // " EMF"
                return 'emf';
            }
        }
        
        return 'unknown';
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