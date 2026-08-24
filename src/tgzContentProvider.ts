import * as vscode from 'vscode';
import { TGZ_SCHEME, getTgzChartInfo, parseTgzUri } from './tgzChart';

// 注册 tgz 协议方案的文本内容提供器
// 当用户跳转到 charts/*.tgz 内的文件位置时，VS Code 会回调此提供器加载文件内容
export function registerTgzContentProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
      const uriParts: { tgzPath: string, innerPath: string } | undefined = parseTgzUri(uri)
      if (uriParts === undefined) { return '' }
      try {
        const info = await getTgzChartInfo(uriParts.tgzPath)
        const fullKey: string = info.chartRoot ? `${info.chartRoot}/${uriParts.innerPath}` : uriParts.innerPath
        return info.entries.get(fullKey) ?? ''
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to read tgz: ${(e as Error).message}`)
        return ''
      }
    }
  }

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(TGZ_SCHEME, provider)
  )
}
