import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * webview.html 模板缓存：模板为静态文件，缓存以避免每次打开文件都读磁盘。
 */
let htmlTemplateCache: string | null = null;

/**
 * webview 通用选项（脚本开关 + 资源根）。
 * 自定义编辑器与预览命令必须使用同一份配置，否则 bundle 可能加载不到。
 */
export function getWebviewOptions(context: vscode.ExtensionContext): vscode.WebviewOptions {
    return {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'src')),
            vscode.Uri.file(path.join(context.extensionPath, 'out'))
        ]
    };
}

/**
 * 构建 webview HTML：读取元文件 → base64 → 注入模板占位符与 bundle URI。
 *
 * 这是扩展侧唯一的数据注入实现，`WmfEditorProvider` 与 `previewCommand` 共用，
 * 避免两处各写一遍替换逻辑（曾出现同步/异步两套实现，同步版会阻塞扩展主线程）。
 *
 * @param context 扩展上下文（用于定位模板与 out/ 产物）
 * @param webview 目标 webview（用于生成 asWebviewUri）
 * @param filePath 待预览的 .wmf/.emf 文件绝对路径
 * @returns 可直接赋给 `webview.html` 的 HTML 字符串
 */
export async function buildWebviewHtml(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    filePath: string
): Promise<string> {
    // 异步读取，避免阻塞扩展主线程
    const content = await fs.promises.readFile(filePath);
    const base64 = content.toString('base64');

    if (htmlTemplateCache === null) {
        const templatePath = path.join(context.extensionPath, 'src', 'resources', 'webview.html');
        htmlTemplateCache = await fs.promises.readFile(templatePath, 'utf8');
    }

    const parserScriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'metafileParser.browser.js'))
    );

    // 替换顺序与原实现一致：先注入数据，再改写脚本路径
    return htmlTemplateCache
        .replace('${wmfBase64}', base64)
        .replace('metafileParser.browser.js', parserScriptUri.toString());
}
