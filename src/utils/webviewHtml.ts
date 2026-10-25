import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * webview.html 模板缓存：模板为静态文件，缓存以避免每次打开文件都读磁盘。
 */
let htmlTemplateCache: string | null = null;

/** 用字面量替换所有占位符（避免 replace 只换第一处、也不受 $& 等替换语义影响） */
function fill(template: string, token: string, value: string): string {
    return template.split(token).join(value);
}

/**
 * webview 通用选项（脚本开关 + 资源根）。
 * 自定义编辑器与预览命令必须使用同一份配置，否则 bundle 可能加载不到。
 *
 * @param context 扩展上下文
 * @param fileUri 待预览文件；其所在目录必须加入 localResourceRoots，
 *                否则 webview 内的 fetch 会被资源访问校验拦下
 */
export function getWebviewOptions(
    context: vscode.ExtensionContext,
    fileUri?: vscode.Uri
): vscode.WebviewOptions {
    const localResourceRoots = [
        vscode.Uri.file(path.join(context.extensionPath, 'src')),
        vscode.Uri.file(path.join(context.extensionPath, 'out'))
    ];
    if (fileUri) {
        localResourceRoots.push(vscode.Uri.joinPath(fileUri, '..'));
    }
    return {
        enableScripts: true,
        localResourceRoots
    };
}

/**
 * 构建 webview HTML。
 *
 * 数据注入方式（性能关键）：
 *   - 默认把文件 URI 交给 webview，由它 `fetch` 成 ArrayBuffer。文件二进制既不进
 *     HTML 字符串、也不做 base64 膨胀（17 MB 样例曾产生 22 MB HTML，并要求整份
 *     文档常驻内存）。
 *   - 仅当资源不是 `file:` scheme（git: / vscode-vfs: 等，`asWebviewUri` 不支持）时，
 *     回退到 base64 内联，保证这类只读视图仍可预览。
 *
 * 这是扩展侧唯一的数据注入实现，`WmfEditorProvider` 与 `previewCommand` 共用。
 *
 * @param context 扩展上下文（用于定位模板与 out/ 产物）
 * @param webview 目标 webview（用于生成 asWebviewUri / cspSource）
 * @param fileUri 待预览的 .wmf/.emf 文件 URI
 * @returns 可直接赋给 `webview.html` 的 HTML 字符串
 */
export async function buildWebviewHtml(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    fileUri: vscode.Uri
): Promise<string> {
    if (htmlTemplateCache === null) {
        const templatePath = path.join(context.extensionPath, 'src', 'resources', 'webview.html');
        htmlTemplateCache = await fs.promises.readFile(templatePath, 'utf8');
    }

    const nonce = crypto.randomBytes(16).toString('base64');
    const parserScriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'metafileParser.browser.js'))
    );

    let metafileUri = '';
    let inlineBase64 = '';
    if (fileUri.scheme === 'file') {
        metafileUri = webview.asWebviewUri(fileUri).toString();
    } else {
        const content = await vscode.workspace.fs.readFile(fileUri);
        inlineBase64 = Buffer.from(content).toString('base64');
    }

    let html = htmlTemplateCache;
    html = fill(html, '${nonce}', nonce);
    html = fill(html, '${cspSource}', webview.cspSource);
    html = fill(html, '${metafileUri}', metafileUri);
    html = fill(html, '${wmfBase64}', inlineBase64);
    html = fill(html, 'metafileParser.browser.js', parserScriptUri.toString());
    return html;
}
