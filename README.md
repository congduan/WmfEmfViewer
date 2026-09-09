# WmfEmfViewer

A Visual Studio Code extension for previewing **WMF** (Windows Metafile), **EMF** (Enhanced Metafile) and **EMF+** images directly in the editor.

**Try it online (no install):** <https://congduan.github.io/WmfEmfViewer/> — drag & drop a `.wmf` / `.emf` file, everything runs locally in your browser.

**Use the engine in your code:** `npm install wmf-emf-renderer` — the same parser/renderer as a zero-dependency library for Node.js and browsers ([details](#npm-library-wmf-emf-renderer)).

[![Publish status](https://img.shields.io/github/actions/workflow/status/congduan/WmfEmfViewer/publish.yml)](https://github.com/congduan/WmfEmfViewer/actions)

![WMF/EMF Viewer preview](./screenshots/1.png)

## Features

- Open `.wmf` / `.emf` files in a custom editor with built-in preview
- Automatic detection of WMF, Placeable WMF, EMF and EMF+
- High-quality Canvas 2D rendering of vector graphics, text and GDI objects
- Explorer context menu integration
- Zero runtime dependencies

### Supported Functionality

**Formats**

| Format | Detection | Rendering |
|---|---|---|
| WMF (standard) | ✅ | ✅ |
| Placeable WMF (22-byte prefix header) | ✅ | ✅ |
| EMF | ✅ | ✅ |
| EMF+ (within EMF, incl. dual-mode) | ✅ | ✅ |

**Coordinate systems & transforms**

- Window/Viewport mapping with all `SetMapMode` units (`MM_TEXT`, `MM_LO/HIMETRIC`, `MM_LO/HIENGLISH`, `MM_TWIPS`, `MM_ISOTROPIC`, `MM_ANISOTROPIC`)
- World transform (`SetWorldTransform` / `ModifyWorldTransform` with `MWT_IDENTITY`, `MWT_LEFTMULTIPLY`, `MWT_RIGHTMULTIPLY`, `MWT_SET`), plus EMF+ world/container transforms (translate / rotate / scale / multiply / reset)
- DC state stack (`SaveDC` / `RestoreDC`), clipping via `IntersectClipRect` / `ExcludeClipRect` / `OffsetClipRgn` / `SelectClipPath` and EMF+ clip rect/path/region

**Drawing primitives (WMF + EMF)**

- Lines & curves: `MoveToEx`, `LineTo`, `Polyline(To)`, `Bezier(To)`, `PolyDraw`, `Arc`, `ArcTo`, `AngleArc`, `Chord`, `Pie` (all in 16-bit and 32-bit variants where applicable)
- Shapes: `Rectangle`, `RoundRect`, `Ellipse`, `Polygon`, `PolyPolygon`, `PolyPolyline`
- Paths: `BeginPath` / `EndPath`, `FillPath`, `StrokePath`, `StrokeAndFillPath`, `FlattenPath`, `WidenPath`, `AbortPath`
- Fills: `ExtFloodFill`, `SetPixelV`, poly-fill mode (`ALTERNATE` / `WINDING`), ROP2 background/foreground mix, arc direction

**GDI objects**

- Pens: `CreatePen`, `ExtCreatePen` (cosmetic/geometric, dash styles), brushes: `CreateBrushIndirect` (solid / null / hatched), `CreateMonoBrush`, palettes (`CreatePalette`, `SetPaletteEntries`, `ResizePalette`, `RealizePalette`), fonts: `ExtCreateFontIndirectW`
- Object handles stored by handle map (producer-assigned, reusable after delete); text attributes (`SetTextColor`, `SetBkColor`, `SetBkMode`, `SetTextAlign`, `SetMiterLimit`, `SetMapperFlags`, color adjustment)

**Raster operations / bitmaps**

- `BitBlt`, `StretchBlt`, `StretchDIBits`, `AlphaBlend`, `TransparentBlt`
- DIB decoding: 1/4/8/16/24/32 bpp, `BI_RGB` / `BI_RLE8` / `BI_RLE4`, top-down and bottom-up, color-key transparency and alpha channels

**Text**

- `TextOut`, `ExtTextOutA/W`, `EMR_SMALLTEXTOUT`, `EMR_TEXT` (with `offDx` inter-character spacing), EMF+ `DrawString` / `DrawDriverString`

**EMF+ objects & properties** (GDI+ surface style)

- Pens, brushes (solid / texture / hatch / path-gradient / linear-gradient), images, fonts, string formats, regions
- Rendering properties: anti-alias, text rendering hint, compositing mode/quality, interpolation mode, pixel offset mode, page transform, containers (`Begin/EndContainer`), save/restore

**Known limitations**

- Records embedded as EMF+ inside `EMR_GDI_COMMENT` of a pure-EMF file are only partially rendered
- Some region records (`EMR_FILLRGN` / `EMR_FRAMERGN`) and advanced region clipping fall back to approximations
- Font metrics are approximated (no system font matching); text may deviate slightly in layout-sensitive metafiles

## Quick Start

```bash
npm install        # install dependencies
npm run build      # build browser bundle + compile TypeScript
```

Press `F5` in VS Code to launch the Extension Development Host, then open a `.wmf` or `.emf` file from `test_files/`.

## Static Website (Online Viewer)

The same rendering engine also ships as a standalone static website — drag & drop a `.wmf` / `.emf` file and preview it directly in the browser. All parsing and rendering happen locally; files are never uploaded.

**Online:** <https://congduan.github.io/WmfEmfViewer/> (GitHub Pages)

```bash
npm run build:bundle          # generates website/metafileParser.browser.js
npx serve website             # or: python3 -m http.server 8000 --directory website
```

Then open `http://localhost:3000` (or the port shown). Features:

- Drag & drop or click to open WMF / Placeable WMF / EMF / EMF+
- Built-in sample files (shape demo, MathType formula, small icon) — try it without any file at hand
- Canvas / SVG rendering modes, zoom controls (buttons or `Ctrl` + wheel)
- Export to PNG / SVG / PDF

### Deploy to GitHub Pages

The [deploy-website.yml](.github/workflows/deploy-website.yml) workflow builds and publishes `website/` automatically on every push to `master`. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## npm Library (`wmf-emf-renderer`)

The core parsing/rendering engine is extracted into a standalone module, published as a zero-dependency npm package. It shares the same source code as the extension (`packages/wmf-emf-renderer` is built from `src/modules` + `src/utils`) and can be used in any Node.js or browser project.

> Full API documentation: [packages/wmf-emf-renderer/README.md](packages/wmf-emf-renderer/README.md)

### Install

```bash
npm install wmf-emf-renderer
```

### Usage

**Render to SVG** (headless, works in Node.js without any DOM):

```js
import { renderToSvg } from 'wmf-emf-renderer';
import { readFileSync, writeFileSync } from 'fs';

const svg = renderToSvg(readFileSync('drawing.wmf'), { viewWidth: 1024 });
writeFileSync('drawing.svg', svg);
```

**Render to a browser canvas:**

```js
import { renderToContext } from 'wmf-emf-renderer';

const data = new Uint8Array(await file.arrayBuffer());
const ctx = document.querySelector('canvas').getContext('2d');
const info = renderToContext(data, ctx, { viewWidth: 800, viewHeight: 600 });
console.log(`Rendered ${info.fileType} at ${info.width}x${info.height}`);
```

**Render with `node-canvas`** (server-side PNG export):

```js
const { createCanvas } = require('canvas');
const { renderToContext } = require('wmf-emf-renderer');

const canvas = createCanvas(800, 600);
renderToContext(fs.readFileSync('chart.emf'), canvas.getContext('2d'));
fs.writeFileSync('chart.png', canvas.toBuffer('image/png'));
```

**Parse only** (inspect records without rendering):

```js
import { parseMetafile } from 'wmf-emf-renderer';

const { fileType, records, error } = parseMetafile(bytes);
console.log(fileType, records.length, 'records');
```

### API Overview

| Function | Description |
|---|---|
| `detectFileType(data)` | Returns `'wmf' \| 'placeable-wmf' \| 'emf' \| 'emf+' \| 'unknown'`. |
| `parseMetafile(data)` | Parses binary data into `{ fileType, header, records, error? }`. Never throws. |
| `renderToSvg(data, options?)` | Renders to a complete SVG document string. |
| `renderToContext(data, ctx, options?)` | Renders onto any Canvas 2D context; returns `{ width, height, fileType }`. |
| `createDrawer(ctx, fileType)` | Creates the format-appropriate drawer for custom rendering flows. |
| `setDebugEnabled(true)` | Enables verbose parser/drawer logging (off by default). |

`data` accepts `Uint8Array`, `ArrayBuffer`, or `number[]`; `options`: `{ viewWidth = 800, viewHeight = 600 }` (image is fit inside while preserving aspect ratio). Low-level classes (`WmfParser`, `EmfParser`, `EmfPlusParser`, `SvgContext`, etc.) are also exported — see the package README.

### Module Development

```bash
cd packages/wmf-emf-renderer
npm run build      # rebuild index.js / index.mjs / index.d.ts from ../../src
npm test           # smoke test: parse + render sample files
```

## Development Commands

| Command | Description |
| ------- | ----------- |
| `npm run build` | Full build (browser bundle + TypeScript compile) |
| `npm run build:bundle` | Build the browser bundle only |
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Compile in watch mode |
| `npm run lint` | Lint TypeScript sources |
| `npm run test` | Run tests (builds, lints, runs test suite) |
| `npm run package` | Package the extension into a `.vsix` file |

## Project Structure

```
packages/
└── wmf-emf-renderer/    # Standalone npm library extracted from src/
src/
├── build/               # Browser bundling script
├── commands/            # VSCode command implementations
├── modules/             # Core logic
│   ├── parsers/        # WMF / EMF / EMF+ binary parsers
│   └── drawers/        # Canvas 2D renderers
├── providers/           # VSCode custom editor provider
├── resources/           # Webview HTML template, extension icon
├── utils/               # Coordinate transforms, GDI object manager, etc.
└── extension.ts         # Extension entry point
```

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the full architecture documentation.

## Architecture

- **Separation of concerns**: TypeScript extension layer, JavaScript parsing/rendering layer
- **Format-specific modules**: each format has a dedicated parser and drawer
- **Shared base classes**: `BaseParser` / `BaseDrawer` provide common functionality
- **Browser bundling**: `build-browser-bundle.js` produces a single-file browser bundle for the webview

## Testing

- `test/test-wmf.js` — WMF parsing unit tests
- `test/test-all-formats.js` — multi-format support tests
- `test_files/` — 200+ sample WMF/EMF files

## Format Specifications

- [MS-WMF] Windows Metafile Format — `docs/[MS-WMF].pdf`
- [MS-EMF] Enhanced Metafile Format — `docs/[MS-EMF].pdf`
- [MS-EMFPLUS] Enhanced Metafile Plus Format — `docs/[MS-EMFPLUS].pdf`

## Publishing

The Marketplace detail page uses [MARKETPLACE.md](MARKETPLACE.md), configured via the `package` / `publish` scripts in `package.json`.

## License

[MIT](LICENSE)
