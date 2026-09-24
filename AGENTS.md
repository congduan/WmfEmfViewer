# AGENTS.md - Development Guide for WmfEmfViewer

This file contains essential information for agentic coding agents working in this repository.

## Project Overview

**WMF/EMF Viewer** is a Visual Studio Code extension that previews WMF (Windows Metafile), EMF (Enhanced Metafile) and EMF+ (Enhanced Metafile Plus) images directly in the editor. The same parsing/rendering engine is also published as a standalone npm library and used by a static website.

- **Type**: VSCode Extension + npm library + static website
- **Languages**: TypeScript (extension layer), JavaScript (parsers/drawers)
- **Target**: VSCode `^1.75.0`; npm library `node >= 14`
- **Formats Supported**: WMF, Placeable WMF, EMF, EMF+

### Single source of truth

Everything is implemented once under `src/`. `scripts/build-bundles.js` (esbuild) produces two artifacts from that single source:

| Artifact | Entry | Consumer |
|---|---|---|
| `out/metafileParser.browser.js` (IIFE) | `src/browser.js` | VSCode webview, `website/` |
| `packages/wmf-emf-renderer/index.js` (CJS) | `packages/wmf-emf-renderer/entry.js` | npm package `wmf-emf-renderer` |

Both artifacts are **generated and gitignored** — never edit them by hand. `packages/wmf-emf-renderer/entry.js` is the only hand-written file in that package (plus `index.d.ts` / `index.mjs` / README / LICENSE).

## Build & Development Commands

```bash
# Full build (browser bundle + npm package + TypeScript compilation)
npm run build

# Browser/website bundle only  -> out/metafileParser.browser.js + website copy
npm run build:bundle

# npm package bundle only      -> packages/wmf-emf-renderer/index.js
npm run build:lib

# Compile TypeScript -> out/
npm run compile

# Watch mode for TypeScript
npm run watch

# Lint (src/ + scripts/, see Linting section)
npm run lint

# Type check JS with checkJs (see tsconfig.check.json)
npm run typecheck

# Smoke tests against the built browser bundle (out/) 
# + full-corpus snapshot regression against src/
npm run test

# Snapshot regression only / regenerate baseline
npm run test:snapshot
npm run test:snapshot:update

# Smoke-test the npm package artifact
npm run test:lib

# Package the extension into a VSIX (Marketplace readme = MARKETPLACE.md)
npm run package

# Remove local render/debug output under out/ (keeps compiled extension + bundle)
# scripts/README.md 说明哪些脚本属于构建链路、哪些是一次性调试工具
npm run clean:render

# Remove out/ entirely
npm run clean
```

### Before Making Changes

Always run `npm run build` to verify bundling and TypeScript compilation, then `npm test`.
There is **no separate bundle-before-compile ordering requirement** anymore: esbuild handles the browser bundle, `tsc` only compiles the `.ts` extension layer, and the two do not depend on each other.

## Code Style Guidelines

### TypeScript Configuration
- **Target**: ES2020
- **Module**: CommonJS
- **Strict mode**: Enabled
- **Source maps**: Enabled
- **Input**: `./src/**/*` (only `.ts` is emitted; `.js` passes through untouched)
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
- **Constants**: UPPER_SNAKE_CASE in `src/constants.js`, camelCase elsewhere
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
- Use `console.log` for diagnostics: `console.log('WMF Viewer extension activated');`
- The browser and npm bundles **rewrite `console.log` at build time** (esbuild `define`):
  - browser bundle → `__wlog()`
  - npm bundle → `__wmfEmfRendererLog()`
- **Both read the same switch: `globalThis.__WMF_DEBUG__`** (default `false`).
  - browser/webview: set `globalThis.__WMF_DEBUG__ = true` (the webview debug toggle does this)
  - npm package: `setDebugEnabled(true)` — which just flips that same flag
- The gated log functions live in the esbuild **banner** (`scripts/build-bundles.js`), because
  banner code is not processed by `define`. Never implement the gate with
  `console.log.bind(console)` inside `src/`: `define` would rewrite it into a self-reference and
  the switch would silently stop working.
