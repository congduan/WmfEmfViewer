// wmf-emf-renderer - WMF / EMF / EMF+ metafile parser & renderer
// CommonJS entry. Generated API facade over the modular parsers/drawers.

const FileTypeDetector = require('./src/utils/fileTypeDetector');
const CoordinateTransformer = require('./src/utils/coordinateTransformer');
const MathTypeMtefParser = require('./src/utils/mathTypeMtefParser');
const GdiObjectManager = require('./src/utils/gdiObjectManager');
const BaseParser = require('./src/modules/parsers/baseParser');
const WmfParser = require('./src/modules/parsers/wmfParser');
const EmfParser = require('./src/modules/parsers/emfParser');
const EmfPlusParser = require('./src/modules/parsers/emfPlusParser');
const BaseDrawer = require('./src/modules/drawers/baseDrawer');
const WmfDrawer = require('./src/modules/drawers/wmfDrawer');
const EmfDrawer = require('./src/modules/drawers/emfDrawer');
const EmfPlusDrawer = require('./src/modules/drawers/emfPlusDrawer');
const SvgContext = require('./src/modules/svgContext');

// ---- debug logging (source modules log via globalThis.__wmfEmfRendererLog) ----
globalThis.__wmfEmfRendererLog = globalThis.__wmfEmfRendererLog || function () {};

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

/**
 * MetafileParser - format auto-detecting facade over WmfParser/EmfParser/EmfPlusParser.
 * Mirrors src/utils/metafileParser.js but with quiet logging and a stable contract.
 */
class MetafileParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector(this.data);
        this.fileType = this.fileTypeDetector.detect();
    }

    parse() {
        try {
            switch (this.fileType) {
                case 'emf+':
                    return this.parseEmfPlus();
                case 'emf':
                    return this.parseEmf();
                case 'wmf':
                case 'placeable-wmf':
                    return this.parseWmf();
                default: {
                    // Unknown signature: try every parser until one yields records
                    const candidates = [
                        this.tryParseEmfPlus(),
                        this.tryParseEmf(),
                        this.tryParseWmf()
                    ];
                    for (const candidate of candidates) {
                        if (candidate && candidate.records && candidate.records.length > 0) {
                            return candidate;
                        }
                    }
                    throw new Error('Failed to parse file with any format');
                }
            }
        } catch (error) {
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    parseWmf() {
        return new WmfParser(this.data).parse(this.fileType);
    }

    parseEmf() {
        return new EmfParser(this.data).parse();
    }

    parseEmfPlus() {
        return new EmfPlusParser(this.data).parse();
    }

    tryParseWmf() {
        try {
            return new WmfParser(this.data).parse('wmf');
        } catch (e) {
            return null;
        }
    }

    tryParseEmf() {
        try {
            return new EmfParser(this.data).parse();
        } catch (e) {
            return null;
        }
    }

    tryParseEmfPlus() {
        try {
            return new EmfPlusParser(this.data).parse();
        } catch (e) {
            return null;
        }
    }
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
