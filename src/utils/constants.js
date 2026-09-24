// 共享常量：文件类型标识、二进制签名、记录类型与渲染默认值。
//
// 背景：这些字面量原先散落在 fileTypeDetector / 三个 parser / 三个 drawer 中
// （例如 'emf+' 出现 20+ 处、'EMF+' 签名 0x2B464D45 出现 3 处），一处笔误即造成
// 静默的格式误判。集中到本模块后，解析与渲染两侧引用同一份定义。

/**
 * 元文件格式类型标识。
 * 值声明为字面量类型，使其可直接满足 `fileTypeDetector.js` 的 `MetafileType`。
 * @type {{ WMF: 'wmf', PLACEABLE_WMF: 'placeable-wmf', EMF: 'emf', EMF_PLUS: 'emf+', UNKNOWN: 'unknown' }}
 */
const FILE_TYPES = {
    /** 标准 WMF（16 位记录） */
    WMF: 'wmf',
    /** 带定位头的 WMF */
    PLACEABLE_WMF: 'placeable-wmf',
    /** EMF（32 位记录；EMF+ 亦按 emf 解析，见 fileTypeDetector 说明） */
    EMF: 'emf',
    /** EMF+（EMR_GDICOMMENT 内嵌的增强记录流） */
    EMF_PLUS: 'emf+',
    /** 无法识别 */
    UNKNOWN: 'unknown'
};

/** 二进制签名与标识字。 */
const SIGNATURES = {
    /** Placeable WMF 头 DWORD（首 4 字节 D7 CD C6 9A，小端） */
    PLACEABLE_WMF_KEY: 0x9AC6CDD7,
    /** 标准 WMF 头 DWORD 的合法取值 */
    WMF_HEADER_WORDS: [0x00090001, 0x00090000],
    /** EMF 头 offset 40 处 dSignature：" EMF" */
    EMF_SIGNATURE: 0x464D4520,
    /** EMF+ 注释标识 "EMF+"（EMR_GDICOMMENT 的 CommentIdentifier） */
    EMF_PLUS_COMMENT_ID: 0x2B464D45
};

/** EMF 记录类型（[MS-EMF] 2.1.1）。 */
const RECORD_TYPES = {
    /** EMR_GDICOMMENT：EMF+ 记录流以内嵌注释的形式承载 */
    EMR_GDICOMMENT: 0x46,
    /** EMR_EOF：记录流结束 */
    EMR_EOF: 0x0E
};

/** EMF 头固定长度（字节），用于判断数据是否足以容纳完整头 */
const EMF_HEADER_SIZE = 88;

/** 默认渲染 DPI（无文件头信息时的回退值） */
const DEFAULT_DPI = 96;

/** 默认视口尺寸（未显式指定 viewWidth/viewHeight 时的回退值） */
const DEFAULT_VIEW_WIDTH = 800;
const DEFAULT_VIEW_HEIGHT = 600;

module.exports = {
    FILE_TYPES,
    SIGNATURES,
    RECORD_TYPES,
    EMF_HEADER_SIZE,
    DEFAULT_DPI,
    DEFAULT_VIEW_WIDTH,
    DEFAULT_VIEW_HEIGHT
};
