// Bitmap landing helpers: hand an already decoded RGBA bitmap to a drawing context.
//
// Background: bitmaps inside metafiles must look the same on two backends:
//   - browser / node-canvas: ctx is a real CanvasRenderingContext2D, so scaling
//     needs an offscreen canvas + putImageData + drawImage;
//   - SvgContext: putImageData emits an <image> directly and SVG does the scaling.
// The host detection used to be duplicated in WmfDrawer and EmfDrawer (including
// the `canvasCtor.name !== 'Object'` trick that skips SvgContext's mock canvas);
// it lives here as the single implementation.
//
// Note: this module only does the landing, not the pixel decoding. WMF and EMF
// DIB decoding differ in semantics (whether the palette reserved byte is alpha,
// RLE support, pixel caps), so each decoder stays in its own drawer, see the
// comments on those implementations.

/**
 * Create an offscreen canvas used as a bitmap staging area.
 *
 * Three hosts:
 *   1. document available (browser/webview): document.createElement('canvas');
 *   2. no document, but ctx.canvas uses a real canvas constructor (node-canvas):
 *      new Ctor(width, height);
 *   3. mocks such as SvgContext (constructor is Object): return null so callers
 *      fall back to putImageData.
 *
 * @param {any} ctx target drawing context
 * @param {number} width
 * @param {number} height
 * @returns {any|null} canvas, or null when it cannot be created
 */
function resolveTempCanvas(ctx, width, height) {
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    const canvasCtor = ctx && ctx.canvas ? ctx.canvas.constructor : null;
    const isRealCanvasCtor = typeof canvasCtor === 'function' && canvasCtor.name !== 'Object';
    if (!isRealCanvasCtor) return null;
    return new canvasCtor(width, height);
}

/**
 * Wrap a `{ width, height, data }` bitmap into something ctx.putImageData accepts.
 * Browsers get a real ImageData; otherwise it degrades to a structurally
 * compatible plain object (SvgContext.putImageData only reads width/height/data).
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} bitmap
 *        both DIB decoders produce Uint8ClampedArray (see _decodeDib / renderDib)
 * @returns {any}
 */
function wrapImageData(bitmap) {
    if (typeof ImageData !== 'undefined') {
        try {
            return new ImageData(bitmap.data, bitmap.width, bitmap.height);
        } catch (e) { /* degrade to a plain object */ }
    }
    return { width: bitmap.width, height: bitmap.height, data: bitmap.data };
}

module.exports = {
    resolveTempCanvas,
    wrapImageData
};
