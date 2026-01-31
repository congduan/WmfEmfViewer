// WMF解析器和绘制器
class WmfParser {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.offset = 0;
        console.log('WMF Parser initialized with data length:', data.length);
    }

    parse() {
        console.log('Starting WMF parsing...');
        // 解析WMF文件头
        const header = this.parseHeader();
        console.log('WMF Header:', header);

        // 解析WMF记录
        const records = [];
        while (this.offset < this.data.length) {
            const record = this.parseRecord();
            if (record) {
                records.push(record);
                console.log('Parsed record:', record);
            } else {
                break;
            }
        }

        console.log('Total records parsed:', records.length);
        return { header, records };
    }

    parseHeader() {
        // WMF文件头结构
        const header = {
            type: this.readWord(),
            headerSize: this.readWord(),
            version: this.readWord(),
            size: this.readDword(),
            numObjects: this.readWord(),
            maxRecord: this.readDword(),
            width: this.readWord(),
            height: this.readWord()
        };

        return header;
    }

    parseRecord() {
        const size = this.readWord();
        const functionId = this.readWord();

        if (size === 0) {
            return null;
        }

        const dataSize = (size - 1) * 2; // 每个记录包含大小和函数ID，共2个word
        const recordData = this.readBytes(dataSize);

        return {
            size,
            functionId,
            data: recordData
        };
    }

    readWord() {
        if (this.offset + 2 > this.data.length) {
            return 0;
        }
        const value = this.data[this.offset] | (this.data[this.offset + 1] << 8);
        this.offset += 2;
        return value;
    }

    readDword() {
        if (this.offset + 4 > this.data.length) {
            return 0;
        }
        const value = this.data[this.offset] | 
                     (this.data[this.offset + 1] << 8) | 
                     (this.data[this.offset + 2] << 16) | 
                     (this.data[this.offset + 3] << 24);
        this.offset += 4;
        return value;
    }

    readBytes(length) {
        if (this.offset + length > this.data.length) {
            length = this.data.length - this.offset;
        }
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }
}

class WmfDrawer {
    constructor(ctx) {
        this.ctx = ctx;
        this.mapMode = 0; // 默认映射模式：MM_TEXT
        this.windowOrgX = 0; // 窗口原点X
        this.windowOrgY = 0; // 窗口原点Y
        this.windowExtX = 800; // 窗口范围X
        this.windowExtY = 600; // 窗口范围Y
        this.viewportOrgX = 0; // 视口原点X
        this.viewportOrgY = 0; // 视口原点Y
        this.viewportExtX = 800; // 视口范围X
        this.viewportExtY = 600; // 视口范围Y
        this.currentPath = []; // 当前路径点集合
        this.pathState = 'idle'; // 路径状态：idle, active, completed
        this.fillColor = '#000000'; // 默认填充颜色
        this.strokeColor = '#000000'; // 默认描边颜色
        this.lineWidth = 1; // 默认线宽
        console.log('WMF Drawer initialized');
    }

    draw(wmfData) {
        console.log('Drawing WMF with header:', wmfData.header);
        console.log('Number of records:', wmfData.records.length);

        // 设置Canvas大小
        this.ctx.canvas.width = wmfData.header.width || 800;
        this.ctx.canvas.height = wmfData.header.height || 600;
        console.log('Canvas size set to:', this.ctx.canvas.width, 'x', this.ctx.canvas.height);

        // 清空Canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        console.log('Canvas cleared');

        // 设置默认绘制样式
        this.ctx.strokeStyle = '#000000'; // 黑色描边
        this.ctx.fillStyle = '#ffffff'; // 白色填充
        this.ctx.lineWidth = 1;
        this.fillColor = '#ffffff';
        this.strokeColor = '#000000';
        console.log('Drawing styles set');
        console.log('Default stroke color:', this.ctx.strokeStyle);
        console.log('Default fill color:', this.ctx.fillStyle);

        // 重置路径状态
        this.currentPath = [];
        this.pathState = 'idle';

        // 处理每个WMF记录
        for (let i = 0; i < wmfData.records.length; i++) {
            const record = wmfData.records[i];
            console.log('Processing record', i, ':', record);
            this.processRecord(record);
        }
        
        // 处理剩余的路径
        this.finishPath();

        console.log('WMF drawing completed');
    }

    processRecord(record) {
        // 根据函数ID处理不同的WMF命令
        switch (record.functionId) {
            case 0x0001: // SetWindowOrg
                this.processSetWindowOrg(record.data);
                break;
            case 0x0002: // SetWindowExt
                this.processSetWindowExt(record.data);
                break;
            case 0x0003: // SetViewportOrg
                this.processSetViewportOrg(record.data);
                break;
            case 0x0004: // SetViewportExt
                this.processSetViewportExt(record.data);
                break;
            case 0x0201: // MoveTo
                this.processMoveTo(record.data);
                break;
            case 0x0202: // LineTo
                this.processLineTo(record.data);
                break;
            case 0x0203: // Rectangle
                this.processRectangle(record.data);
                break;
            case 0x0209: // Ellipse
                this.processEllipse(record.data);
                break;
            case 0x020B: // TextOut
                this.processTextOut(record.data);
                break;
            case 0x02C8: // SetMapMode
                this.processSetMapMode(record.data);
                break;
            case 0x2B4E: // 11086 - 可能是EMF函数
                this.processEmfFunction(record.data);
                break;
            // 扩展WMF函数
            case 0x1D6C: // 可能是EMF+函数
                this.processEmfPlusFunction(record.data);
                break;
            default:
                console.log('Unknown WMF function:', record.functionId, '(0x' + record.functionId.toString(16).padStart(4, '0') + ')');
                // 跳过不认识的函数，继续解析
                break;
        }
    }

    // 设置窗口原点
    processSetWindowOrg(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowOrg:', x, y);
        this.windowOrgX = x;
        this.windowOrgY = y;
    }

    // 设置窗口范围
    processSetWindowExt(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetWindowExt:', x, y);
        this.windowExtX = x;
        this.windowExtY = y;
    }

    // 设置视口原点
    processSetViewportOrg(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportOrg:', x, y);
        // 视口原点设置逻辑
        this.viewportOrgX = x;
        this.viewportOrgY = y;
    }

    // 设置视口范围
    processSetViewportExt(data) {
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('SetViewportExt:', x, y);
        // 视口范围设置逻辑
        this.viewportExtX = x;
        this.viewportExtY = y;
    }

