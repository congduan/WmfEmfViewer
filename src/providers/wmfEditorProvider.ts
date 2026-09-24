import * as vscode from 'vscode';
import { buildWebviewHtml, getWebviewOptions } from '../utils/webviewHtml';

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
        webviewPanel.webview.options = getWebviewOptions(this.context);

        // 数据注入逻辑与预览命令共用同一实现（见 utils/webviewHtml）
        webviewPanel.webview.html = await buildWebviewHtml(
            this.context,
            webviewPanel.webview,
            document.uri.fsPath
        );
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
