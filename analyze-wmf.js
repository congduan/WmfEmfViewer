const fs = require('fs');
const path = require('path');
const WmfParser = require('./src/modules/parsers/wmfParser');
const FileTypeDetector = require('./src/modules/fileTypeDetector');

// 定义WMF函数ID到指令名称的映射
const wmfFunctionNames = {
    0x0000: 'EOF',
    0x0102: 'SETROP2',
    0x012c: 'SELECTCLIPREGION',
    0x012d: 'SELECTOBJECT',
    0x012e: 'SETTEXTALIGN',
    0x01f0: 'DELETEOBJECT',
    0x0201: 'SETBKCOLOR',
    0x0209: 'SETTEXTCOLOR',
    0x020b: 'SETWINDOWORG',
    0x020c: 'SETWINDOWEXT',
    0x020d: 'SETVIEWPORTORG',
    0x020e: 'SETVIEWPORTEXT',
    0x0213: 'LINETO',
    0x0214: 'MOVETO',
    0x0218: 'ELLIPSE',
    0x021a: 'ARCP',
    0x021b: 'CHORD',
    0x0220: 'RECTANGLE',
    0x0228: 'POLYGON',
    0x022d: 'POLYLINE',
    0x02fa: 'CREATEPENINDIRECT',
    0x02fb: 'CREATEFONTINDIRECT',
    0x02fc: 'CREATEBRUSHINDIRECT',
    0x0320: 'POLYPOLYGON',
    0x0303: 'SELECTCLIPRGN',
    0x0418: 'ELLIPSE',
    0x0419: 'FILLREGION',
    0x041b: 'RECTANGLE',
    0x061c: 'ROUNDRECT',
    0x0626: 'ESCAPE',
    0x0817: 'ARC',
    0x081a: 'PIE',
    0x0830: 'CHORD',
    0x0a32: 'EXTTEXTOUT'
};

