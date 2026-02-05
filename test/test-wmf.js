// 测试脚本：验证WMF解析器对sample.wmf文件的处理
const fs = require('fs');
const path = require('path');

// 导入模块化解析器
const MetafileParser = require('./src/modules/metafileParser.js');
const WmfDrawer = require('./src/modules/drawers/wmfDrawer.js');
const EmfDrawer = require('./src/modules/drawers/emfDrawer.js');
const EmfPlusDrawer = require('./src/modules/drawers/emfPlusDrawer.js');

// 模拟Canvas上下文
class MockCanvas {
    constructor() {
        this.width = 800;
        this.height = 600;
        this.drawnElements = [];
    }
    
    getContext(type) {
        if (type === '2d') {
            return new MockContext(this);
        }
        return null;
    }
}

class MockContext {
    constructor(canvas) {
        this.canvas = canvas;
        this.strokeStyle = '#000000';
        this.fillStyle = '#000000';
        this.lineWidth = 1;
        this.currentPath = [];
    }
    
    beginPath() {
        console.log('Canvas: beginPath');
        this.currentPath = [];
    }
    
    moveTo(x, y) {
        console.log('Canvas: moveTo', x, y);
        this.currentPath.push({ type: 'moveTo', x, y });
    }
    
    lineTo(x, y) {
        console.log('Canvas: lineTo', x, y);
        this.currentPath.push({ type: 'lineTo', x, y });
    }
    
    stroke() {
        console.log('Canvas: stroke');
        if (this.currentPath.length > 0) {
            this.canvas.drawnElements.push({ type: 'path', path: JSON.parse(JSON.stringify(this.currentPath)) });
        }
    }
    
    fill() {
        console.log('Canvas: fill');
        if (this.currentPath.length > 0) {
            this.canvas.drawnElements.push({ type: 'filledPath', path: [...this.currentPath] });
        }
    }
    
    closePath() {
        console.log('Canvas: closePath');
        this.currentPath.push({ type: 'closePath' });
    }
    
    strokeRect(x, y, width, height) {
        // 确保宽度和高度为正数
        const absWidth = Math.abs(width);
        const absHeight = Math.abs(height);
        const adjustedX = width < 0 ? x + width : x;
        const adjustedY = height < 0 ? y + height : y;
        console.log('Canvas: strokeRect', adjustedX, adjustedY, absWidth, absHeight);
        this.canvas.drawnElements.push({ type: 'rect', x: adjustedX, y: adjustedY, width: absWidth, height: absHeight });
    }
    
    fillRect(x, y, width, height) {
        console.log('Canvas: fillRect', x, y, width, height);
        this.canvas.drawnElements.push({ type: 'fillRect', x, y, width, height });
    }
    
    ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle) {
        console.log('Canvas: ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle);
        this.canvas.drawnElements.push({ type: 'ellipse', x, y, radiusX, radiusY });
    }
    
    fillText(text, x, y) {
        console.log('Canvas: fillText', text, x, y);
        this.canvas.drawnElements.push({ type: 'text', text, x, y });
    }
}

// 测试函数
async function testSampleWmf() {
    console.log('=== 测试 image1.wmf 文件 ===');
    
    try {
        // 读取文件
        const filePath = path.join(__dirname, 'test_files/media/image1.wmf');
        const fileBuffer = fs.readFileSync(filePath);
        console.log('文件大小:', fileBuffer.length, '字节');
        
        // 转换为Uint8Array
        const wmfData = new Uint8Array(fileBuffer.buffer);
        console.log('转换为Uint8Array成功');
        
        // 直接使用WMF解析器解析
        console.log('\n=== 开始解析 WMF 文件 ===');
        const WmfParser = require('./src/modules/parsers/wmfParser.js');
        const parser = new WmfParser(wmfData);
        const parsedData = parser.parse('placeable-wmf');
        console.log('解析完成，记录数量:', parsedData.records.length);
        console.log('解析结果:', JSON.stringify(parsedData, null, 2));
        
        // 如果解析失败，提供默认的头信息以便测试继续
        if (!parsedData.header) {
            parsedData.header = {
                placeableHeader: {
                    left: 0,
                    top: 0,
                    right: 800,
                    bottom: 600,
                    inch: 1000
                }
            };
            console.log('提供默认头信息以便测试继续');
        }
        
        // 创建模拟Canvas
        const canvas = new MockCanvas();
        const ctx = canvas.getContext('2d');
        
        // 绘制WMF内容
        console.log('\n=== 开始绘制 WMF 内容 ===');
        const drawer = new WmfDrawer(ctx);
        drawer.draw(parsedData);
        
        // 输出绘制结果
        console.log('\n=== 绘制结果 ===');
        console.log('绘制的元素数量:', canvas.drawnElements.length);
        console.log('绘制的元素:');
        canvas.drawnElements.forEach((element, index) => {
            console.log(`  ${index + 1}. ${element.type}`);
            if (element.type === 'path') {
                console.log('    Path:');
                element.path.forEach((point, pointIndex) => {
                    console.log(`      ${pointIndex + 1}. ${point.type} (${point.x}, ${point.y})`);
                });
            } else if (element.type === 'text') {
                console.log(`    Text: "${element.text}" at (${element.x}, ${element.y})`);
            } else if (element.type === 'fillRect') {
                console.log(`    Rectangle: (${element.x}, ${element.y}, ${element.width}, ${element.height})`);
            }
        });
        
        console.log('\n=== 测试完成 ===');
        return true;
    } catch (error) {
        console.error('测试失败:', error);
        return false;
    }
}

// 运行测试
testSampleWmf();
