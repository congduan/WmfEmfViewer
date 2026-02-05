# WMF/EMF Viewer - Project Structure

## Overview
This document describes the organization and structure of the WMF/EMF Viewer VSCode extension project.

## Root Directory Structure

```
WmfEmfViewer/
├── .vscode/                    # VSCode workspace configuration
├── docs/                       # Documentation and specifications
├── scripts/                    # Development scripts and tools
├── src/                        # Source code
├── test/                       # Test files and examples
├── test_files/                 # Sample WMF/EMF files (221 files)
├── out/                        # Compiled output (gitignored)
├── .gitignore                  # Git ignore rules
├── AGENTS.md                   # AI agent development guide
├── LICENSE                     # Project license
├── package.json                # NPM package configuration
├── README.md                   # Project documentation
└── tsconfig.json              # TypeScript configuration
```

## Directory Details

### `/.vscode` - VSCode Configuration
VSCode workspace-specific configuration files:
- **extensions.json**: Recommended extensions (ESLint)
- **launch.json**: Debug configurations for running extension
- **settings.json**: Workspace settings (format on save, ESLint)
- **tasks.json**: Build tasks for compilation

### `/docs` - Documentation
Official Microsoft format specifications and project documentation:
- **[MS-WMF].pdf**: Windows Metafile Format specification
- **[MS-EMF].pdf**: Enhanced Metafile Format specification
- **[MS-EMFPLUS].pdf**: Enhanced Metafile Plus Format specification
- **PROJECT_STRUCTURE.md**: This file

### `/scripts` - Development Scripts
Utility scripts for development and analysis:
- **analyze-wmf.js**: WMF file structure analysis tool
- **install.sh**: Installation and setup script

### `/src` - Source Code
Main source code directory. See detailed structure below.

