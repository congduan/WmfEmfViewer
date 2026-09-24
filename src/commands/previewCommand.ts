import * as vscode from 'vscode';
import { buildWebviewHtml, getWebviewOptions } from '../utils/webviewHtml';

export function registerPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('wmfViewer.preview', async (uri: vscode.Uri) => {
        if (!uri || !uri.fsPath) {
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'wmfPreview',
            'WMF Preview',
            vscode.ViewColumn.One,
            getWebviewOptions(context)
        );

        try {
            // 与自定义编辑器共用同一套注入逻辑（异步读取，不阻塞扩展主线程）
            panel.webview.html = await buildWebviewHtml(context, panel.webview, uri.fsPath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Error in preview:', message);
            panel.dispose();
            void vscode.window.showErrorMessage(`无法预览文件: ${message}`);
        }
    });
}
