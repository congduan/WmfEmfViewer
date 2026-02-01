// WMF绘制模块
const BaseDrawer = require('./baseDrawer');
const EmfPlusDrawer = require('./emfPlusDrawer');

class WmfDrawer extends BaseDrawer {
    constructor(ctx) {
        super(ctx);
        this.emfPlusDetected = false;
        this.emfPlusRecordCount = 0;
        this.emfPlusRecords = []; // 存储解析出的 EMF+ 记录
        this.emfPlusDrawer = null; // EMF+ 绘制器
        this.currentPosX = 0; // 当前画笔位置 X
        this.currentPosY = 0; // 当前画笔位置 Y
        this.hasValidPosition = false; // 标记是否有有效的当前位置
    }

    draw(metafileData) {
        console.log('Drawing WMF with header:', metafileData.header);
        console.log('Number of records:', metafileData.records.length);

        // 保存header信息，用于字体大小计算
        this.header = metafileData.header;

        // 初始化画布
        this.initCanvas(metafileData);

        // 启用 EMF+ Dual 检测，某些文件包含EMF+数据
        const enableEmfPlusDual = true;
        
        if (enableEmfPlusDual) {
            // 第一遍：扫描并收集所有 WMFC 数据块
            const wmfcBlocks = [];
            for (let i = 0; i < metafileData.records.length; i++) {
                const record = metafileData.records[i];
                if (record.functionId === 0x0626) { // META_ESCAPE
                    const wmfcData = this.extractWmfcData(record);
                    if (wmfcData) {
                        wmfcBlocks.push(wmfcData);
                    }
                }
            }

            // 如果找到 WMFC 数据，尝试重组为完整的 EMF 文件
            if (wmfcBlocks.length > 0) {
                console.log('检测到 EMF+ Dual 格式');
                console.log('WMFC 数据块数:', wmfcBlocks.length);
                
                // 重组完整的 EMF 数据
                const emfData = this.reconstructEmfData(wmfcBlocks);
                
                if (emfData && emfData.length > 0) {
                    console.log('EMF 数据重组完成，大小:', (emfData.length / 1024).toFixed(2), 'KB');
                    
                    // 使用 EMF 解析器解析
                    try {
                        // 兼容 Node.js 和浏览器环境
                        let EmfParser, EmfDrawer;
                        if (typeof require !== 'undefined') {
                            // Node.js 环境
                            EmfParser = require('../parsers/emfParser');
                            EmfDrawer = require('./emfDrawer');
                        } else if (typeof window !== 'undefined') {
                            // 浏览器环境 - 使用全局类
                            EmfParser = window.EmfParser;
                            EmfDrawer = window.EmfDrawer;
                        } else {
                            throw new Error('Unsupported environment');
                        }
                        
                        const emfParser = new EmfParser(emfData);
                        const emfParsedData = emfParser.parse();
                        
                        console.log('EMF 解析完成，记录数:', emfParsedData.records.length);
                        
                        // 使用 EMF 绘制器渲染
                        const emfDrawer = new EmfDrawer(this.ctx);
                        emfDrawer.draw(emfParsedData);
                        
                        // 设置标志
                        this.emfPlusDetected = true;
                        this.emfPlusRecordCount = emfParsedData.records.length;
                        
                        console.log('✅ EMF+ Dual 格式渲染完成');
                        return;
                    } catch (error) {
                        console.error('EMF 解析/绘制失败:', error);
                        // 继续使用标准 WMF 渲染
                    }
                }
            }
        }

        // 使用标准 WMF 绘制
        console.log('使用标准 WMF 渲染');
        for (let i = 0; i < metafileData.records.length; i++) {
            const record = metafileData.records[i];
            console.log('Processing WMF record', i, ':', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
            this.processRecord(record);
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('WMF drawing completed');
    }
    
    // 从 ESCAPE 记录中提取 WMFC 数据
    extractWmfcData(record) {
        const data = record.data;
        if (data.length < 8) return null;
        
        const escapeFunction = this.readWordFromData(data, 0);
        
        // MFCOMMENT (0x000F)
        if (escapeFunction !== 0x000F) return null;
        
        // 检查 offset 4 是否有 WMFC 签名
        const signature = String.fromCharCode(data[4], data[5], data[6], data[7]);
        
        if (signature === 'WMFC') {
            // WMFC 块结构：
            // 0-1: Escape Function (0x000F)
            // 2-3: Byte Count
            // 4-7: "WMFC"
            // 8-11: Comment Identifier (0x00000001)
            // 12-15: Comment Type (0x00010000)
            // 16-27: 其他元数据
            // 28+: 实际 EMF 数据
            
            // 检查是否包含 EMF Header (第一个块)
            for (let testOffset = 20; testOffset < Math.min(50, data.length - 50); testOffset++) {
                const type = this.readDwordFromData(data, testOffset);
                if (type === 1) {
                    // 验证 EMF 签名
                    const sigOffset = testOffset + 40;
                    if (sigOffset + 4 <= data.length) {
                        if (data[sigOffset] === 0x20 && data[sigOffset+1] === 0x45 &&
                            data[sigOffset+2] === 0x4D && data[sigOffset+3] === 0x46) {
                            console.log('找到 EMF Header at offset', testOffset);
                            return data.slice(testOffset);
                        }
                    }
                }
            }
            
            // 后续块：直接从 offset 28 提取到末尾
            // WMF record 的 data 字段已经去掉了 WMF 记录头（size + function）
            // 所以这里的 data 就是 ESCAPE 记录的参数部分
            if (data.length > 28) {
                return data.slice(28);
            }
        }
        
        return null;
    }
    
    // 重组所有 WMFC 块为完整的 EMF 数据
    reconstructEmfData(wmfcBlocks) {
        try {
            // 每个 WMFC 块可能包含 EMF 文件的一部分
            // 第一个块通常包含 EMF 文件头
            
            // 简单策略：连接所有块的数据
            let totalLength = 0;
            wmfcBlocks.forEach(block => {
                totalLength += block.length;
            });
            
            console.log('重组 EMF 数据，总长度:', totalLength, '字节');
            
            // 创建完整的 EMF 数据数组
            const emfData = new Uint8Array(totalLength);
            let offset = 0;
            
            for (let i = 0; i < wmfcBlocks.length; i++) {
                emfData.set(wmfcBlocks[i], offset);
                offset += wmfcBlocks[i].length;
            }
            
            return emfData;
        } catch (error) {
            console.error('EMF 数据重组失败:', error);
            return null;
        }
    }
    
    processRecord(record) {
        // 根据MS-WMF规范2.3.1的函数ID处理不同的WMF命令
        // 函数ID格式: 高字节为类别，低字节为功能
        switch (record.functionId) {
            case 0x0000: // META_EOF - End of File
                console.log('WMF End of File record');
                break;
                
            // ========== 状态记录 (State Records) ==========
            case 0x0103: // META_SETMAPMODE
                this.processSetMapMode(record.data);
                break;
            case 0x020B: // META_SETWINDOWORG
                this.processSetWindowOrg(record.data);
                break;
            case 0x020C: // META_SETWINDOWEXT
                this.processSetWindowExt(record.data);
                break;
            case 0x020D: // META_SETVIEWPORTORG
                this.processSetViewportOrg(record.data);
                break;
            case 0x020E: // META_SETVIEWPORTEXT
                this.processSetViewportExt(record.data);
                break;
            case 0x0201: // META_SETBKCOLOR
                this.processSetBkColor(record.data);
                break;
            case 0x0102: // META_SETBKMODE
                this.processSetBkMode(record.data);
                break;
            case 0x0209: // META_SETTEXTCOLOR
                this.processSetTextColor(record.data);
                break;
            case 0x0104: // META_SETROP2
                this.processSetROP2(record.data);
                break;
            case 0x0106: // META_SETPOLYFILLMODE
                this.processSetPolyFillMode(record.data);
                break;
            case 0x0107: // META_SETSTRETCHBLTMODE
                this.processSetStretchBltMode(record.data);
                break;
            case 0x0302: // META_SETTEXTALIGN
                this.processSetTextAlign(record.data);
                break;
                
            // ========== 对象创建记录 (Object Creation Records) ==========
            case 0x02FA: // META_CREATEPENINDIRECT
                this.processCreatePenIndirect(record.data);
                break;
            case 0x02FC: // META_CREATEBRUSHINDIRECT
                this.processCreateBrushIndirect(record.data);
                break;
            case 0x02FB: // META_CREATEFONTINDIRECT
                this.processCreateFontIndirect(record.data);
                break;
            case 0x012E: // META_SELECTCLIPRGN
                this.processSelectClipRgn(record.data);
                break;
            case 0x00F8: // META_CREATEPALETTE
                this.processCreatePalette(record.data);
                break;
            case 0x01F9: // META_CREATEPATTERNBRUSH
                this.processCreatePatternBrush(record.data);
                break;
            case 0x00F7: // META_CREATEREGION
                this.processCreateRegion(record.data);
                break;
                
            // ========== 对象选择/删除记录 ==========
            case 0x012D: // META_SELECTOBJECT
                this.processSelectObject(record.data);
                break;
            case 0x01F0: // META_DELETEOBJECT
                this.processDeleteObject(record.data);
                break;
                
            // ========== 绘图记录 (Drawing Records) ==========
            case 0x0213: // META_MOVETO (旧版) 或 0x0214 META_LINETO
                this.processMoveTo(record.data);
                break;
            case 0x0214: // META_LINETO
                this.processLineTo(record.data);
                break;
            case 0x041B: // META_RECTANGLE
                this.processRectangle(record.data);
                break;
            case 0x061C: // META_ROUNDRECT
                this.processRoundRect(record.data);
                break;
            case 0x0418: // META_ELLIPSE
                this.processEllipse(record.data);
                break;
            case 0x0817: // META_ARC
                this.processArc(record.data);
                break;
            case 0x081A: // META_PIE
                this.processPie(record.data);
                break;
            case 0x0830: // META_CHORD
                this.processChord(record.data);
                break;
            case 0x0325: // META_POLYLINE
                this.processPolyline(record.data);
                break;
            case 0x0324: // META_POLYGON
                this.processPolygon(record.data);
                break;
            case 0x0538: // META_POLYPOLYGON
                this.processPolyPolygon(record.data);
                break;
                
            // ========== 文本记录 ==========
            case 0x0521: // META_TEXTOUT
                this.processTextOut(record.data);
                break;
            case 0x0A32: // META_EXTTEXTOUT
                this.processExtTextOut(record.data);
                break;
            case 0x0626: // META_ESCAPE
                this.processEscape(record.data);
                break;
                
            // ========== 位图操作记录 ==========
            case 0x0940: // META_DIBBITBLT
                this.processDibBitBlt(record.data);
                break;
            case 0x0B41: // META_DIBSTRETCHBLT
                this.processDibStretchBlt(record.data);
                break;
            case 0x0F43: // META_STRETCHDIB
                this.processStretchDib(record.data);
                break;
                
            // ========== 填充记录 ==========
            case 0x0419: // META_FILLREGION
                this.processFillRgn(record.data);
                break;
            case 0x0416: // META_FLOODFILL
                this.processFloodFill(record.data);
                break;
            case 0x0228: // META_FILLPOLYGON (非标准)
                this.processPolygon(record.data);
                break;
                
            // ========== 状态管理 ==========
            case 0x001E: // META_SAVEDC
                this.processSaveDC(record.data);
                break;
            case 0x0127: // META_RESTOREDC
                this.processRestoreDC(record.data);
                break;
                
            default:
                console.log('Unknown/Unimplemented WMF function:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
                break;
        }
    }

    // ========== 辅助方法 ==========
    readWordFromData(data, offset) {
        if (offset + 1 >= data.length) return 0;
        return data[offset] | (data[offset + 1] << 8);
    }

    readDwordFromData(data, offset) {
        if (offset + 3 >= data.length) return 0;
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    }

    readStringFromData(data, offset, length) {
        let str = '';
        for (let i = 0; i < length && offset + i < data.length; i++) {
            if (data[offset + i] !== 0) {
                str += String.fromCharCode(data[offset + i]);
            }
        }
        return str;
    }

    rgbToHex(rgb) {
        const r = (rgb & 0xFF).toString(16).padStart(2, '0');
        const g = ((rgb >> 8) & 0xFF).toString(16).padStart(2, '0');
        const b = ((rgb >> 16) & 0xFF).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // ========== 实现绘制方法 ==========
    processSetMapMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetMapMode:', mode);
        this.coordinateTransformer.setMapMode(mode);
    }

    processSetWindowOrg(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetWindowOrg:', x, y);
        this.coordinateTransformer.setWindowOrg(x, y);
    }

    processSetWindowExt(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetWindowExt:', x, y);
        this.coordinateTransformer.setWindowExt(x, y);
    }

    processSetViewportOrg(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetViewportOrg:', x, y);
        this.coordinateTransformer.setViewportOrg(x, y);
    }

    processSetViewportExt(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        console.log('SetViewportExt:', x, y);
        this.coordinateTransformer.setViewportExt(x, y);
    }

    processSetBkColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        console.log('SetBkColor:', color);
    }

    processSetBkMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetBkMode:', mode);
    }

    processSetTextColor(data) {
        if (data.length < 4) return;
        const color = this.readDwordFromData(data, 0);
        console.log('SetTextColor:', color);
        this.ctx.fillStyle = this.rgbToHex(color);
    }

    processSetROP2(data) {
        if (data.length < 2) return;
        const rop2 = this.readWordFromData(data, 0);
        console.log('SetROP2:', rop2);
    }

    processSetPolyFillMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetPolyFillMode:', mode);
    }