    // 坐标转换：将WMF/EMF坐标转换为Canvas坐标
    transformCoord(x, y) {
        // 根据映射模式和窗口设置转换坐标
        let canvasX = x;
        let canvasY = y;
        
        // 处理窗口原点偏移
        canvasX -= this.windowOrgX;
        canvasY -= this.windowOrgY;
        
        // 处理Y轴方向（WMF/EMF的Y轴向下，Canvas的Y轴向上）
        const canvasHeight = this.ctx.canvas.height || 600; // 使用默认值避免高度为0的情况
        const canvasWidth = this.ctx.canvas.width || 800; // 使用默认值避免宽度为0的情况
        
        // 计算缩放因子
        let scaleX = 1.0;
        let scaleY = 1.0;
        
        // 根据映射模式调整缩放
        switch (this.mapMode) {
            case 0: // MM_TEXT
                scaleX = 1.0;
                scaleY = 1.0;
                break;
            case 1: // MM_LOMETRIC
                scaleX = 0.1;
                scaleY = 0.1;
                break;
            case 2: // MM_HIMETRIC
                scaleX = 0.01;
                scaleY = 0.01;
                break;
            case 3: // MM_LOENGLISH
                scaleX = 0.254;
                scaleY = 0.254;
                break;
            case 4: // MM_HIENGLISH
                scaleX = 0.0254;
                scaleY = 0.0254;
                break;
            case 5: // MM_TWIPS
                scaleX = 0.0176388889;
                scaleY = 0.0176388889;
                break;
            default:
                // 尝试自动计算缩放因子
                if (this.windowExtX > 0 && this.windowExtY > 0) {
                    scaleX = canvasWidth / this.windowExtX * 0.7;
                    scaleY = canvasHeight / this.windowExtY * 0.7;
                } else {
                    // 默认缩放因子
                    scaleX = 0.02;
                    scaleY = 0.02;
                }
        }
        
        // 应用缩放
        canvasX *= scaleX;
        canvasY *= scaleY;
        
        // 将图形居中显示
        canvasX = canvasWidth / 2 + canvasX;
        canvasY = canvasHeight / 2 - canvasY;
        
        // 确保坐标为正数
        canvasX = Math.max(0, canvasX);
        canvasY = Math.max(0, canvasY);
        
        // 限制坐标在Canvas范围内
        canvasX = Math.min(canvasX, canvasWidth);
        canvasY = Math.min(canvasY, canvasHeight);
        
        // 调试信息
        if (Math.random() < 0.01) { // 只打印1%的坐标转换，避免日志过多
            console.log('Coordinate transformation:', x, y, '->', canvasX, canvasY);
            console.log('Scale factors:', scaleX, scaleY);
            console.log('Window settings:', this.windowOrgX, this.windowOrgY, this.windowExtX, this.windowExtY);
        }
        
        return { x: canvasX, y: canvasY };
    }

    // 设置映射模式
    processSetMapMode(data) {
        const mode = this.readWordFromData(data, 0);
        console.log('SetMapMode:', mode);
        // 实现映射模式设置逻辑
        // 映射模式定义：
        // 0: MM_TEXT - 每个单位对应一个像素
        // 1: MM_LOMETRIC - 每个单位对应0.1毫米
        // 2: MM_HIMETRIC - 每个单位对应0.01毫米
        // 3: MM_LOENGLISH - 每个单位对应0.01英寸
        // 4: MM_HIENGLISH - 每个单位对应0.001英寸
        // 5: MM_TWIPS - 每个单位对应1/1440英寸
        // 6480: 可能是自定义映射模式
        this.mapMode = mode;
    }

