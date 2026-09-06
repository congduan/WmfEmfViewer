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
    window.MetafileParser = MetafileParser;
    window.FileTypeDetector = FileTypeDetector;
    window.CoordinateTransformer = CoordinateTransformer;
    window.MathTypeMtefParser = MathTypeMtefParser;
    window.GdiObjectManager = GdiObjectManager;
    window.BaseParser = BaseParser;
    window.WmfParser = WmfParser;
    window.EmfParser = EmfParser;
    window.EmfPlusParser = EmfPlusParser;
    window.BaseDrawer = BaseDrawer;
    window.WmfDrawer = WmfDrawer;
    window.EmfDrawer = EmfDrawer;
    window.EmfPlusDrawer = EmfPlusDrawer;
    window.SvgContext = SvgContext;
}