- Because of this, you may write plain `console.log(...)` anywhere in `src/`; do not add your own debug flag checks.
- For hot paths (per-record logs) guard with `if (globalThis.__WMF_DEBUG__)` so the work is skipped entirely.
- `console.warn` / `console.error` are **not** silenced by the build, so use them only for real problems.
- Extension-layer (`.ts`) logs run in the extension host and are not rewritten.

## File Structure & Architecture

### Project Directory Structure
```
WmfEmfViewer/
├── .github/workflows/        # CI: ci.yml, deploy-website.yml, publish.yml
├── .vscode/                  # VSCode workspace configuration
│   ├── extensions.json       # Recommended extensions
│   ├── launch.json           # Debug configurations
│   ├── settings.json         # Workspace settings
│   └── tasks.json            # Build tasks
│
├── docs/                     # Documentation and specifications
│   ├── PROJECT_STRUCTURE.md  # Detailed structure documentation
│   ├── POI-COMPARE-CHECKLIST.md
│   ├── [MS-WMF].pdf          # WMF format specification
│   ├── [MS-EMF].pdf          # EMF format specification
│   └── [MS-EMFPLUS].pdf      # EMF+ format specification
│
├── packages/
│   └── wmf-emf-renderer/     # npm package (entry.js + index.d.ts + generated index.js)
│
├── scripts/                  # Development scripts (build + local analysis/debug tools)
│   ├── build-bundles.js      # THE build script (esbuild; browser + npm)
│   ├── install.sh
│   └── [dbg|scan|dump|analyze]-*.js  # ad-hoc local debugging tools, not part of the build
│
├── src/                      # Source code (single source of truth)
├── test/                     # Tests
│   ├── runTest.js            # Smoke tests against the built browser bundle
│   ├── snapshot-test.js      # Full-corpus snapshot regression against src/
│   └── snapshots/            # SVG hash baselines
│
├── test_files/               # Sample WMF/EMF corpus (403 .wmf + 229 .emf on the dev machine)
├── website/                  # Static site (consumes the browser bundle)
├── out/                      # Build output + local render outputs (gitignored)
├── package.json              # Root workspace manifest
├── tsconfig.json             # TypeScript compilation config
├── tsconfig.check.json       # checkJs config (JS type checking)
├── .eslintrc.js              # ESLint configuration
└── README.md                 # User documentation
```

### Source Code Structure (`src/`)
```
src/
├── commands/            # VSCode command implementations
│   └── previewCommand.ts        # Preview command handler
│
├── modules/             # Core parsing and rendering
│   ├── parsers/        # Format-specific parsers
│   │   ├── baseParser.js       # Base parser class
│   │   ├── wmfParser.js        # WMF format parser
│   │   ├── emfParser.js        # EMF format parser
│   │   └── emfPlusParser.js    # EMF+ format parser
│   │
│   ├── drawers/        # Format-specific renderers
│   │   ├── baseDrawer.js       # Base drawer with Canvas utils
│   │   ├── wmfDrawer.js        # WMF renderer
│   │   ├── emfDrawer.js        # EMF renderer
│   │   └── emfPlusDrawer.js    # EMF+ renderer
│   │
│   └── svgContext.js   # Canvas2D-compatible context that emits SVG
│
├── providers/           # VSCode provider implementations
│   └── wmfEditorProvider.ts    # Custom editor provider
│
├── resources/           # Static resources
│   ├── webview.html            # Webview HTML template
│   └── icon.png                # Extension icon
│
├── utils/               # Utility modules
│   ├── constants.js             # Shared file types, signatures, defaults
│   ├── coordinateTransformer.js # Coordinate transformations
│   ├── fileTypeDetector.js      # Auto file type detection
│   ├── gdiObjectManager.js      # GDI object state manager
│   ├── mathTypeMtefParser.js    # MathType MTEF payload reader
│   ├── metafileParser.js        # Main parser orchestrator
│   └── webviewHtml.ts           # Shared webview HTML builder (extension layer)
│
├── browser.js           # Browser bundle entry (esbuild IIFE, exposes window globals)
└── extension.ts         # Main extension entry point
```

### Architecture Patterns

#### Modular Design
- **Separation of Concerns**: Extension logic (TS) separated from parsing/rendering (JS)
- **Format-Specific Modules**: Each format (WMF/EMF/EMF+) has a dedicated parser and drawer
- **Base Classes**: Shared functionality in `BaseParser` and `BaseDrawer`
- **Utility Modules**: Reusable components (coordinate transformation, GDI management)

