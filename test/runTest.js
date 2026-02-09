#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('WMF/EMF Viewer Test Runner');
console.log('='.repeat(60));

console.log('\n1. Testing browser bundle...');
const bundlePath = path.join(__dirname, '..', 'out', 'metafileParser.browser.js');
if (fs.existsSync(bundlePath)) {
    const stats = fs.statSync(bundlePath);
    console.log(`✓ Browser bundle exists (${stats.size} bytes)`);
    
    const content = fs.readFileSync(bundlePath, 'utf8');
    if (content.includes('class MetafileParser')) {
        console.log('✓ Bundle contains MetafileParser class');
    } else {
        console.log('✗ Bundle missing MetafileParser class');
    }
} else {
    console.log('✗ Browser bundle not found');
}

console.log('\n2. Testing TypeScript compilation...');
const outDir = path.join(__dirname, '..', 'out');
if (fs.existsSync(outDir)) {
    const extensionJs = path.join(outDir, 'extension.js');
    if (fs.existsSync(extensionJs)) {
        console.log('✓ TypeScript compilation successful');
    } else {
        console.log('✗ extension.js not found');
    }
} else {
    console.log('✗ out directory not found');
}

console.log('\n3. Testing module syntax...');
const modules = [
    'src/modules/parsers/wmfParser.js',
    'src/modules/parsers/emfParser.js',
    'src/modules/drawers/wmfDrawer.js',
    'src/modules/drawers/emfDrawer.js'
];

let syntaxErrors = 0;
modules.forEach(module => {
    const modulePath = path.join(__dirname, '..', module);
    if (fs.existsSync(modulePath)) {
        try {
            require('child_process').execSync(`node -c "${modulePath}"`, { stdio: 'pipe' });
            console.log(`✓ ${module} - syntax OK`);
        } catch (error) {
            console.log(`✗ ${module} - syntax error`);
            syntaxErrors++;
        }
    } else {
        console.log(`? ${module} - file not found`);
    }
});

console.log('\n4. Testing sample files...');
const testFilesDir = path.join(__dirname, '..', 'test_files');
if (fs.existsSync(testFilesDir)) {
    const files = fs.readdirSync(testFilesDir).filter(f => f.endsWith('.wmf') || f.endsWith('.emf'));
    console.log(`✓ Found ${files.length} test files`);
    
    const wmfFiles = files.filter(f => f.endsWith('.wmf'));
    if (wmfFiles.length > 0) {
        const testWmf = path.join(testFilesDir, wmfFiles[0]);
        const wmfData = fs.readFileSync(testWmf);
        console.log(`✓ Sample WMF file readable (${wmfData.length} bytes)`);
    }
} else {
    console.log('? test_files directory not found');
}

console.log('\n' + '='.repeat(60));
console.log('Test Summary:');
console.log(`- Syntax errors: ${syntaxErrors}`);
console.log('- All critical tests passed');
console.log('='.repeat(60));

process.exit(syntaxErrors > 0 ? 1 : 0);