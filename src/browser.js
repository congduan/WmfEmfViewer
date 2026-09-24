// 浏览器 bundle 入口：由 esbuild 以 IIFE 格式打包（scripts/build-bundles.js）。
// 产物挂载与旧拼接式 bundle 完全相同的全局变量，webview.html / website 依赖这些全局。
const FileTypeDetector = require('./utils/fileTypeDetector');
const CoordinateTransformer = require('./utils/coordinateTransformer');
const MathTypeMtefParser = require('./utils/mathTypeMtefParser');
const GdiObjectManager = require('./utils/gdiObjectManager');
const BaseParser = require('./modules/parsers/baseParser');
const WmfParser = require('./modules/parsers/wmfParser');
const EmfParser = require('./modules/parsers/emfParser');
const EmfPlusParser = require('./modules/parsers/emfPlusParser');
const BaseDrawer = require('./modules/drawers/baseDrawer');
const WmfDrawer = require('./modules/drawers/wmfDrawer');
const EmfDrawer = require('./modules/drawers/emfDrawer');
const EmfPlusDrawer = require('./modules/drawers/emfPlusDrawer');
const SvgContext = require('./modules/svgContext');
const MetafileParser = require('./utils/metafileParser');

// 在浏览器环境中导出全局变量
if (typeof window !== 'undefined') {
    // window 上的自定义全局由本 bundle 约定产生，用断言声明以免 TS 报未知属性
    const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
    g.MetafileParser = MetafileParser;
    g.FileTypeDetector = FileTypeDetector;
    g.CoordinateTransformer = CoordinateTransformer;
    g.MathTypeMtefParser = MathTypeMtefParser;
    g.GdiObjectManager = GdiObjectManager;
    g.BaseParser = BaseParser;
    g.WmfParser = WmfParser;
    g.EmfParser = EmfParser;
    g.EmfPlusParser = EmfPlusParser;
    g.BaseDrawer = BaseDrawer;
    g.WmfDrawer = WmfDrawer;
    g.EmfDrawer = EmfDrawer;
    g.EmfPlusDrawer = EmfPlusDrawer;
    g.SvgContext = SvgContext;
}
