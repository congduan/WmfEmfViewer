# AGENTS.md - Development Guide for WmfEmfViewer

This file contains essential information for agentic coding agents working in this repository.

## Project Overview

**WMF/EMF Viewer** is a Visual Studio Code extension that allows previewing WMF (Windows Metafile), EMF (Enhanced Metafile), and EMF+ (Enhanced Metafile Plus) images directly in the editor. It's built with TypeScript for extension logic and modular JavaScript for format parsing and rendering.

- **Type**: VSCode Extension
- **Languages**: TypeScript (extension), JavaScript (parsers/drawers)
- **Target**: VSCode ^1.75.0
- **Output**: `./out/` directory (compiled JS)
- **Formats Supported**: WMF, Placeable WMF, EMF, EMF+

## Build & Development Commands

### Essential Commands
```bash
# Full build (browser bundle + TypeScript compilation)
npm run build

# Build browser bundle only
npm run build:bundle

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
Always run `npm run build` to ensure both bundling and TypeScript compilation work.  
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
- **Classes**: PascalCase (`WmfEditorProvider`, `WmfParser`, `WmfDrawer`, `EmfParser`)
- **Methods**: camelCase (`openCustomDocument`, `processRecord`, `parseEmf`)
- **Variables**: camelCase (`wmfContent`, `canvasWidth`, `fileType`)
- **Constants**: UPPER_SNAKE_CASE (rare, use camelCase mostly)
- **File names**: 
  - TypeScript: camelCase with descriptive names (`extension.ts`, `previewCommand.ts`, `wmfEditorProvider.ts`)
  - JavaScript: camelCase for modules (`wmfParser.js`, `emfDrawer.js`, `coordinateTransformer.js`)
  - Directories: lowercase (`parsers`, `drawers`, `utils`, `commands`)

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

### Project Directory Structure
```
WmfEmfViewer/
├── .vscode/              # VSCode workspace configuration
│   ├── extensions.json   # Recommended extensions
│   ├── launch.json      # Debug configurations
│   ├── settings.json    # Workspace settings
│   └── tasks.json       # Build tasks
│
├── docs/                 # Documentation and specifications
│   ├── PROJECT_STRUCTURE.md  # Detailed structure documentation
│   ├── [MS-WMF].pdf     # WMF format specification
│   ├── [MS-EMF].pdf     # EMF format specification
│   └── [MS-EMFPLUS].pdf # EMF+ format specification
│
├── scripts/              # Development scripts
│   ├── analyze-wmf.js   # WMF analysis tool
│   └── install.sh       # Installation script
│
├── src/                  # Source code (detailed below)
├── test/                 # Test files
│   ├── fixtures/        # Test fixtures
│   ├── test-wmf.js      # WMF unit tests
│   ├── test-all-formats.js  # Multi-format tests
│   ├── test-browser-bundle.html  # Browser test
│   └── test-vscode-fix.html     # VSCode integration test
│
├── test_files/          # Sample files (221 WMF/EMF files)
├── out/                 # Compiled output (gitignored)
├── package.json         # NPM package configuration
├── tsconfig.json        # TypeScript configuration
├── AGENTS.md            # This file
└── README.md            # User documentation
```

### Source Code Structure (`src/`)
```
src/
├── build/               # Build scripts
│   └── build-browser-bundle.js  # Bundles modules for browser
│
├── commands/            # VSCode command implementations
│   └── previewCommand.ts        # Preview command handler
│
├── modules/             # Core parsing and rendering modules
│   ├── parsers/        # Format-specific parsers
│   │   ├── baseParser.js       # Base parser class
│   │   ├── wmfParser.js        # WMF format parser
│   │   ├── emfParser.js        # EMF format parser
│   │   └── emfPlusParser.js    # EMF+ format parser
│   │
│   └── drawers/        # Format-specific renderers
│       ├── baseDrawer.js       # Base drawer with Canvas utils
│       ├── wmfDrawer.js        # WMF renderer (39KB)
│       ├── emfDrawer.js        # EMF renderer (63KB)
│       └── emfPlusDrawer.js    # EMF+ renderer (18KB)
│
├── providers/           # VSCode provider implementations
│   └── wmfEditorProvider.ts    # Custom editor provider
│
├── resources/           # Static resources
│   └── webview.html            # Webview HTML template
│
├── utils/               # Utility modules
│   ├── coordinateTransformer.js  # Coordinate transformations
│   ├── fileTypeDetector.js      # Auto file type detection
│   ├── gdiObjectManager.js      # GDI object state manager
│   ├── metafileParser.js        # Main parser orchestrator
│   └── recordParser.js          # Record parsing utilities
│
└── extension.ts         # Main extension entry point
```

### Architecture Patterns

#### Modular Design
- **Separation of Concerns**: Extension logic (TS) separated from parsing/rendering (JS)
- **Format-Specific Modules**: Each format (WMF/EMF/EMF+) has dedicated parser and drawer
- **Base Classes**: Shared functionality in `BaseParser` and `BaseDrawer`
- **Utility Modules**: Reusable components (coordinate transformation, GDI management)

#### VSCode Integration
- **CustomEditorProvider**: Seamless integration with VSCode editor system
- **Commands**: Separate command handlers in `commands/` directory
- **WebView**: Secure webview with base64 data embedding
- **Context Management**: Proper VSCode extension context handling

#### Build System
- **Browser Bundling**: `build-browser-bundle.js` creates single-file browser bundle
- **Module Syntax Removal**: Strips Node.js `require`/`module.exports` for browser
- **TypeScript Compilation**: Separate TS compilation to `out/` directory

### Key Components

#### Extension Layer (TypeScript)
- **extension.ts**: Main entry point, registers providers and commands
- **wmfEditorProvider.ts**: Custom editor provider for `.wmf`/`.emf` files
- **previewCommand.ts**: Preview command implementation

#### Parsing Layer (JavaScript)
- **FileTypeDetector**: Auto-detects WMF, EMF, EMF+ format from binary signature
- **MetafileParser**: Main parser orchestrator, delegates to format-specific parsers
- **BaseParser**: Common parsing functionality (record iteration, data reading)
- **WmfParser/EmfParser/EmfPlusParser**: Format-specific parsing logic

#### Rendering Layer (JavaScript)
- **BaseDrawer**: Canvas 2D utilities, common drawing operations
- **WmfDrawer/EmfDrawer/EmfPlusDrawer**: Format-specific Canvas rendering
- **CoordinateTransformer**: Handles coordinate system transformations
- **GdiObjectManager**: Manages GDI objects (pens, brushes, fonts)

## Testing

### Test Files
Test files are organized in the `test/` directory:
- **test-wmf.js**: WMF parsing unit tests with mock Canvas
- **test-all-formats.js**: Multi-format support tests
- **test-browser-bundle.html**: Browser rendering tests
- **test-vscode-fix.html**: VSCode integration tests
- **fixtures/**: Test fixtures and sample data

### Sample Files
`test_files/` directory contains 221+ sample files:
- 212 WMF files
- 2 EMF files
- Various image formats for comparison (JPEG, JPG, SVG)

### Manual Testing
```bash
# Run standalone tests
node test/test-wmf.js
node test/test-all-formats.js

