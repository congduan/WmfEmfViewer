// wmf-emf-renderer - ESM entry (thin re-export of the CommonJS implementation)
import lib from './index.js';

export const detectFileType = lib.detectFileType;
export const parseMetafile = lib.parseMetafile;
export const renderToSvg = lib.renderToSvg;
export const renderToContext = lib.renderToContext;
export const createDrawer = lib.createDrawer;
export const setDebugEnabled = lib.setDebugEnabled;

export const MetafileParser = lib.MetafileParser;
export const FileTypeDetector = lib.FileTypeDetector;
export const BaseParser = lib.BaseParser;
export const WmfParser = lib.WmfParser;
export const EmfParser = lib.EmfParser;
export const EmfPlusParser = lib.EmfPlusParser;

export const BaseDrawer = lib.BaseDrawer;
export const WmfDrawer = lib.WmfDrawer;
export const EmfDrawer = lib.EmfDrawer;
export const EmfPlusDrawer = lib.EmfPlusDrawer;
export const SvgContext = lib.SvgContext;

export const CoordinateTransformer = lib.CoordinateTransformer;
export const GdiObjectManager = lib.GdiObjectManager;
export const MathTypeMtefParser = lib.MathTypeMtefParser;

export default lib;
