// 综合测试脚本：验证WMF、EMF和EMF+解析器是否符合标准规范
const fs = require('fs');
const path = require('path');
const MetafileParser = require('./src/modules/metafileParser.js');

console.log('='.repeat(80));
console.log('WMF/EMF/EMF+ 解析器标准规范符合性测试');
console.log('='.repeat(80));
console.log();

// 测试结果统计
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// 测试一个文件
function testFile(fileName, expectedType, expectedMinRecords) {
    console.log(`\n测试文件: ${fileName}`);
    console.log('-'.repeat(80));
    
    try {
        const filePath = path.join(__dirname, fileName);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            console.log(`❌ 文件不存在: ${fileName}`);
            results.failed++;
            results.tests.push({ file: fileName, status: 'FAILED', reason: '文件不存在' });
            return false;
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`✓ 文件大小: ${fileBuffer.length} 字节`);
        
        const data = new Uint8Array(fileBuffer.buffer);
        const parser = new MetafileParser(data);
        const parsedData = parser.parse();
        
        // 验证文件类型检测
        console.log(`✓ 检测到的文件类型: ${parser.fileType}`);
        if (parser.fileType !== expectedType) {
            console.log(`❌ 文件类型不匹配! 期望: ${expectedType}, 实际: ${parser.fileType}`);
            results.failed++;
            results.tests.push({ file: fileName, status: 'FAILED', reason: '文件类型不匹配' });
            return false;
        }
        
        // 验证是否成功解析
        if (!parsedData.header) {
            console.log(`❌ 头部解析失败`);
            results.failed++;
            results.tests.push({ file: fileName, status: 'FAILED', reason: '头部解析失败' });
            return false;
        }
        console.log(`✓ 头部解析成功`);
        
        // 验证记录数量
        console.log(`✓ 解析的记录数: ${parsedData.records.length}`);
        if (parsedData.records.length < expectedMinRecords) {
            console.log(`❌ 记录数量不足! 期望至少: ${expectedMinRecords}, 实际: ${parsedData.records.length}`);
            results.failed++;
            results.tests.push({ file: fileName, status: 'FAILED', reason: '记录数量不足' });
            return false;
        }
        
        // 验证头部字段
        if (expectedType === 'wmf' || expectedType === 'placeable-wmf') {
            // WMF头部验证
            console.log(`✓ WMF头部类型: ${parsedData.header.type}`);
            console.log(`✓ WMF头部大小: ${parsedData.header.headerSize}`);
            console.log(`✓ WMF版本: 0x${parsedData.header.version.toString(16)}`);
            console.log(`✓ 对象数量: ${parsedData.header.numObjects}`);
            
            // 验证头部大小必须为9 WORDs
            if (parsedData.header.headerSize !== 9) {
                console.log(`⚠️  警告: 非标准WMF头部大小 (期望9, 实际${parsedData.header.headerSize})`);
            }
            
            // 如果是Placeable WMF，验证签名
            if (expectedType === 'placeable-wmf' && parsedData.header.placeableHeader) {
                const key = parsedData.header.placeableHeader.key;
                console.log(`✓ Placeable WMF签名: 0x${key.toString(16).toUpperCase()}`);
                if (key !== 0x9AC6CDD7) {
                    console.log(`❌ Placeable WMF签名无效! 期望: 0x9AC6CDD7, 实际: 0x${key.toString(16)}`);
                    results.failed++;
                    results.tests.push({ file: fileName, status: 'FAILED', reason: 'Placeable签名无效' });
                    return false;
                }
                console.log(`✓ Placeable边界: left=${parsedData.header.placeableHeader.left}, top=${parsedData.header.placeableHeader.top}, right=${parsedData.header.placeableHeader.right}, bottom=${parsedData.header.placeableHeader.bottom}`);
            }
        } else if (expectedType === 'emf' || expectedType === 'emf+') {
            // EMF头部验证
            console.log(`✓ EMF记录类型: ${parsedData.header.iType}`);
            console.log(`✓ EMF头部大小: ${parsedData.header.nSize} 字节`);
            console.log(`✓ EMF签名: 0x${parsedData.header.dSignature.toString(16).toUpperCase()}`);
            console.log(`✓ EMF版本: 0x${parsedData.header.nVersion.toString(16)}`);
            console.log(`✓ 文件总字节数: ${parsedData.header.nBytes}`);
            console.log(`✓ 记录总数: ${parsedData.header.nRecords}`);
            
            // 验证EMF签名
            if (parsedData.header.dSignature !== 0x464D4520) {
                console.log(`❌ EMF签名无效! 期望: 0x464D4520, 实际: 0x${parsedData.header.dSignature.toString(16)}`);
                results.failed++;
                results.tests.push({ file: fileName, status: 'FAILED', reason: 'EMF签名无效' });
                return false;
            }
            
            // 验证iType必须为1
            if (parsedData.header.iType !== 1) {
                console.log(`❌ EMF记录类型无效! 期望: 1, 实际: ${parsedData.header.iType}`);
                results.failed++;
                results.tests.push({ file: fileName, status: 'FAILED', reason: 'EMF类型无效' });
                return false;
            }
            
            console.log(`✓ 边界框: left=${parsedData.header.bounds.left}, top=${parsedData.header.bounds.top}, right=${parsedData.header.bounds.right}, bottom=${parsedData.header.bounds.bottom}`);
            console.log(`✓ 设备尺寸: ${parsedData.header.szlDevice.cx}x${parsedData.header.szlDevice.cy} 像素`);
            console.log(`✓ 物理尺寸: ${parsedData.header.szlMillimeters.cx}x${parsedData.header.szlMillimeters.cy} 毫米`);
        }
        
        console.log(`\n✅ ${fileName} 测试通过`);
        results.passed++;
        results.tests.push({ file: fileName, status: 'PASSED', records: parsedData.records.length });
        return true;
        
    } catch (error) {
        console.log(`❌ 测试失败: ${error.message}`);
        console.error(error.stack);
        results.failed++;
        results.tests.push({ file: fileName, status: 'FAILED', reason: error.message });
        return false;
    }
}

// 执行所有测试
console.log('开始执行测试套件...\n');

// 测试WMF文件
testFile('test_files/sample.wmf', 'placeable-wmf', 100);

// 测试EMF文件（如果存在）
if (fs.existsSync(path.join(__dirname, 'test_files/example.emf'))) {
    testFile('example.emf', 'emf', 100);
}

// 打印测试结果总结
console.log('\n');
console.log('='.repeat(80));
console.log('测试结果总结');
console.log('='.repeat(80));
console.log(`总测试数: ${results.passed + results.failed}`);
console.log(`✅ 通过: ${results.passed}`);
console.log(`❌ 失败: ${results.failed}`);
console.log(`成功率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%`);
console.log();

// 详细结果
console.log('详细结果:');
results.tests.forEach((test, index) => {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`  ${index + 1}. ${status} ${test.file} - ${test.status}`);
    if (test.records) {
        console.log(`     解析记录数: ${test.records}`);
    }
    if (test.reason) {
        console.log(`     原因: ${test.reason}`);
    }
});

console.log();
console.log('='.repeat(80));

// 退出码
process.exit(results.failed > 0 ? 1 : 0);