# Test extension in VSCode
# 1. Open project in VSCode
# 2. Press F5 to launch Extension Development Host
# 3. Open a .wmf/.emf file from test_files/ to test
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
- **Custom Editor**: `wmfViewer.editor` for `.wmf` and `.emf` files
- **Contributions**: 
  - Explorer context menu for preview command
  - Custom editor for seamless file opening
  - Commands for manual preview triggering

### Build Scripts
- **build**: Full build (bundle + compile)
- **build:bundle**: Run `src/build/build-browser-bundle.js`
- **compile**: TypeScript compilation via `tsc`
- **watch**: Watch mode for development

### WebView Security
- Use `localResourceRoots` for secure resource loading
- Handle base64 data embedding properly
- Enable scripts with caution (`enableScripts: true`)
- WebView HTML located in `src/resources/webview.html`
- Parser script loaded from `out/metafileParser.browser.js`

## Development Workflow

### Before Starting Work
1. Run `npm install` to ensure dependencies
2. Run `npm run build` to verify both bundling and compilation
3. Check existing code patterns in relevant files
4. Review `docs/PROJECT_STRUCTURE.md` for detailed architecture

### When Adding Features
1. **New Format Support**: 
   - Add parser in `src/modules/parsers/`
   - Add drawer in `src/modules/drawers/`
   - Update `FileTypeDetector` and `MetafileParser`
   - Add to build bundle script

2. **New Commands**:
   - Create in `src/commands/`
   - Register in `extension.ts`
   - Add to `package.json` contributions

3. **Utility Functions**:
   - Add to appropriate file in `src/utils/`
   - Follow existing module patterns
   - Update build bundle if needed

4. Follow existing naming conventions and patterns
5. Add proper TypeScript types for TS files
6. Include error handling and logging
7. Test with sample files from `test_files/`

### Common Patterns
- **File Operations**: Use `fs.readFileSync()` with proper error handling
- **Path Operations**: Use `path.join()` for cross-platform compatibility
- **Base64 Handling**: Convert binary data with `.toString('base64')`
- **WebView HTML**: Use template replacement for dynamic content (`${placeholder}`)
- **Resource Loading**: Use `asWebviewUri()` for secure webview resource loading
- **Module Bundling**: Update `src/build/build-browser-bundle.js` when adding modules

## WMF/EMF/EMF+ Format Considerations

### Format Support
- **WMF**: Classic Windows Metafile format (16-bit records)
- **Placeable WMF**: WMF with positioning header
- **EMF**: Enhanced Metafile format (32-bit records)
- **EMF+**: Enhanced Metafile Plus (advanced graphics)

### Parser Implementation
- Handles all four format variants
- Uses file signature detection for automatic format identification
- Multiple parsing strategies for compatibility
- Implements coordinate transformation for Canvas rendering
- Extensive logging for debugging format issues
- Format-specific record handlers in dedicated parser classes

### Rendering Pipeline
1. Detect file format (WMF/EMF/EMF+)
2. Parse binary metafile data using format-specific parser
3. Extract drawing commands and GDI objects
4. Convert to Canvas 2D commands via format-specific drawer
5. Apply coordinate transformations
6. Render in webview canvas

### Format Specifications
Official Microsoft specifications available in `docs/`:
- `[MS-WMF].pdf`: Windows Metafile Format
- `[MS-EMF].pdf`: Enhanced Metafile Format
- `[MS-EMFPLUS].pdf`: Enhanced Metafile Plus Format

## Common Gotchas

- **Build Order**: Must run `npm run build:bundle` before `compile` for browser bundle
- **TypeScript Compilation**: Always compile before testing
- **Path Updates**: When moving files, update paths in:
  - `build-browser-bundle.js` (module paths)
  - `extension.ts` and providers (import paths)
  - `package.json` (script paths)
- **WebView Paths**: Use `asWebviewUri()` for secure resource loading
- **Binary Data**: Handle Uint8Array conversions properly
- **Extension Context**: Pass context correctly to resource loaders
- **File Extensions**: Ensure both `.wmf` and `.emf` files are properly associated
- **Module System**: Browser bundle removes Node.js module syntax
- **Resource Locations**: 
  - Webview HTML: `src/resources/webview.html`
  - Browser bundle output: `out/metafileParser.browser.js`

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