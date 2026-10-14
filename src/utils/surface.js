// Drawing-surface adaptation layer: the single place that talks to the host.
//
// Two responsibilities, both previously duplicated across the drawers:
//   1. Canvas setup (device pixel ratio, physical + CSS size, clearing, default
//      pen/brush) was copy-pasted in WmfDrawer / EmfDrawer / EmfPlusDrawer;
//   2. Bitmap landing (offscreen canvas detection + ImageData wrapping) was
//      duplicated in WmfDrawer and EmfDrawer.
// Drawers no longer read `window` or `document` directly; they go through here.

const DEFAULT_CANVAS_BACKGROUND = '#ffffff';

/**
 * Device pixel ratio of the current host (1 outside a browser).
 * This is the only remaining place that reads `window`.
 * @returns {number}
 */
function getDevicePixelRatio() {
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
}

/**
 * Size the backing store by DPR, keep the CSS size in logical pixels and scale
 * the context so that drawing code can work in logical coordinates.
 * @param {any} ctx
 * @param {number} canvasWidth logical width
 * @param {number} canvasHeight logical height
 * @param {number} [dpr] device pixel ratio, defaults to getDevicePixelRatio()
 * @returns {number} the DPR that was applied
 */
function applyCanvasSize(ctx, canvasWidth, canvasHeight, dpr = getDevicePixelRatio()) {
    ctx.canvas.width = Math.round(canvasWidth * dpr);
    ctx.canvas.height = Math.round(canvasHeight * dpr);
    // CSS display size (logical pixels)
    ctx.canvas.style.width = canvasWidth + 'px';
    ctx.canvas.style.height = canvasHeight + 'px';
    // Scale the context to match the device pixel ratio
    ctx.scale(dpr, dpr);
    console.log('Canvas size set to:', canvasWidth, 'x', canvasHeight, '(DPR:', dpr, ', actual:', ctx.canvas.width, 'x', ctx.canvas.height + ')');
    return dpr;
}

/**
 * Fill the whole surface with the background color.
 * @param {any} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {string} [color]
 */
function clearCanvas(ctx, canvasWidth, canvasHeight, color = DEFAULT_CANVAS_BACKGROUND) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    console.log('Canvas cleared');
}

/**
 * Apply the GDI default pen/brush state (BLACK_PEN stroke + WHITE_BRUSH fill).
 *
 * lineCap / lineJoin are only assigned when provided: WMF and EMF+ rely on the
 * context defaults, while EMF sets them explicitly for the default
 * PS_SOLID|PS_COSMETIC|PS_ENDCAP_ROUND|PS_JOIN_ROUND pen (all bits zero).
 *
 * @param {any} ctx
 * @param {{lineWidth: number, lineCap?: string, lineJoin?: string}} style
 */
function applyDefaultPenBrush(ctx, style) {
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = style.lineWidth;
    if (style.lineCap !== undefined) ctx.lineCap = style.lineCap;
    if (style.lineJoin !== undefined) ctx.lineJoin = style.lineJoin;
    console.log('Drawing styles set');
}

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
    getDevicePixelRatio,
    applyCanvasSize,
    clearCanvas,
    applyDefaultPenBrush,
    resolveTempCanvas,
    wrapImageData
};
