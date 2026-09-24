# WMF/EMF Viewer - Project Structure

## Overview
This document describes the organization and structure of the WMF/EMF Viewer project: a VSCode extension, a standalone npm library (`wmf-emf-renderer`) and a static website, all driven by the **single source tree in `src/`**.

## Root Directory Structure

```
WmfEmfViewer/
├── .github/workflows/          # CI (ci.yml, deploy-website.yml, publish.yml)
├── .vscode/                    # VSCode workspace configuration
├── docs/                       # Documentation and specifications
├── packages/
│   └── wmf-emf-renderer/       # npm package (hand-written entry + generated index.js)
├── scripts/                    # Build script + local analysis/debug tools
├── src/                        # Source code (single source of truth)
├── test/                       # Smoke tests + snapshot regression
├── test_files/                 # Sample WMF/EMF corpus
├── website/                    # Static site consuming the browser bundle
├── out/                        # Build output (gitignored)
├── .eslintrc.js                # ESLint configuration
├── .gitignore                  # Git ignore rules
├── .vscodeignore               # VSIX packaging rules
├── AGENTS.md                   # AI agent development guide
├── LICENSE                     # Project license
├── package.json                # Root manifest
├── README.md                   # Project documentation
├── tsconfig.json               # TypeScript compilation config
└── tsconfig.check.json         # checkJs config for the JS engine
```

## Directory Details

### `/.github/workflows` - CI
- **ci.yml**: lint + typecheck + `npm test` + npm package smoke test + VSIX dry-run
- **deploy-website.yml**: builds the browser bundle and deploys `website/` to GitHub Pages
- **publish.yml**: tag-triggered test → build → VSIX → GitHub Release

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
- **POI-COMPARE-CHECKLIST.md**: Rendering comparison checklist

### `/packages/wmf-emf-renderer` - npm Library
Published as `wmf-emf-renderer`:
- **entry.js**: Hand-written build entry (re-exports `src/` modules + high-level API)
- **index.d.ts**: Hand-written type declarations
- **index.mjs**: ESM wrapper
- **index.js**: **Generated** by `npm run build:lib` (gitignored, do not edit)

### `/scripts` - Development Scripts
- **build-bundles.js**: The build script. Uses esbuild to emit both the browser IIFE bundle and the npm CJS bundle. The only script on the critical path.
- **install.sh**: Installation and setup helper
- Everything else (`analyze-*.js/py`, `dbg-*.js`, `scan-*.js`, `dump-*.js`, `render-one.js`, …) is an ad-hoc local debugging/analysis tool. These are not part of the build, may depend on locally generated files, and are not guaranteed to run on a clean checkout.

### `/src` - Source Code
Main source code directory. See detailed structure below.

### `/test` - Tests
- **runTest.js**: smoke tests against the **built** browser bundle (`out/metafileParser.browser.js`)
- **snapshot-test.js**: full-corpus snapshot regression against **`src/`** sources
- **snapshots/snapshots.json**: SVG hash baselines for the snapshot test

### `/test_files` - Test Assets
Sample WMF and EMF files used by both test entry points. On a developer machine with the full corpora present this is 403 `.wmf` + 229 `.emf`; the committed subset is 222 files. The large corpora (`ref-emf-corpus/`, `lo-wmf-corpus/`, `sample-wmf/`) are gitignored and downloaded/generated locally.

### `/website` - Static Site
Static deployment of the same rendering engine. `website/metafileParser.browser.js` is copied here by the build script and is gitignored; `website/pdfContext.js` and `website/index.html` are hand-written.

### `/out` - Build Output
Compiled JavaScript output (gitignored). Contains:
- `extension.js`, `commands/`, `providers/` … compiled from `src/**/*.ts`
- `metafileParser.browser.js`: browser-compatible bundle
- Local render outputs written by the debugging scripts (safe to delete)

## Source Code Structure (`/src`)

