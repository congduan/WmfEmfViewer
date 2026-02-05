// 元文件解析器模块 - 整合所有模块化组件
const FileTypeDetector = require('./fileTypeDetector');
const WmfParser = require('./parsers/wmfParser');
const EmfParser = require('./parsers/emfParser');
const EmfPlusParser = require('./parsers/emfPlusParser');

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

module.exports = MetafileParser;