    processSetStretchBltMode(data) {
        if (data.length < 2) return;
        const mode = this.readWordFromData(data, 0);
        console.log('SetStretchBltMode:', mode);
    }

    processSetTextAlign(data) {
        if (data.length < 2) return;
        const align = this.readWordFromData(data, 0);
        console.log('SetTextAlign:', align);
    }

    processCreatePenIndirect(data) {
        if (data.length < 10) return;
        const style = this.readWordFromData(data, 0);
        const originalWidth = this.readWordFromData(data, 2);
        let width = originalWidth;
        const color = this.readDwordFromData(data, 6);
        
        // 使用坐标转换器的缩放比例来计算线条像素宽度
        const scale = this.coordinateTransformer.getScale();
        width = Math.max(1, Math.round(width * scale.x));
        console.log('Pen width conversion:', originalWidth, 'logical units ->', width, 'pixels (scale:', scale.x, ')');
        
        console.log('CreatePenIndirect:', style, width, color);
        const penColor = this.rgbToHex(color);
        this.gdiObjectManager.createPen(style, width, penColor);
    }

    processCreateBrushIndirect(data) {
        if (data.length < 8) return;
        const style = this.readWordFromData(data, 0);
        const color = this.readDwordFromData(data, 2);
        console.log('CreateBrushIndirect:', style, color);
        const brushColor = this.rgbToHex(color);
        this.gdiObjectManager.createBrush(style, brushColor);
    }
    
