# AGENTS.md - Development Guide for WmfEmfViewer

This file contains essential information for agentic coding agents working in this repository.

## Project Overview

**WMF Viewer** is a Visual Studio Code extension that allows previewing WMF (Windows Metafile Format) images directly in the editor. It's built with TypeScript and provides both preview and custom editor modes.

- **Type**: VSCode Extension
- **Language**: TypeScript (main), JavaScript (parser)
- **Target**: VSCode ^1.75.0
- **Output**: `./out/` directory (compiled JS)

## Build & Development Commands

### Essential Commands
```bash
# Compile TypeScript to JavaScript
npm run compile

# Watch for changes and compile automatically
npm run watch

# Lint TypeScript files
npm run lint

# Run tests (includes compilation and linting)
npm run test

# Package extension into VSIX file
npm run package

# Development: Run extension in debug mode (F5 in VSCode)
```

### Before Making Changes
Always run `npm run compile` to ensure TypeScript compilation works.  
For production builds, run `npm run package` to create the VSIX.

## Code Style Guidelines

### TypeScript Configuration
- **Target**: ES2020
- **Module**: CommonJS
- **Strict mode**: Enabled
- **Source maps**: Enabled
- **Input**: `./src/**/*`
- **Output**: `./out/`

### Import Style
```typescript
// Use consistent import style
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
```

### Naming Conventions
- **Classes**: PascalCase (`WmfEditorProvider`, `WmfParser`, `WmfDrawer`)
- **Methods**: camelCase (`openCustomDocument`, `processRecord`)
- **Variables**: camelCase (`wmfContent`, `canvasWidth`)
- **Constants**: UPPER_SNAKE_CASE (rare, use camelCase mostly)
- **File names**: kebab-case for files, PascalCase for classes (`extension.ts`, `wmfParser.js`)

### Error Handling
```typescript
// Use async/await with try-catch
async openCustomDocument(uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
    try {
        // Implementation
        return { uri, dispose: () => {} };
    } catch (error) {
        console.error('Error opening document:', error);
        throw error;
    }
}
```

### Console Logging
- Use consistent logging: `console.log('WMF Viewer extension activated');`
- Include context in logs: `console.log('Processing record', i, ':', record);`
- Error logs: `console.error('Error in preview:', error);`

## File Structure & Architecture

### Core Files
```
src/
├── extension.ts      # Main extension entry point (VSCode API)
├── wmfParser.js      # WMF parsing and rendering logic (JavaScript)
└── webview.html      # HTML template for WMF preview
```

### Architecture Patterns
- **Extension API**: Uses VSCode's CustomEditorProvider for seamless integration
- **Parser**: Separated WmfParser and WmfDrawer classes for clear responsibilities
- **WebView**: Uses HTML template with base64 data embedding
- **Context Management**: Uses VSCode extension context for resource management

### Key Classes
- `WmfEditorProvider`: Implements vscode.CustomEditorProvider
- `WmfParser`: Handles WMF binary data parsing
- `WmfDrawer`: Converts WMF commands to Canvas 2D rendering

## Testing

### Test Files
- `test-wmf.js`: Node.js test script with mock Canvas implementation
- No automated test framework currently configured

### Manual Testing
```bash
# Run the standalone test
node test-wmf.js

# Test extension in VSCode
# 1. Open project in VSCode
# 2. Press F5 to launch Extension Development Host
# 3. Open a .wmf file to test
```

## Linting

### ESLint Configuration
- Uses @typescript-eslint/parser and @typescript-eslint/eslint-plugin
- Configured for TypeScript files in `src/` directory
- Run with: `npm run lint`

### Common Lint Issues
- Always run lint before committing
- Fix TypeScript strict mode errors
- Ensure proper type annotations

## VSCode Extension Specifics

### Extension Manifest (package.json)
- **Activation Events**: `onView:wmfViewer`, `onCommand:wmfViewer.preview`, `onFileSystem:file`
- **Main Entry**: `./out/extension.js`
- **Custom Editor**: `wmfViewer.editor` for `.wmf` files
- **Contributions**: Explorer context menu, custom editor, preview command

### WebView Security
- Use `localResourceRoots` for secure resource loading
- Handle base64 data embedding properly
- Enable scripts with caution (`enableScripts: true`)

## Development Workflow

### Before Starting Work
1. Run `npm install` to ensure dependencies
2. Run `npm run compile` to verify build
3. Check existing code patterns in relevant files

### When Adding Features
1. Follow existing class and method naming patterns
2. Add proper TypeScript types
3. Include error handling and logging
4. Test with sample .wmf files

### Common Patterns
- **File Operations**: Use `fs.readFileSync()` with proper error handling
- **Path Operations**: Use `path.join()` for cross-platform compatibility
- **Base64 Handling**: Convert binary data with `.toString('base64')`
- **WebView HTML**: Use template replacement for dynamic content

## WMF/EMF Format Considerations

### Parser Implementation
- Handles both WMF and EMF formats
- Uses multiple parsing strategies for compatibility
- Implements coordinate transformation for Canvas rendering
- Extensive logging for debugging format issues

### Rendering Pipeline
1. Parse binary WMF/EMF data
2. Convert to Canvas 2D commands
3. Apply coordinate transformations
4. Render in webview canvas

## Common Gotchas

- **TypeScript Compilation**: Always compile before testing
- **WebView Paths**: Use `asWebviewUri()` for secure resource loading
- **Binary Data**: Handle Uint8Array conversions properly
- **Extension Context**: Pass context correctly to resource loaders
- **File Extensions**: Ensure `.wmf` files are properly associated

## Dependencies

### Runtime Dependencies
- None (self-contained extension)

### Development Dependencies
- @types/vscode: VSCode API types
- @typescript-eslint/*: TypeScript linting
- typescript: TypeScript compiler
- eslint: JavaScript linting
- @vscode/test-electron: VSCode testing utilities

## Security Notes

- WebView scripts are enabled for WMF rendering
- File system access limited to .wmf files
- Base64 data embedding prevents direct file access
- Local resource roots properly configured