#### VSCode Integration
- **CustomEditorProvider**: Seamless integration with VSCode editor system
- **Commands**: Separate command handlers in `commands/` directory
- **WebView**: Secure webview with base64 data embedding (via `utils/webviewHtml.ts`)
- **Context Management**: Proper VSCode extension context handling

#### Build System
- **Single esbuild script**: `scripts/build-bundles.js` produces both bundles; adding a module requires no build-script change (esbuild follows `require` graph automatically)
- **Log gating by `define`**: `console.log` is rewritten at compile time, so source stays readable
- **TypeScript Compilation**: `tsc` compiles only the `.ts` extension layer into `out/`

### Key Components

#### Extension Layer (TypeScript)
- **extension.ts**: Main entry point, registers providers and commands
- **wmfEditorProvider.ts**: Custom editor provider for `.wmf`/`.emf` files
- **previewCommand.ts**: Preview command implementation
- **utils/webviewHtml.ts**: Shared "read file → base64 → inject into template" logic

#### Parsing Layer (JavaScript)
- **FileTypeDetector**: Auto-detects WMF, EMF, EMF+ format from binary signature
- **MetafileParser**: Main parser orchestrator, delegates to format-specific parsers
- **BaseParser**: Common parsing functionality (record iteration, data reading)
- **WmfParser/EmfParser/EmfPlusParser**: Format-specific parsing logic

#### Rendering Layer (JavaScript)
- **BaseDrawer**: Canvas 2D utilities, common drawing operations
- **WmfDrawer/EmfDrawer/EmfPlusDrawer**: Format-specific Canvas rendering
- **SvgContext**: Canvas2D-compatible surface that serializes to SVG (used by tests and `renderToSvg`)
- **CoordinateTransformer**: Handles coordinate system transformations
- **GdiObjectManager**: Manages GDI objects (pens, brushes, fonts)

## Testing

### Test Files
Only two test entry points are live; both are wired into `npm test`:

- **`test/runTest.js`**: smoke tests that load the **built browser bundle** (`out/metafileParser.browser.js`) and render a handful of samples through `SvgContext`, including MathType and image regression cases.
- **`test/snapshot-test.js`**: loads the **`src/` sources** and renders every `.wmf`/`.emf` under `test_files/`, comparing a sha256 of the produced SVG against `test/snapshots/snapshots.json`.
- **`packages/wmf-emf-renderer/test/smoke-test.js`**: validates the **npm package artifact** (`npm run test:lib`).

```bash
npm test                      # smoke (bundle) + snapshot (src)
npm run test:snapshot         # snapshot only
npm run test:snapshot:update  # regenerate the baseline after intentional rendering changes
npm run test:lib              # npm package artifact smoke test
```

When you intentionally change rendering output, run `npm run test:snapshot:update` and commit the updated `snapshots.json`.

### Sample Files
`test_files/` holds the regression corpus (403 `.wmf` + 229 `.emf` on a dev machine with the full corpora present; 222 files are committed). The large corpora (`ref-emf-corpus/`, `lo-wmf-corpus/`, `sample-wmf/`) are **gitignored** and generated/downloaded locally.

### Manual Testing
```bash
# Render a single file for eyeballing
node scripts/render-one.js <path>

# Test extension in VSCode
# 1. Open project in VSCode
# 2. Press F5 to launch Extension Development Host
# 3. Open a .wmf/.emf file from test_files/ to test
```

## Linting

### ESLint Configuration
- `.eslintrc.js` (ESLint 8 flat-less config) with `@typescript-eslint/parser` + `plugin:@typescript-eslint/recommended`
- Scans `src/` **and** `scripts/` (`npm run lint`)
- `no-console` is intentionally off: bundling rewrites `console.log`
- Unused identifiers may be prefixed with `_` (e.g. VSCode provider placeholder params)

### Common Lint Issues
- Always run lint before committing
- Fix TypeScript strict mode errors
- Ensure proper type annotations

### Type Checking JavaScript
`npm run typecheck` runs `tsc -p tsconfig.check.json` with `allowJs` + `checkJs` over **all** `.js` modules under `src/`, and must stay green in CI.

