# WMF Viewer for VSCode

A Visual Studio Code extension that allows you to preview WMF (Windows Metafile Format) images directly in the editor.

## Features

- Preview WMF files directly in VSCode
- Supports both view and editor modes
- Context menu integration for quick access
- Easy to use interface

## Installation

### Method 1: From VSCode Marketplace

1. Open VSCode
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "WMF Viewer"
4. Click "Install"

### Method 2: From VSIX File

1. Download the `wmf-viewer.vsix` file from the project directory
2. Open VSCode
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click on the three dots (`...`) in the top right corner
5. Select "Install from VSIX..."
6. Navigate to the downloaded `wmf-viewer.vsix` file and select it

### Method 3: From Source

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` to run the extension in debug mode

## Usage

### Preview Mode

1. Right-click on a `.wmf` file in the Explorer
2. Select "Preview WMF Image"
3. The image will open in a new tab

### Editor Mode

1. Simply open a `.wmf` file by clicking on it
2. The file will open in the WMF Viewer editor

## Project Structure

```
WmfEmfViewer/
├── out/              # Compiled output
├── src/              # Source code
│   ├── extension.ts  # Extension main file
│   ├── webview.html  # Webview template
│   └── wmfParser.js  # WMF parser
├── .gitignore        # Git ignore file
├── LICENSE           # License file
├── README.md         # This README
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
└── sample.wmf        # Sample WMF file for testing
```

## Development

### Prerequisites

- Node.js (v16+)
- npm
- Visual Studio Code

### Commands

- `npm run compile`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and compile automatically
- `npm run lint`: Lint TypeScript files
- `npm run test`: Run tests
- `npm run package`: Package the extension into a VSIX file

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Based on the Windows Metafile Format specification
- Uses TypeScript for type safety
- Built with VSCode extension API
