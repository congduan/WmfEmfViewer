// WMF解析器模块
const BaseParser = require('./baseParser');

class WmfParser extends BaseParser {
    constructor(data) {
        super(data);
    }

    // 解析Placeable WMF文件头
    // 根据MS-WMF规范 2.3.2.1 META_PLACEABLE Record
    parsePlaceableHeader() {
        this.offset = 0;
        const placeableHeader = {
            key: this.readDword(),           // 0x9AC6CDD7
            handle: this.readWord(),         // 必须为0
            left: this.readShort(),          // 有符号16位整数
            top: this.readShort(),           // 有符号16位整数
            right: this.readShort(),         // 有符号16位整数
            bottom: this.readShort(),        // 有符号16位整数
            inch: this.readWord(),           // 逻辑单位数/英寸
            reserved: this.readDword(),      // 必须为0
            checksum: this.readWord()        // 校验和
        };

        // 验证Placeable WMF签名
        if (placeableHeader.key !== 0x9AC6CDD7) {
            console.warn('Invalid Placeable WMF key:', placeableHeader.key.toString(16));
        }

        return placeableHeader;
    }

    // 解析WMF文件头
    // 根据MS-WMF规范 2.3.2.2 META_HEADER Object
    parseWmfHeader() {
        const header = {
            type: this.readWord(),          // 文件类型: 1=内存, 2=磁盘
            headerSize: this.readWord(),    // 头部大小(WORDs): 固定为9
            version: this.readWord(),       // WMF版本
            size: this.readDword(),         // 文件大小(WORDs)
            numObjects: this.readWord(),    // 对象数量
            maxRecord: this.readDword(),    // 最大记录大小(WORDs)
            reserved: this.readWord()       // 保留字段，必须为0
        };

        // 验证headerSize字段（标准WMF头应该是9 WORDs = 18字节）
        const expectedHeaderSize = 9;
        if (header.headerSize !== expectedHeaderSize) {
            console.warn('Non-standard WMF header size:', header.headerSize, 'expected:', expectedHeaderSize);
        }

        return header;
    }

    // 解析WMF记录
    // 根据MS-WMF规范 2.3.1 WMF Records
    // 每条记录格式: Size(DWORD) + Function(WORD) + Parameters
    parseWmfRecord() {
        if (this.offset + 6 > this.data.length) {
            return null;
        }

        const recordStart = this.offset;
        const sizeInWords = this.readDword();  // 记录大小（WORDs）包括自身
        const functionId = this.readWord();    // 记录函数ID

        // 记录大小必须至少为3个WORD（6字节）
        if (sizeInWords < 3) {
            console.warn('Invalid WMF record size:', sizeInWords, 'at offset:', recordStart);
            return null;
        }

        // 计算参数数据大小: (总大小 - Size字段2WORDs - Function字段1WORD) * 2字节
        const dataSize = (sizeInWords - 3) * 2;
        
        // 检查数据是否超出文件范围
        if (this.offset + dataSize > this.data.length) {
            console.warn('WMF record data exceeds file length at offset:', recordStart);
            return null;
        }

        const recordData = this.readBytes(dataSize);

        return {
            size: sizeInWords,
            functionId,
            data: recordData
        };
    }

    // 解析完整的WMF文件
    parse(fileType) {
        try {
            console.log('Starting WMF parsing...');
            // 解析placeable WMF文件头（如果存在）
            let placeableHeader = null;
            if (fileType === 'placeable-wmf') {
                placeableHeader = this.parsePlaceableHeader();
                console.log('Placeable WMF Header:', placeableHeader);
            }

            // 解析标准WMF文件头（从当前offset开始）
            const startOffset = this.getOffset();
            const header = this.parseWmfHeader();
            console.log('WMF Header:', header);

            // 验证头信息
            if (!header || header.headerSize <= 0) {
                throw new Error('Invalid WMF header');
            }

            // 跳到第一个记录位置
            const targetOffset = startOffset + header.headerSize * 2;
            if (this.getOffset() < targetOffset) {
                console.log('Skipping extra bytes from', this.getOffset(), 'to', targetOffset);
                this.setOffset(targetOffset);
            }

            // 解析WMF记录
            const records = [];
            console.log('Starting WMF record parsing from offset:', this.getOffset(), 'total length:', this.data.length);
            let iterationCount = 0;
            while (this.getOffset() < this.data.length && iterationCount < 1000) {
                iterationCount++;
                try {
                    const record = this.parseWmfRecord();
                    if (record) {
                        records.push(record);
                        console.log('Parsed WMF record:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')', 'new offset:', this.getOffset());
                    } else {
                        console.log('No valid record at offset:', this.getOffset(), 'stopping');
                        break;
                    }
                } catch (error) {
                    console.warn('Error parsing WMF record at offset', this.getOffset(), ':', error.message);
                    this.setOffset(this.getOffset() + 2);
                }
            }
            console.log('Ended at offset:', this.getOffset(), 'parsed', records.length, 'records');

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
}

module.exports = WmfParser;