It runs with `noImplicitAny: false` on purpose: annotating every internal parser/drawer parameter would mean thousands of `@param` tags for little benefit. What it *does* catch — and what you must keep clean — is the classes of error that signal real bugs: missing properties (TS2339), incompatible assignments (TS2322), `unknown` from `catch` (TS18046), possibly-undefined access (TS2532).

## VSCode Extension Specifics

### Extension Manifest (package.json)
- **Activation Events**: `onCommand:wmfViewer.preview`, `onFileSystem:file`
- **Main Entry**: `./out/extension.js`
- **Custom Editor**: `wmfViewer.editor` for `.wmf` and `.emf` files
- **Contributions**:
  - Explorer context menu for preview command
  - Custom editor for seamless file opening
  - Commands for manual preview triggering

### Build Scripts
- **build**: `npm run build:bundle && npm run build:lib && npm run compile` — emits all three
  artifacts in one go; the npm bundle `packages/wmf-emf-renderer/index.js` is tracked in git, so
  skipping it would leave a stale artifact behind in the repo
- **build:bundle**: `node scripts/build-bundles.js browser`
- **build:lib**: `node scripts/build-bundles.js npm`
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
2. Run `npm run build` to verify bundling and compilation
3. Check existing code patterns in relevant files
4. Review `docs/PROJECT_STRUCTURE.md` for detailed architecture

### When Adding Features
1. **New Format Support**:
   - Add parser in `src/modules/parsers/`
   - Add drawer in `src/modules/drawers/`
   - Update `FileTypeDetector` and `MetafileParser`
   - Export it from `src/browser.js` and `packages/wmf-emf-renderer/entry.js` (build scripts need no change)
   - Update `packages/wmf-emf-renderer/index.d.ts`

2. **New Commands**:
   - Create in `src/commands/`
   - Register in `extension.ts`
   - Add to `package.json` contributions

3. **Utility Functions**:
   - Add to appropriate file in `src/utils/`
   - Follow existing module patterns
   - Prefer extending `src/utils/constants.js` over adding new magic numbers

4. Follow existing naming conventions and patterns
5. Add proper TypeScript types for TS files
6. Include error handling and logging
7. Test with sample files from `test_files/` and run `npm test`

### Common Patterns
- **File Operations**: `fs.promises.readFile()` in the extension layer (avoid `readFileSync`, it blocks the extension host); `readFileSync` is fine inside synchronous parsers/drawers
- **Path Operations**: Use `path.join()` for cross-platform compatibility
- **Base64 Handling**: Convert binary data with `.toString('base64')`
- **WebView HTML**: Use `utils/webviewHtml.ts` rather than re-implementing template injection
- **Resource Loading**: Use `asWebviewUri()` for secure webview resource loading
- **Module Bundling**: Just add a `require`; esbuild inlines it automatically

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

- **Generated files**: `out/**`, `website/metafileParser.browser.js` and `packages/wmf-emf-renderer/index.js` are build outputs — edit `src/` instead
- **Path Updates**: When moving files, update:
  - `src/browser.js` and `packages/wmf-emf-renderer/entry.js` (exports)
  - `extension.ts`, providers and commands (import paths)
  - `package.json` (script paths)
- **WebView Paths**: Use `asWebviewUri()` for secure resource loading
- **Binary Data**: Handle Uint8Array conversions properly
- **Extension Context**: Pass context correctly to resource loaders
- **File Extensions**: Ensure both `.wmf` and `.emf` files are properly associated
- **Log gating**: `console.log` is rewritten by the bundler — don't rely on it in unit tests that load `src/` directly unless you silence it yourself
- **Resource Locations**:
  - Webview HTML: `src/resources/webview.html`
  - Browser bundle output: `out/metafileParser.browser.js`

## Dependencies

### Runtime Dependencies
- None (self-contained extension and library)

### Development Dependencies
- @types/vscode: VSCode API types
- @typescript-eslint/*: TypeScript linting
- typescript: TypeScript compiler
- esbuild: bundle builder (browser IIFE + npm CJS)
- eslint: JavaScript/TypeScript linting
- mocha, @vscode/test-electron: VSCode extension testing utilities
- pngjs: image regression helpers

## Security Notes

- WebView scripts are enabled for WMF rendering
- File system access limited to .wmf files
- Base64 data embedding prevents direct file access
- Local resource roots properly configured