    processCreateFontIndirect(data) {
        // META_CREATEFONTINDIRECT 结构 (MS-WMF 2.3.3.4):
        // Height (2 bytes) - 有符号整数
        // Width (2 bytes)
        // Escapement (2 bytes)
        // Orientation (2 bytes)
        // Weight (2 bytes)
        // Italic (1 byte)
        // Underline (1 byte)
        // StrikeOut (1 byte)
        // CharSet (1 byte)
        // OutPrecision (1 byte)
        // ClipPrecision (1 byte)
        // Quality (1 byte)
        // PitchAndFamily (1 byte)
        // Facename (variable, null-terminated string, max 32 chars)
        
        if (data.length < 18) return;
        
        // Height 是有符号整数,需要转换
        let height = this.readWordFromData(data, 0);
        if (height > 32767) height = height - 65536; // 转换为有符号
        height = Math.abs(height); // 使用绝对值作为字体大小
        
        const width = this.readWordFromData(data, 2);
        const weight = this.readWordFromData(data, 8);
        const italic = data[10];
        const underline = data[11];
        const strikeOut = data[12];
        
        // 读取字体名称,直到遇到 null 或最多 32 个字符
        let faceName = '';
        for (let i = 18; i < Math.min(data.length, 18 + 32); i++) {
            if (data[i] === 0) break;
            // 只接受可打印 ASCII 字符
            if (data[i] >= 32 && data[i] <= 126) {
                faceName += String.fromCharCode(data[i]);
            }
        }
        if (faceName === '') faceName = 'Arial'; // 默认字体
        
        console.log('CreateFontIndirect: height=', height, 'width=', width, 'weight=', weight, 'faceName=', faceName);
        
        // 创建字体对象
        this.gdiObjectManager.createFont(height, width, weight, italic, underline, strikeOut, faceName);
    }

