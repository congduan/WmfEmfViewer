// @ts-check
// 文件类型检测模块
// 通过二进制签名自动识别 WMF / Placeable WMF / EMF / EMF+ 四种格式。

/**
 * WMF/EMF/EMF+ 元文件格式类型
 * @typedef {'wmf'|'placeable-wmf'|'emf'|'emf+'|'unknown'} MetafileType
 */

class FileTypeDetector {
    /**
     * @param {Uint8Array|ArrayBuffer|number[]} data 元文件二进制数据
     */
    constructor(data) {
        /** @type {Uint8Array} */
        this.data = new Uint8Array(data);
    }

    /**
     * 按签名检测文件格式。
     * - Placeable WMF: 头 4 字节 D7 CD C6 9A
     * - 标准 WMF: 头 DWORD 为 0x00090001 / 0x00090000
     * - EMF/EMF+: 头 offset 40 处 dSignature 为 0x464D4520 (" EMF")，
     *   并通过扫描 EMR_COMMENT 判别 EMF+
     * @returns {MetafileType}
     */
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

    /**
     * 检查是否为 EMF+ 文件：扫描 EMR_COMMENT (0x46) 记录，
     * CommentIdentifier 为 0x2B464D45 ("+FME"，小端) 时存在 EMF+ 数据。
     * @returns {boolean}
     */
    isEmfPlusFile() {
        try {
            if (this.data.length < 88) return false;

            // 读取EMF头大小（在offset 4处）
            const headerSize = this.readDwordAt(4);

            // 遍历EMF记录，查找 EMR_COMMENT (0x46) 记录，
            // 其 CommentIdentifier 字段为 0x2B464D45 ("+FME"，小端) 时即为 EMF+ 数据
            let offset = headerSize;
            while (offset + 8 <= this.data.length) {
                const type = this.readDwordAt(offset);
                const size = this.readDwordAt(offset + 4);
                if (size < 8 || offset + size > this.data.length) break;

                if (type === 0x46 && size >= 12) {
                    const commentId = this.readDwordAt(offset + 8);
                    if (commentId === 0x2B464D45) {
                        return true;
                    }
                }
                if (type === 0x0E) break; // EMR_EOF
                offset += size;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * 从指定偏移读取 4 字节小端无符号整数（DWORD）。
     * @param {number} offset
     * @returns {number}
     */
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
