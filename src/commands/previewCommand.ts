import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function registerPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('wmfViewer.preview', (uri) => {
        if (uri && uri.fsPath) {
            const panel = vscode.window.createWebviewPanel(
                'wmfPreview',
                'WMF Preview',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(context.extensionPath, 'src')),
                        vscode.Uri.file(path.join(context.extensionPath, 'out'))
                    ]
                }
            );

            // 读取WMF文件内容
            const wmfContent = fs.readFileSync(uri.fsPath);
            const wmfBase64 = wmfContent.toString('base64');

            // 读取webview.html文件内容
            const webviewPath = path.join(context.extensionPath, 'src', 'resources', 'webview.html');
            let webviewHtml = fs.readFileSync(webviewPath, 'utf8');
            
            // 创建metafileParser.browser.js的本地URI（从out目录）
            const parserScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'out', 'metafileParser.browser.js'));
            const parserScriptUri = panel.webview.asWebviewUri(parserScriptPath);
            
            // 替换WMF数据占位符和脚本路径
            webviewHtml = webviewHtml.replace('${wmfBase64}', wmfBase64);
            webviewHtml = webviewHtml.replace('metafileParser.browser.js', parserScriptUri.toString());

            // 创建webview内容
            panel.webview.html = webviewHtml;
        }
    });
}