### `/test` - Tests
All test-related files:
- **fixtures/**: Test fixtures and sample data
- **test-wmf.js**: WMF parsing unit tests
- **test-all-formats.js**: Multi-format support tests
- **test-browser-bundle.html**: Browser rendering test page
- **test-vscode-fix.html**: VSCode integration test page

### `/test_files` - Test Assets
Sample WMF and EMF files for comprehensive testing:
- 212 WMF files
- 2 EMF files
- 6 JPEG/JPG comparison images
- 1 SVG file

### `/out` - Build Output
Compiled JavaScript output from TypeScript compilation (gitignored).
Contains:
- Compiled extension code
- `metafileParser.browser.js`: Browser-compatible bundle

## Source Code Structure (`/src`)

```
src/
├── build/                      # Build scripts
│   └── build-browser-bundle.js # Bundles modules for browser
│
├── commands/                   # VSCode command implementations
│   └── previewCommand.ts       # Preview command handler
│
├── modules/                    # Core parsing and rendering
│   ├── parsers/               # Format-specific parsers
│   │   ├── baseParser.js      # Base parser class
│   │   ├── wmfParser.js       # WMF parser (6.24 KB)
│   │   ├── emfParser.js       # EMF parser (6.01 KB)
│   │   └── emfPlusParser.js   # EMF+ parser (7.57 KB)
│   │
│   └── drawers/               # Format-specific renderers
│       ├── baseDrawer.js      # Base drawer with Canvas utils (9.59 KB)
│       ├── wmfDrawer.js       # WMF renderer (39.57 KB)
│       ├── emfDrawer.js       # EMF renderer (63.51 KB)
│       └── emfPlusDrawer.js   # EMF+ renderer (18.01 KB)
│
├── providers/                  # VSCode provider implementations
│   └── wmfEditorProvider.ts   # Custom editor provider
│
├── resources/                  # Static resources
│   └── webview.html           # Webview HTML template
│
├── utils/                      # Utility modules
│   ├── coordinateTransformer.js  # Coordinate transformations (3.29 KB)
│   ├── fileTypeDetector.js      # Auto file type detection (2.45 KB)
│   ├── gdiObjectManager.js      # GDI object state manager (1.88 KB)
│   ├── metafileParser.js        # Main parser orchestrator (3.13 KB)
│   └── recordParser.js          # Record parsing utilities (6.68 KB)
│
└── extension.ts                # Main extension entry point
```

## Architecture Overview

### Extension Layer (TypeScript)
Entry point and VSCode integration:
- **extension.ts**: Activates extension, registers providers and commands
- **providers/wmfEditorProvider.ts**: Custom editor for WMF/EMF files
- **commands/previewCommand.ts**: Preview command implementation

### Parsing Layer (JavaScript)
Binary format parsing:
- **utils/fileTypeDetector.js**: Detects WMF/EMF/EMF+ from file signature
- **utils/metafileParser.js**: Orchestrates parsing, delegates to format parsers
- **modules/parsers/**: Format-specific parsing implementations
  - baseParser.js: Common parsing functionality
  - wmfParser.js: Windows Metafile parsing
  - emfParser.js: Enhanced Metafile parsing
  - emfPlusParser.js: Enhanced Metafile Plus parsing

### Rendering Layer (JavaScript)
Canvas 2D rendering:
- **modules/drawers/**: Format-specific Canvas rendering
  - baseDrawer.js: Common Canvas utilities
  - wmfDrawer.js: WMF-specific rendering
  - emfDrawer.js: EMF-specific rendering
  - emfPlusDrawer.js: EMF+-specific rendering

### Utility Layer (JavaScript)
Supporting modules:
- **coordinateTransformer.js**: Coordinate system transformations
- **gdiObjectManager.js**: GDI object state management
- **recordParser.js**: Record parsing helpers

### Build System
- **build/build-browser-bundle.js**: 
  - Bundles all modules into single browser-compatible file
  - Removes Node.js module syntax (require/module.exports)
  - Outputs to `out/metafileParser.browser.js`

## Build Process

### Build Flow
1. **npm run build:bundle**: 
   - Executes `src/build/build-browser-bundle.js`
   - Reads all modules from `src/modules/` and `src/utils/`
   - Strips Node.js module syntax
   - Combines into single file
   - Outputs to `out/metafileParser.browser.js`

2. **npm run compile**:
   - TypeScript compiler (`tsc`) compiles `src/**/*.ts`
   - Outputs to `out/` directory
   - Generates source maps for debugging

3. **npm run build**:
   - Runs both bundle and compile in sequence

### Output Files
- `out/extension.js`: Main extension entry
- `out/commands/previewCommand.js`: Preview command
- `out/providers/wmfEditorProvider.js`: Editor provider
- `out/metafileParser.browser.js`: Browser bundle (generated)

## Configuration Files

### TypeScript Configuration (`tsconfig.json`)
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Source maps enabled
- Excludes: node_modules, out

### Package Configuration (`package.json`)
- Name: wmf-viewer
- Version: 0.0.1
- Main entry: `./out/extension.js`
- Activation events: onView, onCommand, onFileSystem
- Contributions: custom editor, commands, menus

### Git Configuration (`.gitignore`)
Ignores:
- node_modules/
- out/
- *.vsix
- Build artifacts
- OS-specific files
- Editor temporary files

## Development Workflow

1. **Initial Setup**
   ```bash
   npm install
   npm run build
   ```

2. **Development**
   ```bash
   npm run watch  # Terminal 1: Watch TypeScript
   # Press F5 in VSCode to launch Extension Development Host
   ```

3. **Testing**
   - Open `.wmf` or `.emf` files from `test_files/`
   - Run test scripts: `node test/test-wmf.js`

4. **Building for Release**
   ```bash
   npm run build
   npm run package
   ```

## Key Features

### Multi-Format Support
- Automatic format detection
- Dedicated parsers for WMF, EMF, EMF+
- Fallback parsing strategies

### Modular Architecture
- Clean separation: Extension ↔ Parsing ↔ Rendering
- Format-specific implementations
- Reusable utility modules

### Browser Compatibility
- Build system creates browser-compatible bundle
- No Node.js dependencies in webview
- Self-contained rendering

### VSCode Integration
- Custom editor provider for seamless file opening
- Preview command for manual triggering
- Context menu integration

## Additional Resources

- **AGENTS.md**: Comprehensive development guide for AI agents
- **README.md**: User-facing documentation
- **LICENSE**: MIT License
