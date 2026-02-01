// 打包脚本：将模块化代码合并为浏览器兼容的单文件版本
const fs = require('fs');
const path = require('path');

// 移除 Node.js 模块语法（require 和 module.exports）
function removeNodeModuleSyntax(content) {
    // 移除 require 语句
    content = content.replace(/^const\s+\w+\s*=\s*require\([^)]+\);?\s*$/gm, '');
    // 移除 module.exports 语句
    content = content.replace(/^module\.exports\s*=\s*\w+;?\s*$/gm, '');
    return content;
}

// 读取所有模块化文件并合并为一个浏览器兼容的文件
function buildBrowserBundle() {
    console.log('开始构建浏览器兼容的打包文件...');

    // 读取文件类型检测模块
    const fileTypeDetectorPath = path.join(__dirname, 'modules', 'fileTypeDetector.js');
    let fileTypeDetectorContent = fs.readFileSync(fileTypeDetectorPath, 'utf8');
    fileTypeDetectorContent = removeNodeModuleSyntax(fileTypeDetectorContent);

    // 读取坐标转换模块
    const coordinateTransformerPath = path.join(__dirname, 'modules', 'coordinateTransformer.js');
    let coordinateTransformerContent = fs.readFileSync(coordinateTransformerPath, 'utf8');
    coordinateTransformerContent = removeNodeModuleSyntax(coordinateTransformerContent);

    // 读取GDI对象管理器模块
    const gdiObjectManagerPath = path.join(__dirname, 'modules', 'gdiObjectManager.js');
    let gdiObjectManagerContent = fs.readFileSync(gdiObjectManagerPath, 'utf8');
    gdiObjectManagerContent = removeNodeModuleSyntax(gdiObjectManagerContent);

    // 读取基础解析器模块
    const baseParserPath = path.join(__dirname, 'modules', 'parsers', 'baseParser.js');
    let baseParserContent = fs.readFileSync(baseParserPath, 'utf8');
    baseParserContent = removeNodeModuleSyntax(baseParserContent);

    // 读取WMF解析器模块
    const wmfParserPath = path.join(__dirname, 'modules', 'parsers', 'wmfParser.js');
    let wmfParserContent = fs.readFileSync(wmfParserPath, 'utf8');
    wmfParserContent = removeNodeModuleSyntax(wmfParserContent);

    // 读取EMF解析器模块
    const emfParserPath = path.join(__dirname, 'modules', 'parsers', 'emfParser.js');
    let emfParserContent = fs.readFileSync(emfParserPath, 'utf8');
    emfParserContent = removeNodeModuleSyntax(emfParserContent);

    // 读取EMF+解析器模块
    const emfPlusParserPath = path.join(__dirname, 'modules', 'parsers', 'emfPlusParser.js');
    let emfPlusParserContent = fs.readFileSync(emfPlusParserPath, 'utf8');
    emfPlusParserContent = removeNodeModuleSyntax(emfPlusParserContent);

    // 读取基础绘制器模块
    const baseDrawerPath = path.join(__dirname, 'modules', 'drawers', 'baseDrawer.js');
    let baseDrawerContent = fs.readFileSync(baseDrawerPath, 'utf8');
    baseDrawerContent = removeNodeModuleSyntax(baseDrawerContent);

    // 读取WMF绘制器模块（使用新的drawers目录下的完整实现）
    const wmfDrawerPath = path.join(__dirname, 'modules', 'drawers', 'wmfDrawer.js');
    let wmfDrawerContent = fs.readFileSync(wmfDrawerPath, 'utf8');
    wmfDrawerContent = removeNodeModuleSyntax(wmfDrawerContent);

    // 读取EMF绘制器模块
    const emfDrawerPath = path.join(__dirname, 'modules', 'drawers', 'emfDrawer.js');
    let emfDrawerContent = fs.readFileSync(emfDrawerPath, 'utf8');
    emfDrawerContent = removeNodeModuleSyntax(emfDrawerContent);

    // 读取EMF+绘制器模块
    const emfPlusDrawerPath = path.join(__dirname, 'modules', 'drawers', 'emfPlusDrawer.js');
    let emfPlusDrawerContent = fs.readFileSync(emfPlusDrawerPath, 'utf8');
    emfPlusDrawerContent = removeNodeModuleSyntax(emfPlusDrawerContent);

    // 构建浏览器兼容的代码
    const browserBundle = `// WMF/EMF/EMF+解析器和绘制器 - 浏览器兼容版本
// 自动生成的打包文件，包含所有模块化组件

${fileTypeDetectorContent}

${coordinateTransformerContent}

${gdiObjectManagerContent}

${baseParserContent}

${wmfParserContent}

${emfParserContent}

${emfPlusParserContent}

${baseDrawerContent}

${wmfDrawerContent}

${emfDrawerContent}

${emfPlusDrawerContent}

// 元文件解析器 - 浏览器兼容版本
class MetafileParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector(data);
        this.fileType = this.fileTypeDetector.detect();
        console.log('Metafile Parser initialized with data length:', data.length, 'type:', this.fileType);
    }

    parse() {
        console.log('Starting', this.fileType.toUpperCase(), 'parsing...');

        try {
            switch (this.fileType) {
                case 'emf+':
                    return this.parseEmfPlus();
                case 'emf':
                    return this.parseEmf();
                case 'wmf':
                case 'placeable-wmf':
                    return this.parseWmf();
                default:
                    console.log('Unknown file type, trying all methods...');
                    const emfPlusResult = this.tryParseEmfPlus();
                    if (emfPlusResult && emfPlusResult.records.length > 0) {
                        return emfPlusResult;
                    }
                    const emfResult = this.tryParseEmf();
                    if (emfResult && emfResult.records.length > 0) {
                        return emfResult;
                    }
                    const wmfResult = this.tryParseWmf();
                    if (wmfResult && wmfResult.records.length > 0) {
                        return wmfResult;
                    }
                    throw new Error('Failed to parse file with any format');
            }
        } catch (error) {
            console.error('Parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    parseWmf() {
        const wmfParser = new WmfParser(this.data);
        return wmfParser.parse(this.fileType);
    }

    parseEmf() {
        const emfParser = new EmfParser(this.data);
        return emfParser.parse();
    }

    parseEmfPlus() {
        const emfPlusParser = new EmfPlusParser(this.data);
        return emfPlusParser.parse();
    }

    tryParseWmf() {
        try {
            const wmfParser = new WmfParser(this.data);
            return wmfParser.parse('wmf');
        } catch (error) {
            console.log('WMF parsing failed:', error.message);
            return null;
        }
    }

    tryParseEmf() {
        try {
            const emfParser = new EmfParser(this.data);
            return emfParser.parse();
        } catch (error) {
            console.log('EMF parsing failed:', error.message);
            return null;
        }
    }

    tryParseEmfPlus() {
        try {
            const emfPlusParser = new EmfPlusParser(this.data);
            return emfPlusParser.parse();
        } catch (error) {
            console.log('EMF+ parsing failed:', error.message);
            return null;
        }
    }
}

// 在浏览器环境中导出全局变量
if (typeof window !== 'undefined') {
    window.MetafileParser = MetafileParser;
    window.FileTypeDetector = FileTypeDetector;
    window.CoordinateTransformer = CoordinateTransformer;
    window.GdiObjectManager = GdiObjectManager;
    window.BaseParser = BaseParser;
    window.WmfParser = WmfParser;
    window.EmfParser = EmfParser;
    window.EmfPlusParser = EmfPlusParser;
    window.BaseDrawer = BaseDrawer;
    window.WmfDrawer = WmfDrawer;
    window.EmfDrawer = EmfDrawer;
    window.EmfPlusDrawer = EmfPlusDrawer;
}
`;

    // 写入打包文件
    const outputPath = path.join(__dirname, 'metafileParser.browser.js');
    fs.writeFileSync(outputPath, browserBundle);

    console.log('构建完成！打包文件已生成：', outputPath);
}

// 执行构建
if (require.main === module) {
    buildBrowserBundle();
}

module.exports = buildBrowserBundle;