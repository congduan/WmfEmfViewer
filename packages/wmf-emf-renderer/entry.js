// wmf-emf-renderer - npm 包构建入口（源文件，勿直接发布）
// 由 scripts/build-bundles.js 用 esbuild 打包为单文件 index.js（CommonJS）。
// 源码位于仓库根 src/，esbuild 会内联全部依赖，发布产物不含本文件。
//
// 注意：logger 初始化必须放在 require 之前，保证被内联模块的
// console.log（构建时被 define 替换为 __wmfEmfRendererLog）总有兜底实现。
globalThis.__wmfEmfRendererLog = globalThis.__wmfEmfRendererLog || function () {};

const FileTypeDetector = require('../../src/utils/fileTypeDetector');
const CoordinateTransformer = require('../../src/utils/coordinateTransformer');
const MathTypeMtefParser = require('../../src/utils/mathTypeMtefParser');
const GdiObjectManager = require('../../src/utils/gdiObjectManager');
const BaseParser = require('../../src/modules/parsers/baseParser');
const WmfParser = require('../../src/modules/parsers/wmfParser');
const EmfParser = require('../../src/modules/parsers/emfParser');
const EmfPlusParser = require('../../src/modules/parsers/emfPlusParser');
const BaseDrawer = require('../../src/modules/drawers/baseDrawer');
const WmfDrawer = require('../../src/modules/drawers/wmfDrawer');
const EmfDrawer = require('../../src/modules/drawers/emfDrawer');
const EmfPlusDrawer = require('../../src/modules/drawers/emfPlusDrawer');
const SvgContext = require('../../src/modules/svgContext');
const MetafileParser = require('../../src/utils/metafileParser');

/**
 * Enable/disable verbose debug logging from parsers/drawers.
 * Disabled by default for a quiet library experience.
 * @param {boolean} enabled
 */
function setDebugEnabled(enabled) {
    if (enabled) {
        globalThis.__wmfEmfRendererLog = console.log.bind(console);
    } else {
        globalThis.__wmfEmfRendererLog = function () {};
    }
}

/**
 * Detect the metafile format of the given binary data.
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @returns {'wmf'|'placeable-wmf'|'emf'|'emf+'|'unknown'}
 */
function detectFileType(data) {
    return new FileTypeDetector(data).detect();
}

/**
 * Parse a WMF/EMF/EMF+ metafile into { header, records }.
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @returns {{fileType: string, header: object|null, records: Array, error?: string}}
 */
function parseMetafile(data) {
    const parser = new MetafileParser(data);
    const result = parser.parse();
    result.fileType = result.fileType || parser.fileType;
    return result;
}

/**
 * Create the format-appropriate drawer for a Canvas2D-compatible context.
 * @param {object} ctx - CanvasRenderingContext2D or compatible (e.g. SvgContext, node-canvas ctx)
 * @param {string} fileType - one of 'wmf' | 'placeable-wmf' | 'emf' | 'emf+'
 * @returns {BaseDrawer}
 */
function createDrawer(ctx, fileType) {
    if (fileType === 'wmf' || fileType === 'placeable-wmf') {
        return new WmfDrawer(ctx);
    } else if (fileType === 'emf') {
        return new EmfDrawer(ctx);
    } else if (fileType === 'emf+') {
        return new EmfPlusDrawer(ctx);
    }
    throw new Error('Unknown file type: ' + fileType);
}

/**
 * Render a metafile onto a Canvas 2D context (browser canvas, node-canvas, or compatible).
 * The canvas backing the context is resized automatically.
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @param {object} ctx - CanvasRenderingContext2D or compatible
 * @param {{viewWidth?: number, viewHeight?: number}} [options]
 * @returns {{width: number, height: number, fileType: string}}
 */
function renderToContext(data, ctx, options) {
    if (!ctx) {
        throw new Error('renderToContext: a Canvas 2D context is required');
    }
    // Shim properties the drawers expect (node-canvas lacks canvas.style)
    if (!ctx.canvas) ctx.canvas = { width: 0, height: 0, style: {} };
    if (!ctx.canvas.style) ctx.canvas.style = {};

    const parsed = parseMetafile(data);
    if (parsed.error) {
        throw new Error(parsed.error);
    }
    const drawer = createDrawer(ctx, parsed.fileType);
    drawer.draw(parsed, options || {});
    return {
        width: ctx.canvas.width,
        height: ctx.canvas.height,
        fileType: parsed.fileType
    };
}

/**
 * Render a metafile to an SVG document string. Works in Node.js and browsers.
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @param {{viewWidth?: number, viewHeight?: number}} [options]
 * @returns {string} SVG document
 */
function renderToSvg(data, options) {
    const svgCtx = new SvgContext();
    const info = renderToContext(data, svgCtx, options);
    return svgCtx.getSvg();
    // (info kept implicit; callers needing dimensions can parseMetafile themselves)
}

module.exports = {
    // high-level API
    detectFileType,
    parseMetafile,
    renderToSvg,
    renderToContext,
    createDrawer,
    setDebugEnabled,
    // parsers
    MetafileParser,
    FileTypeDetector,
    BaseParser,
    WmfParser,
    EmfParser,
    EmfPlusParser,
    // renderers
    BaseDrawer,
    WmfDrawer,
    EmfDrawer,
    EmfPlusDrawer,
    SvgContext,
    // utilities
    CoordinateTransformer,
    GdiObjectManager,
    MathTypeMtefParser
};