```
src/
├── commands/                   # VSCode command implementations
│   └── previewCommand.ts       # Preview command handler
│
├── modules/                    # Core parsing and rendering
│   ├── parsers/               # Format-specific parsers
│   │   ├── baseParser.js      # Base parser class
│   │   ├── wmfParser.js       # WMF parser
│   │   ├── emfParser.js       # EMF parser
│   │   └── emfPlusParser.js   # EMF+ parser
│   │
│   ├── drawers/               # Format-specific renderers
│   │   ├── baseDrawer.js      # Base drawer with Canvas utils
│   │   ├── wmfDrawer.js       # WMF renderer
│   │   ├── emfDrawer.js       # EMF renderer
│   │   └── emfPlusDrawer.js   # EMF+ renderer
│   │
│   └── svgContext.js          # Canvas2D-compatible context that emits SVG
│
├── providers/                  # VSCode provider implementations
│   └── wmfEditorProvider.ts   # Custom editor provider
│
├── resources/                  # Static resources
│   ├── webview.html           # Webview HTML template
│   └── icon.png               # Extension icon
│
├── utils/                      # Utility modules
│   ├── constants.js              # Shared file types, signatures, defaults
│   ├── coordinateTransformer.js  # Coordinate transformations
│   ├── fileTypeDetector.js       # Auto file type detection
│   ├── gdiObjectManager.js       # GDI object state manager
│   ├── mathTypeMtefParser.js     # MathType MTEF payload reader
│   ├── metafileParser.js         # Main parser orchestrator
│   └── webviewHtml.ts            # Shared webview HTML builder (extension layer)
│
├── browser.js                  # Browser bundle entry (exposes window globals)
└── extension.ts                # Main extension entry point
```

## Architecture Overview

### Extension Layer (TypeScript)
Entry point and VSCode integration:
- **extension.ts**: Activates extension, registers providers and commands
- **providers/wmfEditorProvider.ts**: Custom editor for WMF/EMF files
- **commands/previewCommand.ts**: Preview command implementation
- **utils/webviewHtml.ts**: Shared template injection used by both the provider and the command

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
- **modules/svgContext.js**: SVG-emitting context (used by tests and `renderToSvg`)

### Utility Layer (JavaScript)
Supporting modules:
- **utils/constants.js**: File type names, binary signatures, shared defaults
- **utils/coordinateTransformer.js**: Coordinate system transformations
- **utils/gdiObjectManager.js**: GDI object state management
- **utils/mathTypeMtefParser.js**: MathType MTEF payload reader

### Build System
`scripts/build-bundles.js` (esbuild) builds both artifacts from `src/`:
- **browser**: entry `src/browser.js` → IIFE → `out/metafileParser.browser.js`, then copied to `website/`
- **npm**: entry `packages/wmf-emf-renderer/entry.js` → CJS → `packages/wmf-emf-renderer/index.js`
- `console.log` is rewritten at compile time (`__wlog` / `__wmfEmfRendererLog`) so logs are silent by default in both artifacts.

## Build Process

### Build Flow
1. **npm run build:bundle**:
   - esbuild bundles `src/browser.js` and its `require` graph into a single IIFE
   - Injects the `__wlog` log gate
   - Outputs `out/metafileParser.browser.js` and copies it into `website/`

2. **npm run build:lib**:
   - esbuild bundles `packages/wmf-emf-renderer/entry.js` into a single CommonJS file
   - Outputs `packages/wmf-emf-renderer/index.js`

3. **npm run compile**:
   - TypeScript compiler (`tsc`) compiles `src/**/*.ts`
   - Outputs to `out/`
   - Generates source maps for debugging

4. **npm run build**:
   - Runs `build:bundle` → `build:lib` → `compile`, emitting all three artifacts in one go so
     the tracked `packages/wmf-emf-renderer/index.js` never goes stale

### Output Files
- `out/extension.js`: Main extension entry
- `out/commands/previewCommand.js`: Preview command
- `out/providers/wmfEditorProvider.js`: Editor provider
- `out/utils/webviewHtml.js`: Shared webview HTML builder
- `out/metafileParser.browser.js`: Browser bundle (generated)
- `packages/wmf-emf-renderer/index.js`: npm package bundle (generated)

## Configuration Files

### TypeScript Configuration (`tsconfig.json`)
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Source maps enabled
- Compiles `.ts` only; `.js` modules are consumed as-is by esbuild

### Type Check Configuration (`tsconfig.check.json`)
- `allowJs` + `checkJs` + `noEmit`
- Runs via `npm run typecheck`; JS modules opt in by being included/scoped here

### Package Configuration (`package.json`)
- Name: wmf-viewer
- Main entry: `./out/extension.js`
- Activation events: `onCommand:wmfViewer.preview`, `onFileSystem:file`
- Contributions: custom editor, commands, menus
- Workspaces: `packages/*`

### Git Configuration (`.gitignore`)
Ignores: node_modules/, out/, *.vsix, generated bundles (`website/metafileParser.browser.js`, `packages/wmf-emf-renderer/index.js`), large local corpora, OS-specific files, editor temporary files.

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
   ```bash
   npm test                      # smoke (bundle) + snapshot (src)
   npm run test:snapshot:update  # after intentional rendering changes
   npm run test:lib              # npm package artifact smoke test
   ```

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
- **packages/wmf-emf-renderer/README.md**: npm library API documentation
- **LICENSE**: MIT License
