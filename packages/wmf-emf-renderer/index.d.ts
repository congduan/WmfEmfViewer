// Type definitions for wmf-emf-renderer

/** Detected metafile format. */
export type MetafileFileType = 'wmf' | 'placeable-wmf' | 'emf' | 'emf+' | 'unknown';

/** A single parsed metafile record. Structure varies by record type. */
export interface MetafileRecord {
    type: number;
    size?: number;
    name?: string;
    functionName?: string;
    data?: Uint8Array;
    [key: string]: any;
}

/** A placeable WMF (aldus) header, if present. */
export interface PlaceableHeader {
    key: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    inch: number;
}

/** Metafile header (WMF header or EMF header). */
export interface MetafileHeader {
    placeableHeader?: PlaceableHeader;
    bounds?: { left: number; top: number; right: number; bottom: number };
    frame?: { left: number; top: number; right: number; bottom: number };
    [key: string]: any;
}

/** Result of parsing a metafile. */
export interface ParseResult {
    /** Format used for parsing (set by parseMetafile). */
    fileType?: MetafileFileType;
    header: MetafileHeader | null;
    records: MetafileRecord[];
    /** Present when parsing failed. */
    error?: string;
}

/** Options controlling output size / fitting behaviour. */
export interface RenderOptions {
    /** Available viewport width in px (default 800). */
    viewWidth?: number;
    /** Available viewport height in px (default 600). */
    viewHeight?: number;
}

/** Metadata returned after rendering to a context. */
export interface RenderResult {
    width: number;
    height: number;
    fileType: MetafileFileType;
}

/** Any CanvasRenderingContext2D-compatible drawing context. */
export type CanvasLikeContext = any;

/**
 * Detect the metafile format of binary data.
 * Accepts Uint8Array, ArrayBuffer, or number[].
 */
export function detectFileType(data: Uint8Array | ArrayBuffer | number[]): MetafileFileType;

/**
 * Parse a WMF/EMF/EMF+ metafile into header + records (no rendering).
 * Never throws; failures are reported via the `error` field.
 */
export function parseMetafile(data: Uint8Array | ArrayBuffer | number[]): ParseResult;

/**
 * Render a metafile to a complete SVG document string.
 * Works in Node.js and browsers. Never touches the DOM.
 * @example
 * const svg = renderToSvg(fs.readFileSync('chart.wmf'), { viewWidth: 1024, viewHeight: 768 });
 */
export function renderToSvg(
    data: Uint8Array | ArrayBuffer | number[],
    options?: RenderOptions
): string;

/**
 * Render a metafile onto a Canvas 2D context (browser canvas, node-canvas, or
 * any compatible implementation). The canvas is resized automatically.
 * @returns final pixel dimensions and detected file type
 */
export function renderToContext(
    data: Uint8Array | ArrayBuffer | number[],
    ctx: CanvasLikeContext,
    options?: RenderOptions
): RenderResult;

/**
 * Create the format-appropriate drawer bound to a Canvas 2D-compatible context,
 * for advanced/custom rendering flows (call `drawer.draw(parseResult, options)`).
 */
export function createDrawer(ctx: CanvasLikeContext, fileType: MetafileFileType): BaseDrawer;

/** Enable verbose parser/drawer logging (default: off). */
export function setDebugEnabled(enabled: boolean): void;

// ---- class exports (advanced usage) ----

export declare class MetafileParser {
    fileType: MetafileFileType;
    constructor(data: Uint8Array | ArrayBuffer | number[]);
    parse(): ParseResult;
    parseWmf(): ParseResult;
    parseEmf(): ParseResult;
    parseEmfPlus(): ParseResult;
}

export declare class FileTypeDetector {
    constructor(data: Uint8Array | ArrayBuffer | number[]);
    detect(): MetafileFileType;
}

export declare class BaseParser {
    constructor(data: Uint8Array);
    parse(fileType?: string): ParseResult;
}

export declare class WmfParser extends BaseParser {}
export declare class EmfParser extends BaseParser {}
export declare class EmfPlusParser extends BaseParser {}

export declare class BaseDrawer {
    constructor(ctx: CanvasLikeContext);
    draw(metafileData: ParseResult, options?: RenderOptions): void;
    initCanvas(metafileData: ParseResult, options?: RenderOptions): void;
}

export declare class WmfDrawer extends BaseDrawer {}
export declare class EmfDrawer extends BaseDrawer {}
export declare class EmfPlusDrawer extends BaseDrawer {}

/** Canvas2D-compatible context that serializes drawing commands to SVG. */
export declare class SvgContext {
    canvas: { width: number; height: number; style: any };
    constructor();
    /** Serialize everything drawn so far into a complete SVG document. */
    getSvg(): string;
}

export declare class CoordinateTransformer {
    setWindowOrg(x: number, y: number): void;
    setWindowExt(w: number, h: number): void;
    setViewportOrg(x: number, y: number): void;
    setViewportExt(w: number, h: number): void;
    toViewportX(x: number): number;
    toViewportY(y: number): number;
    [key: string]: any;
}

export declare class GdiObjectManager {
    constructor();
    [key: string]: any;
}

export declare class MathTypeMtefParser {
    constructor(...args: any[]);
    [key: string]: any;
}
