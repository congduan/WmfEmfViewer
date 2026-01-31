// 元文件解析器模块 - 整合所有模块化组件
const FileTypeDetector = require('./fileTypeDetector');
const RecordParser = require('./recordParser');

class MetafileParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.fileTypeDetector = new FileTypeDetector(data);
        this.recordParser = new RecordParser(data);
        this.fileType = this.fileTypeDetector.detect();
        console.log('Metafile Parser initialized with data length:', data.length, 'type:', this.fileType);
    }

    parse() {
        console.log('Starting', this.fileType.toUpperCase(), 'parsing...');

        try {
            if (this.fileType === 'emf') {
                const emfResult = this.parseEmf();
                if (emfResult && emfResult.records.length > 0) {
                    return emfResult;
                } else {
                    console.log('EMF parsing failed, trying WMF parsing...');
                    this.recordParser.reset();
                    return this.parseWmf();
                }
            } else if (this.fileType === 'wmf' || this.fileType === 'placeable-wmf') {
                return this.parseWmf();
            } else {
                console.log('Unknown file type, trying both methods...');
                this.recordParser.reset();
                const emfResult = this.tryParseEmf();
                if (emfResult && emfResult.records.length > 0) {
                    return emfResult;
                }
                this.recordParser.reset();
                return this.parseWmf();
            }
        } catch (error) {
            console.error('Parsing error:', error.message);
            try {
                this.recordParser.reset();
                return this.parseWmf();
            } catch (wmfError) {
                return {
                    header: null,
                    records: [],
                    error: error.message
                };
            }
        }
    }

    parseEmf() {
        try {
            // 解析EMF文件头
            const header = this.recordParser.parseEmfHeader();
            
            // 验证头信息
            if (!header || header.nSize <= 0) {
                throw new Error('Invalid EMF header');
            }

            // 跳过EMF文件头
            this.recordParser.setOffset(header.nSize);

            // 解析EMF记录
            const records = [];
            let recordCount = 0;
            
            while (this.recordParser.getOffset() < this.data.length && recordCount < header.nRecords) {
                try {
                    const record = this.recordParser.parseEmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed EMF record:', record.type, '(0x' + record.type.toString(16).padStart(8, '0') + ')');
                        recordCount++;
                    } else {
                        console.warn('Failed to parse EMF record at offset:', this.recordParser.getOffset());
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing EMF record:', error.message);
                    // 跳过错误记录，继续解析下一条
                    this.recordParser.setOffset(this.recordParser.getOffset() + 8); // 至少跳过记录头
                }
            }

            console.log('Total EMF records parsed:', records.length);
            return { header, records };
        } catch (error) {
            console.error('EMF parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    parseWmf() {
        try {
            console.log('Starting WMF parsing...');
            // 解析placeable WMF文件头（如果存在）
            let placeableHeader = null;
            if (this.fileType === 'placeable-wmf') {
                placeableHeader = this.recordParser.parsePlaceableHeader();
                console.log('Placeable WMF Header:', placeableHeader);
            }

            // 解析标准WMF文件头（从当前offset开始）
            const startOffset = this.recordParser.getOffset();
            const header = this.recordParser.parseWmfHeader();
            console.log('WMF Header:', header);

            // 验证头信息
            if (!header || header.headerSize <= 0) {
                throw new Error('Invalid WMF header');
            }

            // 跳到第一个记录位置（WMF头部 + headerSize指定了头部区域）
            // 对于placeable WMF，可能存在额外对齐字节
            const targetOffset = startOffset + header.headerSize * 2;
            if (this.recordParser.getOffset() < targetOffset) {
                console.log('Skipping extra bytes from', this.recordParser.getOffset(), 'to', targetOffset);
                this.recordParser.setOffset(targetOffset);
            }

            // 解析WMF记录
            const records = [];
            console.log('Starting WMF record parsing from offset:', this.recordParser.getOffset(), 'total length:', this.data.length);
            let iterationCount = 0;
            while (this.recordParser.getOffset() < this.data.length && iterationCount < 1000) {
                iterationCount++;
                try {
                    const record = this.recordParser.parseWmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed WMF record:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')', 'new offset:', this.recordParser.getOffset());
                    } else {
                        console.log('No valid record at offset:', this.recordParser.getOffset(), 'stopping');
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing WMF record at offset', this.recordParser.getOffset(), ':', error.message);
                    this.recordParser.setOffset(this.recordParser.getOffset() + 2);
                }
            }
            console.log('Ended at offset:', this.recordParser.getOffset(), 'parsed', records.length, 'records');

            console.log('Total WMF records parsed:', records.length);
            return { header: { ...header, placeableHeader }, records };
        } catch (error) {
            console.error('WMF parsing error:', error.message);
            return {
                header: null,
                records: [],
                error: error.message
            };
        }
    }

    tryParseEmf() {
        try {
            // 尝试解析为EMF
            const emfHeader = this.recordParser.parseEmfHeader();
            if (emfHeader && emfHeader.nSize > 0 && emfHeader.nRecords > 0) {
                // 成功解析EMF头，继续解析记录
                return this.parseEmf();
            }
        } catch (error) {
            console.log('EMF parsing failed:', error.message);
        }
        return null;
    }
}

module.exports = MetafileParser;