    // 处理EMF函数
    processEmfFunction(data) {
        console.log('EMF function detected, processing');
        // 解析EMF函数数据
        // EMF函数通常包含更多的参数和更复杂的结构
        console.log('EMF function data length:', data.length);
        
        // 输出原始数据的前20个字节，便于分析
        if (data.length >= 20) {
            console.log('First 20 bytes of EMF data:', Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
        
        // 分析数据结构
        if (data.length >= 8) {
            const potentialType = this.readDwordFromData(data, 0);
            const potentialSize = this.readDwordFromData(data, 4);
            console.log('Potential record type:', potentialType, '(0x' + potentialType.toString(16).padStart(8, '0') + ')');
            console.log('Potential record size:', potentialSize);
            
            // 检查是否是标准EMF记录（记录类型应该是较小的数值）
            if (potentialType < 0x10000) {
                console.log('Standard EMF record detected');
                // 标准EMF记录结构：类型(4字节) + 大小(4字节) + 数据
                if (potentialSize <= data.length) {
                    console.log('Valid standard EMF record size, processing data...');
                    this.processEmfRecord(potentialType, data.slice(8));
                } else {
                    console.log('Invalid standard EMF record size, using compatibility mode');
                    this.processEmfRecord(potentialType, data.slice(4));
                }
            } else {
                console.log('Non-standard EMF data structure detected');
                // 这可能是直接的图形数据，而不是标准EMF记录结构
                // 尝试将整个数据作为图形数据处理
                this.processDirectGraphicData(data);
            }
        } else if (data.length >= 4) {
            // 兼容处理：如果数据不足8字节
            console.log('Data length < 8, using compatibility mode');
            const recordType = this.readDwordFromData(data, 0);
            console.log('Record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
            this.processEmfRecord(recordType, data.slice(4));
        }
    }
    
    // 处理直接的图形数据（非标准EMF记录结构）
    processDirectGraphicData(data) {
        console.log('Processing direct graphic data, length:', data.length);
        
        // 重新实现WMF解析器，专注于正确解析sample.wmf文件
        const canvasWidth = this.ctx.canvas.width || 800;
        const canvasHeight = this.ctx.canvas.height || 600;
        
        console.log('Canvas size:', canvasWidth, 'x', canvasHeight);
        
        // 尝试解析为标准WMF记录
        this.parseWmfData(data, canvasWidth, canvasHeight);
    }
    
    // 解析WMF数据
    parseWmfData(data, canvasWidth, canvasHeight) {
        console.log('Parsing WMF data');
        
        let offset = 0;
        let recordCount = 0;
        
        // 设置默认样式
        this.ctx.strokeStyle = '#000000';
        this.ctx.fillStyle = '#ffffff'; // 改为白色填充，避免黑色填充区域
        this.ctx.lineWidth = 2;
        // 确保填充颜色始终为白色
        this.fillColor = '#ffffff';
        
        // 检查文件的前几个字节，确定文件类型
        console.log('First 16 bytes of data:', Array.from(data.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // 尝试不同的解析策略
        // 策略1：标准WMF记录结构（2字节大小 + 2字节函数ID）
        console.log('\n=== 尝试策略1：标准WMF记录结构 ===');
        let strategy1Offset = 0;
        let strategy1Count = 0;
        while (strategy1Offset + 4 <= data.length) {
            const size = data[strategy1Offset] | (data[strategy1Offset + 1] << 8);
            const functionId = data[strategy1Offset + 2] | (data[strategy1Offset + 3] << 8);
            
            if (size > 0 && size < 2000 && functionId > 0 && functionId < 0x10000) {
                console.log('Found valid WMF record at offset', strategy1Offset, ': size=', size, ', functionId=', functionId, '(0x' + functionId.toString(16).padStart(4, '0') + ')');
                // 读取记录数据
                const recordData = data.slice(strategy1Offset + 4, strategy1Offset + size * 2);
                // 处理不同的WMF函数
                this.handleWmfFunction(functionId, recordData, canvasWidth, canvasHeight);
                strategy1Count++;
                recordCount++;
                strategy1Offset += size * 2;
            } else {
                strategy1Offset += 2;
            }
        }
        console.log('Strategy 1 found', strategy1Count, 'valid records');
        
        // 策略2：可能是EMF记录结构（4字节类型 + 4字节大小）
        console.log('\n=== 尝试策略2：EMF记录结构 ===');
        let strategy2Offset = 0;
        let strategy2Count = 0;
        while (strategy2Offset + 8 <= data.length) {
            const recordType = data[strategy2Offset] | (data[strategy2Offset + 1] << 8) | (data[strategy2Offset + 2] << 16) | (data[strategy2Offset + 3] << 24);
            const recordSize = data[strategy2Offset + 4] | (data[strategy2Offset + 5] << 8) | (data[strategy2Offset + 6] << 16) | (data[strategy2Offset + 7] << 24);
            
            if (recordType > 0 && recordType < 0x10000 && recordSize > 0 && recordSize < 10000 && strategy2Offset + recordSize <= data.length) {
                console.log('Found valid EMF record at offset', strategy2Offset, ': type=', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + '), size=', recordSize);
                // 读取记录数据
                const recordData = data.slice(strategy2Offset + 8, strategy2Offset + recordSize);
                // 处理EMF记录
                this.processEmfRecord(recordType, recordData);
                strategy2Count++;
                recordCount++;
                strategy2Offset += recordSize;
            } else {
                strategy2Offset += 4;
            }
        }
        console.log('Strategy 2 found', strategy2Count, 'valid records');
        
        // 策略3：尝试解析为Polyline数据（每4字节一个点）
        console.log('\n=== 尝试策略3：直接解析Polyline数据 ===');
        let strategy3Offset = 0;
        let strategy3Count = 0;
        const points = [];
        while (strategy3Offset + 4 <= data.length) {
            const x = data[strategy3Offset] | (data[strategy3Offset + 1] << 8);
            const y = data[strategy3Offset + 2] | (data[strategy3Offset + 3] << 8);
            
            // 检查坐标值是否合理
            if (Math.abs(x) < 50000 && Math.abs(y) < 50000) {
                const transformed = this.transformCoord(x, y);
                points.push(transformed);
                strategy3Count++;
                strategy3Offset += 4;
            } else {
                strategy3Offset += 2;
            }
        }
        
        // 如果找到足够的点，绘制折线
        if (points.length >= 5) {
            console.log('Strategy 3 found', points.length, 'points, drawing polyline...');
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
            recordCount++;
        } else {
            console.log('Strategy 3 found', points.length, 'points, not enough for polyline');
        }
        
        // 如果没有找到任何记录，绘制一些基本图形，验证渲染是否工作
        if (recordCount === 0) {
            console.log('\n=== 没有找到有效记录，绘制测试图形 ===');
            this.ctx.beginPath();
            this.ctx.moveTo(100, 100);
            this.ctx.lineTo(200, 100);
            this.ctx.lineTo(200, 200);
            this.ctx.lineTo(100, 200);
            this.ctx.closePath();
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.ellipse(350, 150, 50, 50, 0, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.fillText('No valid records found', 100, 250);
        }
        
        console.log('Processed', recordCount, 'WMF records');
    }
    
    // 处理WMF函数
    handleWmfFunction(functionId, data, canvasWidth, canvasHeight) {
        console.log('Handling WMF function:', functionId, 'data length:', data.length);
        
        switch (functionId) {
            case 0x0201: // MoveTo
                this.processMoveTo(data);
                break;
            case 0x0202: // LineTo
                this.processLineTo(data);
                break;
            case 0x0203: // Rectangle
                this.processRectangle(data);
                break;
            case 0x0209: // Ellipse
                this.processEllipse(data);
                break;
            case 0x020B: // TextOut
                this.processTextOut(data);
                break;
            case 0x02C8: // SetMapMode
                this.processSetMapMode(data);
                break;
            case 0x0001: // SetWindowOrg
                this.processSetWindowOrg(data);
                break;
            case 0x0002: // SetWindowExt
                this.processSetWindowExt(data);
                break;
            case 0x0003: // SetViewportOrg
                this.processSetViewportOrg(data);
                break;
            case 0x0004: // SetViewportExt
                this.processSetViewportExt(data);
                break;
            case 0x0041: // 65 - 可能是Polyline或其他绘制命令
                console.log('Processing function 65 (0x0041), data length:', data.length);
                // 尝试解析为折线数据
                this.processPolyline(data);
                break;
            case 0x0061: // 97 - 可能是Bezier曲线命令
                console.log('Processing function 97 (0x0061), data length:', data.length);
                this.processBezier(data);
                break;
            case 0x0043: // 67 - 可能是Arc命令
                console.log('Processing function 67 (0x0043), data length:', data.length);
                this.processArc(data);
                break;
            default:
                // 忽略未知函数
                console.log('Unknown WMF function:', functionId, '(0x' + functionId.toString(16).padStart(4, '0') + ')');
                break;
        }
    }
    
    // 处理折线命令
    processPolyline(data) {
        console.log('Processing Polyline, data length:', data.length);
        // 尝试解析折线点
        const points = [];
        let offset = 0;
        while (offset + 4 <= data.length) {
            const x = this.readWordFromData(data, offset);
            const y = this.readWordFromData(data, offset + 2);
            const transformed = this.transformCoord(x, y);
            points.push(transformed);
            offset += 4;
        }
        console.log('Polyline points:', points);
        
        // 绘制折线
        if (points.length >= 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
        }
    }

    // 处理贝塞尔曲线命令
    processBezier(data) {
        console.log('Processing Bezier curve, data length:', data.length);
        // 尝试解析贝塞尔曲线点
        const points = [];
        let offset = 0;
        while (offset + 12 <= data.length) { // 贝塞尔曲线需要4个点（起点、两个控制点、终点）
            const x1 = this.readWordFromData(data, offset);
            const y1 = this.readWordFromData(data, offset + 2);
            const x2 = this.readWordFromData(data, offset + 4);
            const y2 = this.readWordFromData(data, offset + 6);
            const x3 = this.readWordFromData(data, offset + 8);
            const y3 = this.readWordFromData(data, offset + 10);
            
            const p1 = this.transformCoord(x1, y1);
            const p2 = this.transformCoord(x2, y2);
            const p3 = this.transformCoord(x3, y3);
            
            points.push({ start: p1, control1: p2, control2: p2, end: p3 });
            offset += 12;
        }
        
        // 绘制贝塞尔曲线
        if (points.length > 0) {
            this.ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const curve = points[i];
                if (i === 0) {
                    this.ctx.moveTo(curve.start.x, curve.start.y);
                }
                this.ctx.bezierCurveTo(
                    curve.control1.x, curve.control1.y,
                    curve.control2.x, curve.control2.y,
                    curve.end.x, curve.end.y
                );
            }
            this.ctx.stroke();
        }
    }

    // 处理圆弧命令
    processArc(data) {
        console.log('Processing Arc, data length:', data.length);
        if (data.length >= 16) {
            const left = this.readDwordFromData(data, 0);
            const top = this.readDwordFromData(data, 4);
            const right = this.readDwordFromData(data, 8);
            const bottom = this.readDwordFromData(data, 12);
            
            // 转换坐标
            const transformedLeftTop = this.transformCoord(left, top);
            const transformedRightBottom = this.transformCoord(right, bottom);
            
            // 计算圆心和半径
            const centerX = (transformedLeftTop.x + transformedRightBottom.x) / 2;
            const centerY = (transformedLeftTop.y + transformedRightBottom.y) / 2;
            const radiusX = (transformedRightBottom.x - transformedLeftTop.x) / 2;
            const radiusY = (transformedRightBottom.y - transformedLeftTop.y) / 2;
            
            // 绘制圆弧
            this.ctx.beginPath();
            this.ctx.ellipse(
                centerX, centerY,
                radiusX, radiusY,
                0, 0, Math.PI * 2
            );
            this.ctx.stroke();
        }
    }

    // 处理EMF记录
    processEmfRecord(recordType, data) {
        console.log('Processing EMF record:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
        
        // 根据EMF记录类型执行不同的处理
        switch (recordType) {
            case 0x00000001: // EMR_HEADER
                this.processEmfHeader(data);
                break;
            case 0x00000002: // EMR_POLYLINE
                this.processEmfPolyline(data);
                break;
            case 0x00000003: // EMR_POLYGON
                this.processEmfPolygon(data);
                break;
            case 0x00000006: // EMR_RECTANGLE
                this.processEmfRectangle(data);
                break;
            case 0x00000008: // EMR_ELLIPSE
                this.processEmfEllipse(data);
                break;
            case 0x0000000B: // EMR_TEXT
                this.processEmfText(data);
                break;
            case 0x000001f0: // EMR_ABORTPATH
                this.processEmfAbortPath(data);
                break;
            case 0x000001f1: // EMR_BEGINPATH
                this.processEmfBeginPath(data);
                break;
            case 0x000001f2: // EMR_ENDPATH
                this.processEmfEndPath(data);
                break;
            case 0x000001f4: // EMR_FILLPATH
                this.processEmfFillPath(data);
                break;
            case 0x000001f5: // EMR_STROKEPATH
                this.processEmfStrokePath(data);
                break;
            case 0x00000220: // EMR_SETBKCOLOR
                this.processEmfSetBkColor(data);
                break;
            case 0x00000221: // EMR_SETTEXTCOLOR
                this.processEmfSetTextColor(data);
                break;
            case 0x00000226: // EMR_SETFILLMODE
                this.processEmfSetFillMode(data);
                break;
            case 0x2B5B0DFB: // 未知EMF记录类型，尝试解析为通用图形数据
                this.processUnknownEmfRecord(recordType, data);
                break;
            default:
                console.log('Unknown EMF record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
                // 尝试通用处理
                this.processUnknownEmfRecord(recordType, data);
                break;
        }
    }

    // 处理未知EMF记录类型
    processUnknownEmfRecord(recordType, data) {
        console.log('Processing unknown EMF record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
        console.log('Data length:', data.length);
        
        // 尝试解析为通用图形数据
        // 这里可以根据实际情况添加更复杂的解析逻辑
        if (data.length >= 16) {
            // 尝试解析为矩形
            const left = this.readDwordFromData(data, 0);
            const top = this.readDwordFromData(data, 4);
            const right = this.readDwordFromData(data, 8);
            const bottom = this.readDwordFromData(data, 12);
            
            // 转换坐标
            const transformedLeftTop = this.transformCoord(left, top);
            const transformedRightBottom = this.transformCoord(right, bottom);
            
            // 检查是否是有效的矩形
            if (right > left && bottom > top) {
                console.log('Possible rectangle detected:', left, top, right, bottom);
                console.log('Transformed rectangle:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
                this.ctx.strokeRect(
                    transformedLeftTop.x,
                    transformedLeftTop.y,
                    transformedRightBottom.x - transformedLeftTop.x,
                    transformedRightBottom.y - transformedLeftTop.y
                );
            }
        }
        
        // 尝试解析为多边形
        if (data.length >= 12) {
            const pointCount = this.readDwordFromData(data, 0);
            if (pointCount > 2 && data.length >= 8 + pointCount * 8) {
                console.log('Possible polygon detected with', pointCount, 'points');
                const points = [];
                for (let i = 0; i < pointCount; i++) {
                    const x = this.readDwordFromData(data, 8 + i * 8);
                    const y = this.readDwordFromData(data, 12 + i * 8);
                    const transformed = this.transformCoord(x, y);
                    points.push(transformed);
                }
                
                if (points.length >= 3) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i++) {
                        this.ctx.lineTo(points[i].x, points[i].y);
                    }
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.stroke();
                }
            }
        }
        
        // 对于大型记录，尝试查找可能的图形数据块
        if (data.length > 1000) {
            console.log('Large EMF record detected, analyzing structure...');
            // 尝试找到多个图形数据块
            let offset = 0;
            while (offset + 16 <= data.length) {
                const left = this.readDwordFromData(data, offset);
                const top = this.readDwordFromData(data, offset + 4);
                const right = this.readDwordFromData(data, offset + 8);
                const bottom = this.readDwordFromData(data, offset + 12);
                
                // 检查是否是有效的矩形
                if (right > left && bottom > top && right - left < 10000 && bottom - top < 10000) {
                    const transformedLeftTop = this.transformCoord(left, top);
                    const transformedRightBottom = this.transformCoord(right, bottom);
                    console.log('Found potential图形数据 at offset', offset, ':', left, top, right, bottom);
                    this.ctx.strokeRect(
                        transformedLeftTop.x,
                        transformedLeftTop.y,
                        transformedRightBottom.x - transformedLeftTop.x,
                        transformedRightBottom.y - transformedLeftTop.y
                    );
                    offset += 16; // 移动到下一个可能的矩形
                } else {
                    offset += 4; // 移动4字节继续查找
                }
            }
        }
        
        // 尝试解析为颜色数据
        if (data.length >= 4) {
            const color = this.readDwordFromData(data, 0);
            const r = (color >> 16) & 0xFF;
            const g = (color >> 8) & 0xFF;
            const b = color & 0xFF;
            
            // 检查是否是有效的颜色值
            if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                console.log('Possible color data detected:', hexColor);
                // 尝试应用颜色
                this.ctx.fillStyle = hexColor;
                this.fillColor = hexColor;
            }
        }
    }

    // 处理EMF文件头记录
    processEmfHeader(data) {
        console.log('Processing EMR_HEADER record');
        // 解析EMF文件头数据
        if (data.length >= 120) {
            const header = {
                iType: this.readDwordFromData(data, 0),
                nSize: this.readDwordFromData(data, 4),
                bounds: {
                    left: this.readDwordFromData(data, 8),
                    top: this.readDwordFromData(data, 12),
                    right: this.readDwordFromData(data, 16),
                    bottom: this.readDwordFromData(data, 20)
                },
                frame: {
                    left: this.readDwordFromData(data, 24),
                    top: this.readDwordFromData(data, 28),
                    right: this.readDwordFromData(data, 32),
                    bottom: this.readDwordFromData(data, 36)
                },
                dSignature: this.readDwordFromData(data, 40),
                nVersion: this.readDwordFromData(data, 44),
                nBytes: this.readDwordFromData(data, 48),
                nRecords: this.readDwordFromData(data, 52),
                nHandles: this.readWordFromData(data, 56),
                sReserved: this.readWordFromData(data, 58),
                nDescription: this.readDwordFromData(data, 60),
                offDescription: this.readDwordFromData(data, 64),
                nPalEntries: this.readDwordFromData(data, 68),
                szlDevice: {
                    cx: this.readDwordFromData(data, 72),
                    cy: this.readDwordFromData(data, 76)
                },
                szlMillimeters: {
                    cx: this.readDwordFromData(data, 80),
                    cy: this.readDwordFromData(data, 84)
                }
            };
            console.log('EMF Header:', header);
            // 设置Canvas大小
            this.ctx.canvas.width = header.bounds.right - header.bounds.left;
            this.ctx.canvas.height = header.bounds.bottom - header.bounds.top;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        }
    }

    // 处理EMF折线记录
    processEmfPolyline(data) {
        console.log('Processing EMR_POLYLINE record');
        // 解析EMF折线数据
        if (data.length >= 8) {
            const count = this.readDwordFromData(data, 0);
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 8 + i * 8);
                const y = this.readDwordFromData(data, 12 + i * 8);
                const transformed = this.transformCoord(x, y);
                points.push(transformed);
            }
            console.log('EMF Polyline points:', points);
            
            // 实现EMF折线绘制逻辑
            if (points.length >= 2) {
                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(points[i].x, points[i].y);
                }
                this.ctx.stroke();
            }
        }
    }

    // 处理EMF多边形记录
    processEmfPolygon(data) {
        console.log('Processing EMR_POLYGON record');
        // 解析EMF多边形数据
        if (data.length >= 8) {
            const count = this.readDwordFromData(data, 0);
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 8 + i * 8);
                const y = this.readDwordFromData(data, 12 + i * 8);
                const transformed = this.transformCoord(x, y);
                points.push(transformed);
            }
            console.log('EMF Polygon points:', points);
            
            // 实现EMF多边形绘制逻辑
            if (points.length >= 3) {
                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(points[i].x, points[i].y);
                }
                this.ctx.closePath();
                // 暂时禁用填充，只绘制边框
                // this.ctx.fill();
                this.ctx.stroke();
            }
        }
    }

