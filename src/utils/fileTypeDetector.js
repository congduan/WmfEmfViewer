// @ts-check
// 文件类型检测模块
// 通过二进制签名自动识别 WMF / Placeable WMF / EMF / EMF+ 四种格式。

const { FILE_TYPES, SIGNATURES, RECORD_TYPES, EMF_HEADER_SIZE } = require('./constants');

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
        if (this.data.length < 4) return FILE_TYPES.UNKNOWN;

        // 检查Placeable WMF标识: D7 CD C6 9A (placeable WMF signature)
        if (this.readDwordAt(0) === SIGNATURES.PLACEABLE_WMF_KEY) {
            return FILE_TYPES.PLACEABLE_WMF;
        }

        // 检查标准WMF标识: 0x00090001 或 0x00090000
        const signature = this.readDwordAt(0);
        if (SIGNATURES.WMF_HEADER_WORDS.includes(signature)) {
            return FILE_TYPES.WMF;
        }

        // 检查EMF/EMF+标识 (需要更长头)
        if (this.data.length >= EMF_HEADER_SIZE) {
            // EMF文件头在offset 40处有dSignature字段，值为0x464D4520 (" EMF")
            const dSignature = this.readDwordAt(40);
            if (dSignature === SIGNATURES.EMF_SIGNATURE) {
                // EMF+ 是 EMF 的超集：其 EMF+ 记录经 EMR_GDICOMMENT 内嵌于
                // 标准 EMF 记录流中（Windows 按记录序交织播放）。
                // 统一按 'emf' 解析全量记录，由 EmfDrawer 在遇到 GDICOMMENT 时
                // 派发内嵌 EMF+ 记录；'emf+' 类型保留供 isEmfPlusFile() 单独查询。
                return FILE_TYPES.EMF;
            }
        }

        return FILE_TYPES.UNKNOWN;
    }

    /**
     * 检查是否为 EMF+ 文件：扫描 EMR_GDICOMMENT (0x46) 记录。
     * [MS-EMF] 2.3.4.7 布局：记录头(8) + DataSize(4) + CommentIdentifier(4) + 数据，
     * CommentIdentifier = 0x2B464D45 ("EMF+") 时携带 EMF+ 记录流。
     * 兼容无 DataSize 的变体（CommentIdentifier 紧跟记录头）。
     * @returns {boolean}
     */
    isEmfPlusFile() {
        try {
            if (this.data.length < EMF_HEADER_SIZE) return false;

            // 读取EMF头大小（在offset 4处）
            const headerSize = this.readDwordAt(4);

            // 遍历EMF记录，查找 EMR_GDICOMMENT (0x46)
            let offset = headerSize;
            while (offset + 12 <= this.data.length) {
                const type = this.readDwordAt(offset);
                const size = this.readDwordAt(offset + 4);
                if (size < 8 || offset + size > this.data.length) break;

                if (type === RECORD_TYPES.EMR_GDICOMMENT && size >= 12) {
                    // 规范布局：DataSize@+8、CommentIdentifier@+12
                    if (size >= 16 && this.readDwordAt(offset + 12) === SIGNATURES.EMF_PLUS_COMMENT_ID) {
                        return true;
                    }
                    // 兼容变体：CommentIdentifier 紧跟记录头
                    if (this.readDwordAt(offset + 8) === SIGNATURES.EMF_PLUS_COMMENT_ID) {
                        return true;
                    }
                }
                if (type === RECORD_TYPES.EMR_EOF) break; // EMR_EOF
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
