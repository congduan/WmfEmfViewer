// Nested-metafile player: a metafile embedded inside another metafile.
//
// Three call sites used to implement this ad hoc, each wiring its own
// dependencies (one of them with `typeof require` / `typeof window` sniffing):
//   1. WmfDrawer    - WMFC escape blocks reassembled into an EMF, replayed with EmfDrawer;
//   2. EmfDrawer    - an EMR_GDICOMMENT carrying an EMF+ record stream, replayed record by
//      record into a persistent EmfPlusDrawer that shares the coordinate transformer;
//   3. EmfPlusDrawer - an EMF+ image object holding a nested metafile, rendered into an
//      isolated SvgContext and embedded into the parent SVG as a group.
//
// This module owns the cross-format knowledge, so drawers no longer require each
// other and no module needs to sniff the host environment.

const MetafileParser = require('./metafileParser');
const EmfParser = require('../modules/parsers/emfParser');
const EmfPlusParser = require('../modules/parsers/emfPlusParser');
const SvgContext = require('../modules/svgContext');
const { FILE_TYPES, DEFAULT_VIEW_WIDTH, DEFAULT_VIEW_HEIGHT } = require('./constants');

/**
 * Create a drawer instance for a metafile type.
 *
 * The drawer modules are required lazily on purpose: they are mutually recursive
 * for nested playback, so requiring them at load time would re-create the cycle
 * emfPlusDrawer -> emfDrawer -> emfPlusDrawer. Keeping the only lazy edge inside
 * this module is what allows every other module to use plain top-level requires.
 *
 * @param {string} fileType one of FILE_TYPES
 * @param {any} ctx target drawing context
 * @returns {any} drawer instance
 */
function createDrawer(fileType, ctx) {
    switch (fileType) {
        case FILE_TYPES.EMF_PLUS:
            return new (require('../modules/drawers/emfPlusDrawer'))(ctx);
        case FILE_TYPES.WMF:
        case FILE_TYPES.PLACEABLE_WMF:
            return new (require('../modules/drawers/wmfDrawer'))(ctx);
        case FILE_TYPES.EMF:
        default:
            return new (require('../modules/drawers/emfDrawer'))(ctx);
    }
}

/**
 * Parse an EMF byte stream and replay it into ctx.
 * Used for the EMF reassembled from WMF WMFC escape blocks.
 *
 * Parse errors propagate to the caller (WmfDrawer falls back to standard WMF
 * rendering when the embedded EMF cannot be replayed).
 *
 * @param {Uint8Array} bytes EMF bytes
 * @param {any} ctx target drawing context
 * @param {any} [options] draw options, e.g. viewport size
 * @returns {any} parsed metafile data
 */
function drawEmfBytes(bytes, ctx, options) {
    const parsed = new EmfParser(bytes).parse();
    createDrawer(FILE_TYPES.EMF, ctx).draw(parsed, options);
    return parsed;
}

/**
 * Parse the EMF+ record stream carried by an EMR_GDICOMMENT payload.
 * @param {Uint8Array} data GDIComment record data (starts with the "EMF+" signature)
 * @returns {Array<{type: number, flags: number, data: Uint8Array}>}
 */
function parseEmfPlusStream(data) {
    return new EmfPlusParser(data).parseEmfPlusRecords(data);
}

/**
 * Replay EMF+ records into an existing drawer.
 * Record order is preserved: in "dual mode" files EMF and EMF+ records are
 * interleaved and share one device coordinate system, so playback must stay in
 * file order and on the same drawer instance (object table / state accumulate).
 * @param {any} drawer EmfPlusDrawer instance
 * @param {Array<{type: number, flags: number, data: Uint8Array}>} records
 */
function playEmfPlusRecords(drawer, records) {
    for (const rec of records) {
        drawer.processEmfPlusRecordType(rec.type, rec.flags, rec.data);
    }
}

/**
 * Render a nested metafile into an isolated SVG surface and return its node list
 * plus the source coordinate space, so the caller can embed it as a group.
 *
 * The nested image object is always decoded by the EMF drawer (historical
 * behaviour, see EmfPlusDrawer image objects).
 *
 * @param {Uint8Array} bytes nested metafile bytes
 * @returns {{nodes: string[], defs: string[], width: number, height: number}|null}
 *          null when the payload cannot be parsed or rendered
 */
function renderNestedToSvgNodes(bytes) {
    try {
        const parser = new MetafileParser(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        const result = parser.parse();
        if (!result || result.error || !result.records) return null;
        const subCtx = new SvgContext();
        createDrawer(FILE_TYPES.EMF, subCtx).draw(result, {
            viewWidth: DEFAULT_VIEW_WIDTH,
            viewHeight: DEFAULT_VIEW_HEIGHT
        });
        // Nested canvas size (bounds) as the source coordinate space. The header
        // is a union of WMF/EMF shapes; only the EMF bounds are of interest here.
        const header = /** @type {{bounds?: {left: number, top: number, right: number, bottom: number}}} */ (result.header);
        let W = DEFAULT_VIEW_WIDTH, H = DEFAULT_VIEW_HEIGHT;
        if (header && header.bounds) {
            W = Math.abs(header.bounds.right - header.bounds.left);
            H = Math.abs(header.bounds.bottom - header.bounds.top);
        }
        return { nodes: subCtx.nodes, defs: subCtx.defs, width: W || 1, height: H || 1 };
    } catch (e) {
        // Callers are EMF+ DrawImage handlers; wording kept for log continuity.
        console.log('EMF+ nested EMF render failed:', /** @type {Error} */ (e).message);
        return null;
    }
}

module.exports = {
    createDrawer,
    drawEmfBytes,
    parseEmfPlusStream,
    playEmfPlusRecords,
    renderNestedToSvgNodes
};