    processSelectClipRgn(data) {
        if (data.length < 2) return;
        const regionIndex = this.readWordFromData(data, 0);
        console.log('SelectClipRgn:', regionIndex);
        // 简单实现：暂时忽略裁剪区域
    }

    processSelectObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        console.log('SelectObject:', objectIndex);
        const obj = this.gdiObjectManager.selectObject(objectIndex);
        if (obj) {
            this.applyGdiObject(obj);
        } else if (objectIndex >= 0x80000000) {
            this.applyStockObject(objectIndex);
        }
    }

    applyGdiObject(obj) {
        if (obj.type === 'pen') {
            this.ctx.strokeStyle = obj.color;
            this.ctx.lineWidth = obj.width || 1;
            this.strokeColor = obj.color;
        } else if (obj.type === 'brush') {
            this.ctx.fillStyle = obj.color;
            this.fillColor = obj.color;
        } else if (obj.type === 'font') {
            // 应用字体设置
            let fontSize = Math.abs(obj.height) || 12;
            
            // 使用坐标转换器的缩放比例来计算字体像素大小
            // 字体高度是逻辑单位，需要转换为像素单位
            const scale = this.coordinateTransformer.getScale();
            fontSize = Math.max(1, Math.round(fontSize * scale.y));
            console.log('Font size conversion:', obj.height, 'logical units ->', fontSize, 'pixels (scale:', scale.y, ')');
            
            const fontWeight = obj.weight >= 700 ? 'bold' : 'normal';
            const fontStyle = obj.italic ? 'italic' : 'normal';
            const fontFamily = obj.faceName || 'Arial';
            this.ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
            console.log('Applied font:', this.ctx.font);
        }
    }

    applyStockObject(stockIndex) {
        const color = this.gdiObjectManager.getStockObject(stockIndex);
        if (color) {
            this.ctx.fillStyle = color;
            this.fillColor = color;
        }
    }

    processDeleteObject(data) {
        if (data.length < 2) return;
        const objectIndex = this.readWordFromData(data, 0);
        console.log('DeleteObject:', objectIndex);
        this.gdiObjectManager.deleteObject(objectIndex);
    }

    processMoveTo(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('MoveTo:', x, y, '->', transformed.x, transformed.y);
        
        // 根据 MS-WMF 2.3.5.17 META_MOVETO:
        // 设置输出设备上下文中的当前位置，不绘制任何内容
        
        // 更新当前位置
        this.currentPosX = transformed.x;
        this.currentPosY = transformed.y;
        this.hasValidPosition = true;
        
        // MoveTo 不绘制，只是设置位置
        // 不需要 beginPath 或 moveTo，等到下一个绘图命令时再处理
    }

    processLineTo(data) {
        if (data.length < 4) return;
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('LineTo:', x, y, '->', transformed.x, transformed.y);
        
        // 根据 MS-WMF 2.3.5.12 META_LINETO:
        // 从当前位置到指定点绘制一条线，并将当前位置更新为该点
        
        // 确定线条起点
        let startX, startY;
        if (this.hasValidPosition) {
            // 有有效位置，从当前位置开始
            startX = this.currentPosX;
            startY = this.currentPosY;
        } else {
            // 没有有效位置，从(0,0)开始
            const startTransformed = this.coordinateTransformer.transform(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
            startX = startTransformed.x;
            startY = startTransformed.y;
        }
        
        // 绘制线条
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(transformed.x, transformed.y);
        this.ctx.stroke();
        
        // 更新当前位置
        this.currentPosX = transformed.x;
        this.currentPosY = transformed.y;
        this.hasValidPosition = true;
        
        // 清空路径
        this.currentPath = [];
    }

    processRectangle(data) {
        if (data.length < 8) return;
        const bottom = this.readWordFromData(data, 0);
        const right = this.readWordFromData(data, 2);
        const top = this.readWordFromData(data, 4);
        const left = this.readWordFromData(data, 6);
        const transformedLeftTop = this.coordinateTransformer.transform(left, top, this.ctx.canvas.width, this.ctx.canvas.height);
        const transformedRightBottom = this.coordinateTransformer.transform(right, bottom, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('Rectangle:', left, top, right, bottom);
        this.ctx.fillRect(transformedLeftTop.x, transformedLeftTop.y, 
            transformedRightBottom.x - transformedLeftTop.x, 
            transformedRightBottom.y - transformedLeftTop.y);
        this.ctx.strokeRect(transformedLeftTop.x, transformedLeftTop.y, 
            transformedRightBottom.x - transformedLeftTop.x, 
            transformedRightBottom.y - transformedLeftTop.y);
    }

    processPolyline(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        console.log('Polyline, numPoints:', numPoints);
        
        if (data.length < 2 + numPoints * 4) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const x = this.readWordFromData(data, 2 + i * 4);
            const y = this.readWordFromData(data, 4 + i * 4);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            if (i < 3 || i === numPoints - 1) {
                console.log(`  Point ${i}: logical (${x}, ${y}) -> canvas (${transformed.x.toFixed(2)}, ${transformed.y.toFixed(2)})`);
            }
            
            if (i === 0) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
        }
        this.ctx.stroke();
    }

    processPolygon(data) {
        if (data.length < 2) return;
        const numPoints = this.readWordFromData(data, 0);
        console.log('Polygon, numPoints:', numPoints);
        
        if (data.length < 2 + numPoints * 4) return;
        
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const x = this.readWordFromData(data, 2 + i * 4);
            const y = this.readWordFromData(data, 4 + i * 4);
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            
            if (i === 0) {
                this.ctx.moveTo(transformed.x, transformed.y);
            } else {
                this.ctx.lineTo(transformed.x, transformed.y);
            }
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    processPolyPolygon(data) {
        if (data.length < 2) return;
        const numPolygons = this.readWordFromData(data, 0);
        console.log('PolyPolygon, numPolygons:', numPolygons);
        
        if (data.length < 2 + numPolygons * 2) return;
        
        // 读取每个多边形的点数
        const pointCounts = [];
        let offset = 2;
        for (let i = 0; i < numPolygons; i++) {
            pointCounts.push(this.readWordFromData(data, offset));
            offset += 2;
        }
        
        // 绘制每个多边形
        for (let i = 0; i < numPolygons; i++) {
            const numPoints = pointCounts[i];
            console.log(`  Polygon ${i}: ${numPoints} points`);
            
            if (offset + numPoints * 4 > data.length) break;
            
            this.ctx.beginPath();
            for (let j = 0; j < numPoints; j++) {
                const x = this.readWordFromData(data, offset);
                const y = this.readWordFromData(data, offset + 2);
                const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
                
                if (i === 0 && j < 3) {
                    console.log(`    Point ${j}: logical (${x}, ${y}) -> canvas (${transformed.x.toFixed(2)}, ${transformed.y.toFixed(2)})`);
                }
                
                if (j === 0) {
                    this.ctx.moveTo(transformed.x, transformed.y);
                } else {
                    this.ctx.lineTo(transformed.x, transformed.y);
                }
                offset += 4;
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    processTextOut(data) {
        if (data.length < 2) return;
        const textLength = this.readWordFromData(data, 0);
        if (data.length < 2 + textLength + 4) return;
        
        const text = this.readStringFromData(data, 2, textLength);
        const y = this.readWordFromData(data, 2 + textLength);
        const x = this.readWordFromData(data, 4 + textLength);
        const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('TextOut:', text, 'at', x, y, '->', transformed.x, transformed.y);
        this.ctx.fillText(text, transformed.x, transformed.y);
    }
    
    processExtTextOut(data) {
        if (data.length < 8) return;
        
        // META_EXTTEXTOUT 结构 (MS-WMF 2.3.5.7):
        // Y (2 bytes) - Y 坐标或偏移
        // X (2 bytes) - X 坐标或偏移
        // StringLength (2 bytes) - 字符串长度
        // fwOpts (2 bytes) - 选项标志
        // [Optional] Rectangle (8 bytes) - 如果 fwOpts 包含 ETO_OPAQUE(0x0002) 或 ETO_CLIPPED(0x0004)
        // String (StringLength bytes) - 文本字符串
        // [Optional] Dx (StringLength * 2 bytes) - 字符间距数组
        
        const y = this.readWordFromData(data, 0);
        const x = this.readWordFromData(data, 2);
        const stringLength = this.readWordFromData(data, 4);
        const fwOpts = this.readWordFromData(data, 6);
        
        let offset = 8;
        
        // 检查是否有矩形
        const ETO_OPAQUE = 0x0002;
        const ETO_CLIPPED = 0x0004;
        if ((fwOpts & (ETO_OPAQUE | ETO_CLIPPED)) !== 0) {
            // 跳过矩形 (left, top, right, bottom)
            if (data.length < offset + 8) return;
            offset += 8;
        }
        
        // 读取文本字符串
        if (data.length < offset + stringLength) return;
        const text = this.readStringFromData(data, offset, stringLength);
        
        // ExtTextOut 的坐标可能是绝对坐标，也可能使用当前位置
        // 如果坐标为 (0, 0)，使用当前画笔位置
        let finalX, finalY;
        if (x === 0 && y === 0 && this.currentPosX !== undefined) {
            // 使用当前位置
            finalX = this.currentPosX;
            finalY = this.currentPosY;
            console.log('ExtTextOut:', text, 'at CP', '(using current position', this.currentPosX, this.currentPosY + ')', 'options:', fwOpts);
        } else {
            // 使用指定坐标
            const transformed = this.coordinateTransformer.transform(x, y, this.ctx.canvas.width, this.ctx.canvas.height);
            finalX = transformed.x;
            finalY = transformed.y;
            console.log('ExtTextOut:', text, 'at', x, y, '->', finalX, finalY, 'options:', fwOpts);
        }
        
        // 绘制文本
        this.ctx.fillText(text, finalX, finalY);
    }

    processSaveDC(data) {
        console.log('SaveDC');
        this.ctx.save();
    }

    processRestoreDC(data) {
        console.log('RestoreDC');
        this.ctx.restore();
    }
    
    // 重写 Escape 处理方法（标准 WMF 渲染时使用）
    processEscape(data) {
        if (data.length < 2) return;
        
        const escapeFunction = this.readWordFromData(data, 0);
        console.log('Escape function:', escapeFunction, '(0x' + escapeFunction.toString(16).padStart(4, '0') + ')');
        
        // MFCOMMENT (0x000F) - 在标准 WMF 模式下跳过
        if (escapeFunction === 0x000F) {
            console.log('MFCOMMENT - skipped in standard WMF mode');
        } else {
            console.log('未处理的 Escape 函数:', escapeFunction);
        }
    }
    
    // 移除旧的警告方法 - 不再需要
    processWmfcComment(data) {
        // 此方法已被 parseWmfcEmfPlusRecord 替代
        console.log('processWmfcComment - deprecated');
    }
}

module.exports = WmfDrawer;