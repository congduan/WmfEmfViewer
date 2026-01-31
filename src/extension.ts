import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class WmfEditorProvider implements vscode.CustomEditorProvider {
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
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src'))]
        };

        // 读取WMF文件内容
        const wmfContent = fs.readFileSync(document.uri.fsPath);
        const wmfBase64 = wmfContent.toString('base64');

        // 读取webview.html文件内容
        const webviewPath = path.join(this.context.extensionPath, 'src', 'webview.html');
        let webviewHtml = fs.readFileSync(webviewPath, 'utf8');
        
        // 创建wmfParser.js的本地URI
        const parserScriptPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'wmfParser.js'));
        const parserScriptUri = webviewPanel.webview.asWebviewUri(parserScriptPath);
        
        // 替换WMF数据占位符和脚本路径
        webviewHtml = webviewHtml.replace('${wmfBase64}', wmfBase64);
        webviewHtml = webviewHtml.replace('wmfParser.js', parserScriptUri.toString());

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

export function activate(context: vscode.ExtensionContext) {
    console.log('WMF Viewer extension activated');

    // 注册预览命令
    let previewCommand = vscode.commands.registerCommand('wmfViewer.preview', (uri) => {
        if (uri && uri.fsPath) {
            const panel = vscode.window.createWebviewPanel(
                'wmfPreview',
                'WMF Preview',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))]
                }
            );

            // 读取WMF文件内容
            const wmfContent = fs.readFileSync(uri.fsPath);
            const wmfBase64 = wmfContent.toString('base64');

            // 读取webview.html文件内容
            const webviewPath = path.join(context.extensionPath, 'src', 'webview.html');
            let webviewHtml = fs.readFileSync(webviewPath, 'utf8');
            
            // 创建wmfParser.js的本地URI
            const parserScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'src', 'wmfParser.js'));
            const parserScriptUri = panel.webview.asWebviewUri(parserScriptPath);
            
            // 替换WMF数据占位符和脚本路径
            webviewHtml = webviewHtml.replace('${wmfBase64}', wmfBase64);
            webviewHtml = webviewHtml.replace('wmfParser.js', parserScriptUri.toString());

            // 创建webview内容
            panel.webview.html = webviewHtml;
        }
    });

    // 注册自定义编辑器
    const editorProvider = WmfEditorProvider.register(context);

    context.subscriptions.push(previewCommand, editorProvider);
}

export function deactivate() {
    console.log('WMF Viewer extension deactivated');
}
