import * as vscode from 'vscode';
import { WmfEditorProvider } from './providers/wmfEditorProvider';
import { registerPreviewCommand } from './commands/previewCommand';

export function activate(context: vscode.ExtensionContext) {
    console.log('WMF Viewer extension activated');

    // 注册预览命令
    const previewCommand = registerPreviewCommand(context);

    // 注册自定义编辑器
    const editorProvider = WmfEditorProvider.register(context);

    context.subscriptions.push(previewCommand, editorProvider);
}

export function deactivate() {
    console.log('WMF Viewer extension deactivated');
}
