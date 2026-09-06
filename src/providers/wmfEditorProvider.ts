import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WmfEditorProvider implements vscode.CustomEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            'wmfViewer.editor',
            new WmfEditorProvider(context),
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    private _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    // 性能：webview 模板为静态文件，缓存避免每次打开文件都读磁盘
    private static webviewHtmlCache: string | null = null;

    constructor(private context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => {}
        };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // 配置WebView选项
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'src')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'out'))
            ]
        };

        // 读取WMF文件内容（异步，避免阻塞扩展主线程）
        const wmfContent = await fs.promises.readFile(document.uri.fsPath);
        const wmfBase64 = wmfContent.toString('base64');

        // 读取webview.html文件内容（优先使用缓存）
        if (WmfEditorProvider.webviewHtmlCache === null) {
            const webviewPath = path.join(this.context.extensionPath, 'src', 'resources', 'webview.html');
            WmfEditorProvider.webviewHtmlCache = await fs.promises.readFile(webviewPath, 'utf8');
        }
        let webviewHtml = WmfEditorProvider.webviewHtmlCache;
        
        // 创建metafileParser.browser.js的本地URI（从out目录）
        const parserScriptPath = vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'metafileParser.browser.js'));
        const parserScriptUri = webviewPanel.webview.asWebviewUri(parserScriptPath);
        
        // 替换WMF数据占位符和脚本路径
        webviewHtml = webviewHtml.replace('${wmfBase64}', wmfBase64);
        webviewHtml = webviewHtml.replace('metafileParser.browser.js', parserScriptUri.toString());

        // 设置WebView内容
        webviewPanel.webview.html = webviewHtml;
    }

    async saveCustomDocument(
        _document: vscode.CustomDocument,
        _cancellation: vscode.CancellationToken
    ): Promise<void> {
        // WMF文件为只读，不需要实现保存功能
    }

    async saveCustomDocumentAs(
        _document: vscode.CustomDocument,
        _destination: vscode.Uri,
        _cancellation: vscode.CancellationToken
    ): Promise<void> {
        // WMF文件为只读，不需要实现另存为功能
    }

    async revertCustomDocument(
        _document: vscode.CustomDocument,
        _cancellation: vscode.CancellationToken
    ): Promise<void> {
        // WMF文件为只读，不需要实现撤销功能
    }

    async backupCustomDocument(
        _document: vscode.CustomDocument,
        _context: vscode.CustomDocumentBackupContext,
        _cancellation: vscode.CancellationToken
    ): Promise<vscode.CustomDocumentBackup> {
        // WMF文件为只读，不需要实现备份功能
        throw new Error('Method not implemented.');
    }
}
