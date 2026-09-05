# wmf-emf-renderer

Parse and render **WMF / EMF / EMF+** Windows metafiles to **SVG** or **Canvas 2D**, in **Node.js** and **browsers**. Zero dependencies, pure JavaScript.

Extracted from the [WmfEmfViewer](https://github.com/congduan/WmfEmfViewer) VSCode extension.

## Features

- Auto-detects the format: WMF, Placeable WMF, EMF, EMF+ (including EMF+ Dual embedded in WMF comment records)
- Renders to a complete SVG document string — works headlessly in Node.js, no DOM required
- Renders to any Canvas 2D context (browser canvas, `node-canvas`, or custom implementations)
- Vector text, paths, GDI objects (pens/brushes/fonts), clipping, ROP operations, and MathType MTEF formulas
- Zero runtime dependencies

## Install

```bash
npm install wmf-emf-renderer
```

## Quick start

### Render to SVG (Node.js or browser)

```js
const { renderToSvg } = require('wmf-emf-renderer'); // ESM: import { renderToSvg } from 'wmf-emf-renderer'
const fs = require('fs');

const data = fs.readFileSync('drawing.wmf');
const svg = renderToSvg(data, { viewWidth: 1024, viewHeight: 768 });
fs.writeFileSync('drawing.svg', svg);
```

### Render to a browser canvas

```js
import { renderToContext } from 'wmf-emf-renderer';

const data = new Uint8Array(await file.arrayBuffer());
const ctx = document.getElementById('myCanvas').getContext('2d');
const info = renderToContext(data, ctx, { viewWidth: 800, viewHeight: 600 });
console.log(`Rendered ${info.fileType} at ${info.width}x${info.height}`);
```

### Render with node-canvas

```js
const { createCanvas } = require('canvas');
const { renderToContext } = require('wmf-emf-renderer');

const canvas = createCanvas(800, 600);
renderToContext(fs.readFileSync('chart.emf'), canvas.getContext('2d'));
fs.writeFileSync('chart.png', canvas.toBuffer('image/png'));
```

### Parse only (inspect records)

```js
const { parseMetafile } = require('wmf-emf-renderer');

const result = parseMetafile(fs.readFileSync('logo.emf'));
console.log(result.fileType, result.records.length, 'records');
if (result.error) console.error('Parse error:', result.error);
```

## API

### High-level functions

| Function | Description |
|---|---|
| `detectFileType(data)` | Returns `'wmf' \| 'placeable-wmf' \| 'emf' \| 'emf+' \| 'unknown'`. |
| `parseMetafile(data)` | Parses binary data into `{ fileType, header, records, error? }`. Never throws. |
| `renderToSvg(data, options?)` | Renders to a complete SVG document string. Works in Node.js and browsers. |
| `renderToContext(data, ctx, options?)` | Renders onto a Canvas 2D context; returns `{ width, height, fileType }`. |
| `createDrawer(ctx, fileType)` | Creates the format-appropriate drawer for custom rendering flows. |
| `setDebugEnabled(true)` | Enables verbose parser/drawer logging (off by default). |

`data` accepts `Uint8Array`, `ArrayBuffer`, or `number[]`.
`options`: `{ viewWidth = 800, viewHeight = 600 }` — the available viewport; the image is fit inside while preserving aspect ratio.

### Class exports (advanced)

`MetafileParser`, `FileTypeDetector`, `BaseParser`, `WmfParser`, `EmfParser`, `EmfPlusParser`, `BaseDrawer`, `WmfDrawer`, `EmfDrawer`, `EmfPlusDrawer`, `SvgContext`, `CoordinateTransformer`, `GdiObjectManager`, `MathTypeMtefParser`.

Example of the low-level flow (what `renderToSvg` does internally):

```js
const { MetafileParser, createDrawer, SvgContext } = require('wmf-emf-renderer');

const parser = new MetafileParser(data);
const result = parser.parse();
const ctx = new SvgContext();
const drawer = createDrawer(ctx, parser.fileType);
drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
const svg = ctx.getSvg();
```

`SvgContext` implements the Canvas 2D API but serializes to SVG — you can also pass any other Canvas2D-compatible context.

## TypeScript

Type declarations are bundled:

```ts
import { renderToSvg } from 'wmf-emf-renderer';
const svg: string = renderToSvg(bytes);
```

## Notes

- SVG output rasterizes embedded bitmaps (e.g. StretchDIBits of photographic content) only when the backing canvas supports `toDataURL` (browser). In Node.js, bitmap placeholders are emitted instead; prefer `renderToContext` with `node-canvas` for pixel-perfect bitmap output.
- `console.log` output from parsers/drawers is suppressed by default; call `setDebugEnabled(true)` to restore it.

## License

[MIT](./LICENSE)