// 解析image1.wmf文件
function analyzeWmfFile() {
    const filePath = path.join(__dirname, 'test_files', 'media', 'image1.wmf');
    
    try {
        // 读取文件数据
        const fileData = fs.readFileSync(filePath);
        console.log(`文件大小: ${fileData.length} 字节`);
        
        // 打印前16个字节，检查文件头
        console.log('前16个字节:', Array.from(fileData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // 检测文件类型
        // 从二进制内容看，前4个字节是0xD7 CD C6 9A，这是Placeable WMF的签名
        const fileType = 'placeable-wmf';
        console.log(`文件类型: ${fileType}`);
        
        // 使用Buffer对象的方法来读取数据
        console.log('Buffer前4个字节:', fileData[0], fileData[1], fileData[2], fileData[3]);
        
        // 创建Uint8Array
        const uint8Data = new Uint8Array(fileData.length);
        for (let i = 0; i < fileData.length; i++) {
            uint8Data[i] = fileData[i];
        }
        console.log('Uint8Array前4个字节:', uint8Data[0], uint8Data[1], uint8Data[2], uint8Data[3]);
        
        // 创建WMF解析器
        const parser = new WmfParser(uint8Data);
        
        // 解析文件
        const result = parser.parse(fileType);
        
        if (result.error) {
            console.error('解析错误:', result.error);
            return;
        }
        
        console.log('\n=== WMF文件头信息 ===');
        console.log('标准WMF头:', result.header);
        
        console.log('\n=== 绘图指令列表 ===');
        console.log('序号 | 函数ID | 指令名称 | 记录大小(WORDs) | 参数');
        console.log('--- | --- | --- | --- | ---');
        
        let index = 1;
        result.records.forEach(record => {
            const functionName = wmfFunctionNames[record.functionId] || `未知(0x${record.functionId.toString(16).padStart(4, '0')})`;
            let params = '';
            
            // 解析文字和line绘图指令的参数
            switch (record.functionId) {
                case 0x0213: // LINETO
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
                case 0x0214: // MOVETO
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
                case 0x0a32: // EXTTEXTOUT
                    if (record.data.length >= 8) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        const stringLength = (record.data[4] | (record.data[5] << 8));
                        const fwOpts = (record.data[6] | (record.data[7] << 8));
                        
                        let offset = 8;
                        const ETO_OPAQUE = 0x0002;
                        const ETO_CLIPPED = 0x0004;
                        if ((fwOpts & (ETO_OPAQUE | ETO_CLIPPED)) !== 0) {
                            offset += 8;
                        }
                        
                        let text = '';
                        if (offset + stringLength <= record.data.length) {
                            for (let i = 0; i < stringLength; i++) {
                                if (record.data[offset + i] !== 0) {
                                    text += String.fromCharCode(record.data[offset + i]);
                                }
                            }
                        }
                        params = `x: ${x}, y: ${y}, text: "${text}"`;
                    }
                    break;
                case 0x0626: // ESCAPE
                    if (record.data.length >= 8) {
                        const escapeFunction = (record.data[0] | (record.data[1] << 8));
                        const byteCount = (record.data[2] | (record.data[3] << 8));
                        
                        // 检查是否是MFCOMMENT (0x000F)
                        if (escapeFunction === 0x000F) {
                            // 检查offset 4是否有WMFC签名
                            if (record.data.length >= 12) {
                                const signature = String.fromCharCode(record.data[4], record.data[5], record.data[6], record.data[7]);
                                if (signature === 'WMFC') {
                                    params = `MFCOMMENT, WMFC signature found, byteCount: ${byteCount}`;
                                } else {
                                    params = `MFCOMMENT, signature: ${signature}, byteCount: ${byteCount}`;
                                }
                            } else {
                                params = `MFCOMMENT, byteCount: ${byteCount}, data length: ${record.data.length}`;
                            }
                        } else {
                            params = `escapeFunction: 0x${escapeFunction.toString(16).padStart(4, '0')}, byteCount: ${byteCount}`;
                        }
                    } else {
                        params = `data length: ${record.data.length}`;
                    }
                    break;
                case 0x0102: // SETROP2
                    if (record.data.length >= 2) {
                        const rop2 = (record.data[0] | (record.data[1] << 8));
                        // ROP2 模式映射
                        const rop2Modes = {
                            0x00: 'BLACKNESS',
                            0x01: 'NOTMERGEPEN',
                            0x02: 'MASKNOTPEN',
                            0x03: 'NOTCOPYPEN',
                            0x04: 'MASKPENNOT',
                            0x05: 'NOT',
                            0x06: 'XORPEN',
                            0x07: 'NOTMASKPEN',
                            0x08: 'MASKPEN',
                            0x09: 'NOTXORPEN',
                            0x0a: 'NOP',
                            0x0b: 'MERGENOTPEN',
                            0x0c: 'COPYPEN',
                            0x0d: 'MERGEPENNOT',
                            0x0e: 'MERGEPEN',
                            0x0f: 'WHITENESS'
                        };
                        const modeName = rop2Modes[rop2] || `0x${rop2.toString(16).padStart(2, '0')}`;
                        params = `mode: ${modeName} (0x${rop2.toString(16).padStart(2, '0')})`;
                    }
                    break;
                case 0x0107: // SETTEXTALIGN
                    if (record.data.length >= 2) {
                        const align = (record.data[0] | (record.data[1] << 8));
                        // TEXTALIGN 标志
                        const flags = [];
                        if (align & 0x0001) flags.push('TA_LEFT');
                        if (align & 0x0002) flags.push('TA_RIGHT');
                        if (align & 0x0004) flags.push('TA_CENTER');
                        if (align & 0x0008) flags.push('TA_TOP');
                        if (align & 0x0010) flags.push('TA_BOTTOM');
                        if (align & 0x0020) flags.push('TA_BASELINE');
                        if (align & 0x0040) flags.push('TA_RTLREADING');
                        if (align & 0x0080) flags.push('TA_NOUPDATECP');
                        if (align & 0x0100) flags.push('TA_UPDATECP');
                        
                        const flagsStr = flags.length > 0 ? flags.join(' | ') : '无标志';
                        params = `align: 0x${align.toString(16).padStart(4, '0')}, flags: ${flagsStr}`;
                    }
                    break;
                case 0x020b: // SETWINDOWORG
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
                case 0x020c: // SETWINDOWEXT
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
                case 0x020d: // SETVIEWPORTORG
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
                case 0x020e: // SETVIEWPORTEXT
                    if (record.data.length >= 4) {
                        const y = (record.data[0] | (record.data[1] << 8));
                        const x = (record.data[2] | (record.data[3] << 8));
                        params = `x: ${x}, y: ${y}`;
                    }
                    break;
            }
            
            console.log(`${index.toString().padStart(3)} | 0x${record.functionId.toString(16).padStart(4, '0')} | ${functionName} | ${record.size} | ${params}`);
            index++;
        });
        
        console.log(`\n总计解析到 ${result.records.length} 条指令`);
        
    } catch (error) {
        console.error('分析错误:', error.message);
    }
}

// 运行分析
analyzeWmfFile();