    // 处理EMF矩形记录
    processEmfRectangle(data) {
        console.log('Processing EMR_RECTANGLE record');
        // 解析EMF矩形数据
        if (data.length >= 16) {
            const left = this.readDwordFromData(data, 0);
            const top = this.readDwordFromData(data, 4);
            const right = this.readDwordFromData(data, 8);
            const bottom = this.readDwordFromData(data, 12);
            
            // 转换坐标
            const transformedLeftTop = this.transformCoord(left, top);
            const transformedRightBottom = this.transformCoord(right, bottom);
            
            console.log('EMF Rectangle:', left, top, right, bottom);
            console.log('Transformed Rectangle:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
            
            // 实现EMF矩形绘制逻辑
            this.ctx.strokeRect(
                transformedLeftTop.x,
                transformedLeftTop.y,
                transformedRightBottom.x - transformedLeftTop.x,
                transformedRightBottom.y - transformedLeftTop.y
            );
        }
    }

    // 处理EMF椭圆记录
    processEmfEllipse(data) {
        console.log('Processing EMR_ELLIPSE record');
        // 解析EMF椭圆数据
        if (data.length >= 16) {
            const left = this.readDwordFromData(data, 0);
            const top = this.readDwordFromData(data, 4);
            const right = this.readDwordFromData(data, 8);
            const bottom = this.readDwordFromData(data, 12);
            
            // 转换坐标
            const transformedLeftTop = this.transformCoord(left, top);
            const transformedRightBottom = this.transformCoord(right, bottom);
            
            console.log('EMF Ellipse:', left, top, right, bottom);
            console.log('Transformed Ellipse:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
            
            // 实现EMF椭圆绘制逻辑
            this.ctx.beginPath();
            this.ctx.ellipse(
                (transformedLeftTop.x + transformedRightBottom.x) / 2,
                (transformedLeftTop.y + transformedRightBottom.y) / 2,
                (transformedRightBottom.x - transformedLeftTop.x) / 2,
                (transformedRightBottom.y - transformedLeftTop.y) / 2,
                0,
                0,
                Math.PI * 2
            );
            this.ctx.stroke();
        }
    }

    // 处理EMF文本记录
    processEmfText(data) {
        console.log('Processing EMR_TEXT record');
        // 解析EMF文本数据
        if (data.length >= 24) {
            const x = this.readDwordFromData(data, 0);
            const y = this.readDwordFromData(data, 4);
            const cx = this.readDwordFromData(data, 8);
            const cy = this.readDwordFromData(data, 12);
            const offString = this.readDwordFromData(data, 16);
            const nChars = this.readDwordFromData(data, 20);
            
            // 读取文本内容
            let text = '';
            if (offString + nChars <= data.length) {
                for (let i = 0; i < nChars; i++) {
                    text += String.fromCharCode(data[offString + i]);
                }
            }
            
            // 转换坐标
            const transformed = this.transformCoord(x, y);
            
            console.log('EMF Text:', x, y, text);
            console.log('Transformed Text position:', transformed.x, transformed.y);
            
            // 实现EMF文本绘制逻辑
            this.ctx.fillText(text, transformed.x, transformed.y);
        }
    }

    // 处理EMF路径终止记录
    processEmfAbortPath(data) {
        console.log('Processing EMR_ABORTPATH record');
        // EMR_ABORTPATH记录通常不包含额外数据
        // 它的作用是终止当前的路径构建
        // 在Canvas 2D中，我们可以通过开始一个新的路径来模拟这个行为
        this.ctx.beginPath();
        // 重置路径状态
        this.currentPath = [];
        this.pathState = 'idle';
    }

    // 处理EMF路径开始记录
    processEmfBeginPath(data) {
        console.log('Processing EMR_BEGINPATH record');
        // 开始一个新的路径
        this.ctx.beginPath();
        this.currentPath = [];
        this.pathState = 'active';
    }

    // 处理EMF路径结束记录
    processEmfEndPath(data) {
        console.log('Processing EMR_ENDPATH record');
        // 结束当前路径
        this.pathState = 'completed';
    }

    // 处理EMF填充路径记录
    processEmfFillPath(data) {
        console.log('Processing EMR_FILLPATH record');
        // 暂时禁用填充，只绘制边框
        // if (this.pathState === 'completed' || this.currentPath.length > 0) {
        //     this.ctx.fill();
        // }
    }

    // 处理EMF描边路径记录
    processEmfStrokePath(data) {
        console.log('Processing EMR_STROKEPATH record');
        // 描边当前路径
        if (this.pathState === 'completed' || this.currentPath.length > 0) {
            this.ctx.stroke();
        }
    }

    // 处理EMF设置背景色记录
    processEmfSetBkColor(data) {
        console.log('Processing EMR_SETBKCOLOR record');
        if (data.length >= 4) {
            const color = this.readDwordFromData(data, 0);
            // 转换为RGB颜色
            const r = (color >> 16) & 0xFF;
            const g = (color >> 8) & 0xFF;
            const b = color & 0xFF;
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            console.log('Setting background color:', hexColor);
            this.ctx.fillStyle = hexColor;
            this.fillColor = hexColor;
        }
    }

    // 处理EMF设置文本颜色记录
    processEmfSetTextColor(data) {
        console.log('Processing EMR_SETTEXTCOLOR record');
        if (data.length >= 4) {
            const color = this.readDwordFromData(data, 0);
            // 转换为RGB颜色
            const r = (color >> 16) & 0xFF;
            const g = (color >> 8) & 0xFF;
            const b = color & 0xFF;
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            console.log('Setting text color:', hexColor);
            this.ctx.strokeStyle = hexColor;
            this.strokeColor = hexColor;
        }
    }

    // 处理EMF设置填充模式记录
    processEmfSetFillMode(data) {
        console.log('Processing EMR_SETFILLMODE record');
        if (data.length >= 4) {
            const fillMode = this.readDwordFromData(data, 0);
            console.log('Setting fill mode:', fillMode);
            // 填充模式：1 = ALTERNATE, 2 = WINDING
            this.ctx.fillStyle = this.fillColor;
        }
    }

    // 从数据中读取双字（32位）
    readDwordFromData(data, offset) {
        if (offset + 4 <= data.length) {
            return data[offset] | 
                   (data[offset + 1] << 8) | 
                   (data[offset + 2] << 16) | 
                   (data[offset + 3] << 24);
        }
        return 0;
    }

    // 处理EMF+函数
    processEmfPlusFunction(data) {
        console.log('EMF+ function detected, processing');
        // 解析EMF+函数数据
        console.log('EMF+ function data length:', data.length);
        
        // 解析EMF+记录类型
        if (data.length >= 4) {
            const recordType = this.readDwordFromData(data, 0);
            console.log('EMF+ record type:', recordType, '(0x' + recordType.toString(16).padStart(8, '0') + ')');
            
            // 根据EMF+记录类型处理不同的函数
            this.processEmfPlusRecord(recordType, data.slice(4));
        }
    }

    // 处理EMF+记录
    processEmfPlusRecord(recordType, data) {
        console.log('Processing EMF+ record:', recordType);
        
        // 根据EMF+记录类型执行不同的处理
        switch (recordType) {
            case 0x4001: // EmfPlusHeader
                this.processEmfPlusHeader(data);
                break;
            case 0x4002: // EmfPlusEndOfFile
                this.processEmfPlusEndOfFile(data);
                break;
            case 0x4003: // EmfPlusFillRects
                this.processEmfPlusFillRects(data);
                break;
            case 0x4004: // EmfPlusDrawRects
                this.processEmfPlusDrawRects(data);
                break;
            case 0x4005: // EmfPlusFillPolygon
                this.processEmfPlusFillPolygon(data);
                break;
            case 0x4006: // EmfPlusDrawPolygon
                this.processEmfPlusDrawPolygon(data);
                break;
            case 0x4007: // EmfPlusFillEllipse
                this.processEmfPlusFillEllipse(data);
                break;
            case 0x4008: // EmfPlusDrawEllipse
                this.processEmfPlusDrawEllipse(data);
                break;
            case 0x1d5e0cd0: // 未知EMF+记录类型，尝试解析为通用图形数据
                this.processUnknownEmfPlusRecord(recordType, data);
                break;
            default:
                console.log('Unknown EMF+ record type:', recordType);
                // 尝试通用处理
                this.processUnknownEmfPlusRecord(recordType, data);
                break;
        }
    }

    // 处理未知EMF+记录类型
    processUnknownEmfPlusRecord(recordType, data) {
        console.log('Processing unknown EMF+ record type:', recordType);
        console.log('Data length:', data.length);
        
        // 尝试解析为通用图形数据
        // 这里可以根据实际情况添加更复杂的解析逻辑
        if (data.length >= 16) {
            // 尝试解析为矩形
            const left = this.readDwordFromData(data, 0);
            const top = this.readDwordFromData(data, 4);
            const right = this.readDwordFromData(data, 8);
            const bottom = this.readDwordFromData(data, 12);
            
            // 转换坐标
            const transformedLeftTop = this.transformCoord(left, top);
            const transformedRightBottom = this.transformCoord(right, bottom);
            
            // 检查是否是有效的矩形
            if (right > left && bottom > top) {
                console.log('Possible EMF+ rectangle detected:', left, top, right, bottom);
                console.log('Transformed EMF+ rectangle:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
                this.ctx.strokeRect(
                    transformedLeftTop.x,
                    transformedLeftTop.y,
                    transformedRightBottom.x - transformedLeftTop.x,
                    transformedRightBottom.y - transformedLeftTop.y
                );
            }
        }
    }

    // 处理EMF+文件头记录
    processEmfPlusHeader(data) {
        console.log('Processing EmfPlusHeader record');
        // 解析EMF+文件头数据
        if (data.length >= 88) {
            const header = {
                Flags: this.readDwordFromData(data, 0),
                Version: this.readDwordFromData(data, 4),
                EmfPlusFlags: this.readDwordFromData(data, 8),
                LogicalDpiX: this.readDwordFromData(data, 12),
                LogicalDpiY: this.readDwordFromData(data, 16),
                Bounds: {
                    left: this.readDwordFromData(data, 20),
                    top: this.readDwordFromData(data, 24),
                    right: this.readDwordFromData(data, 28),
                    bottom: this.readDwordFromData(data, 32)
                },
                Frame: {
                    left: this.readDwordFromData(data, 36),
                    top: this.readDwordFromData(data, 40),
                    right: this.readDwordFromData(data, 44),
                    bottom: this.readDwordFromData(data, 48)
                }
            };
            console.log('EMF+ Header:', header);
            // 设置Canvas大小
            this.ctx.canvas.width = header.Bounds.right - header.Bounds.left;
            this.ctx.canvas.height = header.Bounds.bottom - header.Bounds.top;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        }
    }

    // 处理EMF+文件结束记录
    processEmfPlusEndOfFile(data) {
        console.log('Processing EmfPlusEndOfFile record');
        // 解析EMF+文件结束数据
        // EMF+文件结束记录通常不包含额外数据
        console.log('EMF+ file ended');
    }

    // 处理EMF+填充矩形记录
    processEmfPlusFillRects(data) {
        console.log('Processing EmfPlusFillRects record');
        // 解析EMF+填充矩形数据
        if (data.length >= 12) {
            const count = this.readDwordFromData(data, 0);
            const rects = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 12 + i * 16);
                const y = this.readDwordFromData(data, 16 + i * 16);
                const width = this.readDwordFromData(data, 20 + i * 16);
                const height = this.readDwordFromData(data, 24 + i * 16);
                const transformed = this.transformCoord(x, y);
                rects.push({ x: transformed.x, y: transformed.y, width, height });
            }
            console.log('EMF+ FillRects count:', count);
            console.log('EMF+ FillRects:', rects);
            
            // 实现EMF+填充矩形绘制逻辑
            for (const rect of rects) {
                this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
    }

    // 处理EMF+绘制矩形记录
    processEmfPlusDrawRects(data) {
        console.log('Processing EmfPlusDrawRects record');
        // 解析EMF+绘制矩形数据
        if (data.length >= 12) {
            const count = this.readDwordFromData(data, 0);
            const rects = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 12 + i * 16);
                const y = this.readDwordFromData(data, 16 + i * 16);
                const width = this.readDwordFromData(data, 20 + i * 16);
                const height = this.readDwordFromData(data, 24 + i * 16);
                const transformed = this.transformCoord(x, y);
                rects.push({ x: transformed.x, y: transformed.y, width, height });
            }
            console.log('EMF+ DrawRects count:', count);
            console.log('EMF+ DrawRects:', rects);
            
            // 实现EMF+绘制矩形逻辑
            for (const rect of rects) {
                this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
    }

    // 处理EMF+填充多边形记录
    processEmfPlusFillPolygon(data) {
        console.log('Processing EmfPlusFillPolygon record');
        // 解析EMF+填充多边形数据
        if (data.length >= 12) {
            const count = this.readDwordFromData(data, 0);
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 12 + i * 8);
                const y = this.readDwordFromData(data, 16 + i * 8);
                const transformed = this.transformCoord(x, y);
                points.push(transformed);
            }
            console.log('EMF+ FillPolygon count:', count);
            console.log('EMF+ FillPolygon points:', points);
            
            // 实现EMF+填充多边形绘制逻辑
            if (points.length >= 3) {
                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(points[i].x, points[i].y);
                }
                this.ctx.closePath();
                this.ctx.fill();
            }
        }
    }

