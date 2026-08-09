# WmfEmfViewer

A Visual Studio Code extension for previewing **WMF** (Windows Metafile), **EMF** (Enhanced Metafile) and **EMF+** images directly in the editor.

[![Publish status](https://img.shields.io/github/actions/workflow/status/congduan/WmfEmfViewer/publish.yml)](https://github.com/congduan/WmfEmfViewer/actions)

![WMF/EMF Viewer preview](./screenshots/1.png)

## Features

- Open `.wmf` / `.emf` files in a custom editor with built-in preview
- Automatic detection of WMF, Placeable WMF, EMF and EMF+
- High-quality Canvas 2D rendering of vector graphics, text and GDI objects
- Explorer context menu integration
- Zero runtime dependencies

## Quick Start

```bash
npm install        # install dependencies
npm run build      # build browser bundle + compile TypeScript
```

Press `F5` in VS Code to launch the Extension Development Host, then open a `.wmf` or `.emf` file from `test_files/`.

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
