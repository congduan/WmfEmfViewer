// 文本度量提供者。
//
// 背景：SvgContext / PdfContext 都不跑在真实 Canvas 上，过去用
// `0.6 × 字号 × 字符数` 粗估文本宽度。这个估算会直接影响真实渲染结果：
// WMF 的 TA_UPDATECP 文本序列用 measureText 推进"当前位置"，宽度估错会让
// 后续每个字符串整体错位（EMF 侧只算锚点，不受影响）。
//
// 本模块提供一个可插拔的真实度量源，优先级：
//   1. 宿主注入的 provider（Node 侧可接 @napi-rs/canvas / 系统字体解析结果）；
//   2. 浏览器/Worker 自带的 OffscreenCanvas / <canvas>（字体度量由宿主字体引擎给出）；
//   3. 都没有时返回 null，调用方回退到旧的估算公式（保持零依赖与可预测输出）。
//
// 之所以不在本模块内直接引依赖：浏览器 bundle 与 npm 包都必须保持零运行时依赖，
// 而真值只可能在"宿主有字体引擎"时取得。
const MAX_CACHE_ENTRIES = 20000;

/** @type {((font: string, text: string) => number|null)|null} */
let measureProvider = null;
/** @type {any} */
let hostContext = null;
let hostContextTried = false;
/** @type {Map<string, number>} */
const widthCache = new Map();

/**
 * 注入真实度量源（传 null 恢复默认行为）。
 * provider 返回像素宽度；返回 null/NaN 表示"这个字体我量不了"，将回退。
 * @param {((font: string, text: string) => number|null)|null} fn
 */
function setMeasureProvider(fn) {
    measureProvider = typeof fn === 'function' ? fn : null;
    widthCache.clear();
}

/**
 * 浏览器/Worker 环境的宿主度量上下文（惰性创建一次）。
 * Node 下两者都不存在，返回 null。
 * @returns {any}
 */
function getHostMeasureContext() {
    if (hostContextTried) return hostContext;
    hostContextTried = true;
    try {
        if (typeof OffscreenCanvas !== 'undefined') {
            hostContext = new OffscreenCanvas(1, 1).getContext('2d');
        } else if (typeof document !== 'undefined' && document.createElement) {
            hostContext = document.createElement('canvas').getContext('2d');
        }
    } catch (error) {
        hostContext = null;
    }
    return hostContext;
}

/**
 * 量一段文本的宽度（像素）。
 * @param {string} font CSS font 简写（如 `bold 12px "Arial"`）
 * @param {string} text
 * @returns {number|null} 宽度；null 表示当前环境无法真实度量
 */
function measureWidth(font, text) {
    const value = String(text == null ? '' : text);
    if (!value) return 0;
    const key = font + '\u0000' + value;
    const cached = widthCache.get(key);
    if (cached !== undefined) return cached;

    let width = null;
    if (measureProvider) {
        try {
            const w = measureProvider(font, value);
            if (typeof w === 'number' && isFinite(w) && w >= 0) width = w;
        } catch (error) {
            width = null;
        }
    }
    if (width === null) {
        const ctx = getHostMeasureContext();
        if (ctx) {
            try {
                ctx.font = font;
                const m = ctx.measureText(value);
                if (m && typeof m.width === 'number' && isFinite(m.width)) width = m.width;
            } catch (error) {
                width = null;
            }
        }
    }
    if (width === null) return null;

    if (widthCache.size >= MAX_CACHE_ENTRIES) widthCache.clear();
    widthCache.set(key, width);
    return width;
}

module.exports = {
    setMeasureProvider,
    measureWidth,
    getHostMeasureContext
};