    // 处理EMF+绘制多边形记录
    processEmfPlusDrawPolygon(data) {
        console.log('Processing EmfPlusDrawPolygon record');
        // 解析EMF+绘制多边形数据
        if (data.length >= 12) {
            const count = this.readDwordFromData(data, 0);
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = this.readDwordFromData(data, 12 + i * 8);
                const y = this.readDwordFromData(data, 16 + i * 8);
                const transformed = this.transformCoord(x, y);
                points.push(transformed);
            }
            console.log('EMF+ DrawPolygon count:', count);
            console.log('EMF+ DrawPolygon points:', points);
            
            // 实现EMF+绘制多边形逻辑
            if (points.length >= 2) {
                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(points[i].x, points[i].y);
                }
                this.ctx.closePath();
                this.ctx.stroke();
            }
        }
    }

    // 处理EMF+填充椭圆记录
    processEmfPlusFillEllipse(data) {
        console.log('Processing EmfPlusFillEllipse record');
        // 解析EMF+填充椭圆数据
        if (data.length >= 16) {
            const x = this.readDwordFromData(data, 0);
            const y = this.readDwordFromData(data, 4);
            const width = this.readDwordFromData(data, 8);
            const height = this.readDwordFromData(data, 12);
            const transformed = this.transformCoord(x, y);
            console.log('EMF+ FillEllipse:', x, y, width, height);
            console.log('Transformed EMF+ FillEllipse:', transformed.x, transformed.y, width, height);
            
            // 实现EMF+填充椭圆绘制逻辑
            this.ctx.beginPath();
            this.ctx.ellipse(
                transformed.x + width / 2,
                transformed.y + height / 2,
                width / 2,
                height / 2,
                0,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        }
    }

    // 处理EMF+绘制椭圆记录
    processEmfPlusDrawEllipse(data) {
        console.log('Processing EmfPlusDrawEllipse record');
        // 解析EMF+绘制椭圆数据
        if (data.length >= 16) {
            const x = this.readDwordFromData(data, 0);
            const y = this.readDwordFromData(data, 4);
            const width = this.readDwordFromData(data, 8);
            const height = this.readDwordFromData(data, 12);
            const transformed = this.transformCoord(x, y);
            console.log('EMF+ DrawEllipse:', x, y, width, height);
            console.log('Transformed EMF+ DrawEllipse:', transformed.x, transformed.y, width, height);
            
            // 实现EMF+绘制椭圆逻辑
            this.ctx.beginPath();
            this.ctx.ellipse(
                transformed.x + width / 2,
                transformed.y + height / 2,
                width / 2,
                height / 2,
                0,
                0,
                Math.PI * 2
            );
            this.ctx.stroke();
        }
    }

    processMoveTo(data) {
        // 解析MoveTo命令的坐标
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('MoveTo:', x, y);
        const transformed = this.transformCoord(x, y);
        console.log('Transformed MoveTo:', transformed.x, transformed.y);
        // 只有在路径状态为idle时才开始新路径
        if (this.pathState === 'idle') {
            this.ctx.beginPath();
            this.pathState = 'active';
        }
        this.ctx.moveTo(transformed.x, transformed.y);
        this.currentPath = [{x: transformed.x, y: transformed.y}];
    }

    processLineTo(data) {
        // 解析LineTo命令的坐标
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        console.log('LineTo:', x, y);
        const transformed = this.transformCoord(x, y);
        console.log('Transformed LineTo:', transformed.x, transformed.y);
        // 确保路径已开始
        if (this.pathState === 'idle') {
            this.ctx.beginPath();
            // 使用当前路径的最后一个点作为起点
            if (this.currentPath.length > 0) {
                const lastPoint = this.currentPath[this.currentPath.length - 1];
                this.ctx.moveTo(lastPoint.x, lastPoint.y);
            } else {
                this.ctx.moveTo(transformed.x, transformed.y);
            }
            this.pathState = 'active';
        }
        this.ctx.lineTo(transformed.x, transformed.y);
        this.currentPath.push({x: transformed.x, y: transformed.y});
        // 只有在路径完成时才描边
        // this.ctx.stroke(); // 移除即时描边，改为在路径结束时描边
    }

    processRectangle(data) {
        // 解析Rectangle命令的坐标
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        console.log('Rectangle:', left, top, right, bottom);
        const transformedLeftTop = this.transformCoord(left, top);
        const transformedRightBottom = this.transformCoord(right, bottom);
        console.log('Transformed Rectangle:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
        this.ctx.strokeRect(
            transformedLeftTop.x,
            transformedLeftTop.y,
            transformedRightBottom.x - transformedLeftTop.x,
            transformedRightBottom.y - transformedLeftTop.y
        );
    }

    processEllipse(data) {
        // 解析Ellipse命令的坐标
        const left = this.readWordFromData(data, 0);
        const top = this.readWordFromData(data, 2);
        const right = this.readWordFromData(data, 4);
        const bottom = this.readWordFromData(data, 6);
        console.log('Ellipse:', left, top, right, bottom);
        const transformedLeftTop = this.transformCoord(left, top);
        const transformedRightBottom = this.transformCoord(right, bottom);
        console.log('Transformed Ellipse:', transformedLeftTop.x, transformedLeftTop.y, transformedRightBottom.x, transformedRightBottom.y);
        this.ctx.beginPath();
        this.ctx.ellipse(
            (transformedLeftTop.x + transformedRightBottom.x) / 2,
            (transformedLeftTop.y + transformedRightBottom.y) / 2,
            (transformedRightBottom.x - transformedLeftTop.x) / 2,
            (transformedRightBottom.y - transformedLeftTop.y) / 2,
            0,
            0,
            Math.PI * 2
        );
        this.ctx.stroke();
    }

    processTextOut(data) {
        // 解析TextOut命令
        const x = this.readWordFromData(data, 0);
        const y = this.readWordFromData(data, 2);
        const length = this.readWordFromData(data, 4);
        const text = this.readStringFromData(data, 6, length);
        console.log('TextOut:', x, y, text);
        const transformed = this.transformCoord(x, y);
        console.log('Transformed TextOut:', transformed.x, transformed.y, text);
        this.ctx.fillText(text, transformed.x, transformed.y);
    }
    
    // 完成路径处理
    finishPath() {
        if (this.pathState === 'active' && this.currentPath.length >= 2) {
            console.log('Finishing active path with', this.currentPath.length, 'points');
            this.ctx.stroke();
            this.pathState = 'idle';
            this.currentPath = [];
        }
    }

    readWordFromData(data, offset) {
        if (offset + 2 <= data.length) {
            return data[offset] | (data[offset + 1] << 8);
        }
        return 0;
    }

    readStringFromData(data, offset, length) {
        let text = '';
        for (let i = 0; i < length && offset + i < data.length; i++) {
            text += String.fromCharCode(data[offset + i]);
        }
        return text;
    }
}

// 解码base64数据并解析WMF
function decodeBase64(base64) {
    console.log('Decoding base64 data with length:', base64.length);
    try {
        const binaryString = atob(base64);
        const length = binaryString.length;
        console.log('Decoded binary string length:', length);
        
        // 检查前几个字节，确认是否是标准WMF文件
        if (length >= 6) {
            const magic1 = binaryString.charCodeAt(0);
            const magic2 = binaryString.charCodeAt(1);
            console.log('WMF Magic bytes:', magic1, magic2);
            // 标准WMF文件的前两个字节应该是0x01 0x00 (TYPE_PLACEABLE)
            if (magic1 === 0x01 && magic2 === 0x00) {
                console.log('Detected placeable WMF file');
            } else {
                console.log('Non-placeable WMF file or not a WMF file');
            }
        }
        
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        console.log('Created Uint8Array with length:', bytes.length);
        
        // 输出前20个字节的十六进制，便于分析文件格式
        console.log('First 20 bytes (hex):', Array.from(bytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        return bytes;
    } catch (error) {
        console.error('Error decoding base64:', error);
        throw error;
    }
}

// 预览WMF文件
async function previewWMF(base64Data) {
    console.log('Starting WMF preview...');
    try {
        console.log('Base64 data length:', base64Data.length);
        const wmfData = decodeBase64(base64Data);
        
        const parser = new WmfParser(wmfData);
        const parsedData = parser.parse();
        
        const canvas = document.getElementById('wmfCanvas');
        console.log('Canvas element:', canvas);
        if (!canvas) {
            throw new Error('Canvas element not found');
        }
        
        const ctx = canvas.getContext('2d');
        console.log('Canvas context:', ctx);
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }
        
        const drawer = new WmfDrawer(ctx);
        drawer.draw(parsedData);
        
        console.log('WMF preview completed successfully');
    } catch (error) {
        console.error('Error parsing WMF:', error);
        document.getElementById('error').textContent = 'Error parsing WMF file: ' + error.message;
    }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WmfParser, WmfDrawer, decodeBase64, previewWMF };
}
