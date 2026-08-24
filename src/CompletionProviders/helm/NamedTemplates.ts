import * as vscode from 'vscode';
import * as utils from '../../utils';
import * as tgzChart from '../../tgzChart';

// include / template 提示。同时支持 charts/*.tgz 内定义的命名模板
export class NamedTemplatesCompletionItemProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem> | undefined> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }
    if (!((currentLine.includes('include')) || currentLine.includes('template'))) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).trim()
    if (currentString.startsWith('"')) {
      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
      if (chartBasePath === undefined) { return [] }

      // 1. 收集当前 chart、file:// 依赖和 charts/ 下已解压依赖的命名模板及来源
      const namedTemplates: Map<string, string[]> = utils.getNamedTemplatesWithSources(chartBasePath)
      // 2. 收集 charts/*.tgz 内的命名模板及包内路径
      const tgzFiles: string[] = tgzChart.getTgzFilesWithLocalDependencies(chartBasePath)
      for (const tgzPath of tgzFiles) {
        const templates: Map<string, tgzChart.TgzLocation[]> = await tgzChart.getTgzNamedTemplates(tgzPath)
        for (const [templateName, locations] of templates.entries()) {
          const sources: string[] = namedTemplates.get(templateName) ?? []
          for (const location of locations) {
            const source: string = `${location.tgzPath}!${location.innerPath}`
            if (!sources.includes(source)) { sources.push(source) }
          }
          namedTemplates.set(templateName, sources)
        }
      }
      return this.getCompletionItemList(position, currentString, namedTemplates)
    }

    return undefined
  }

  private getCompletionItemList(position: vscode.Position, currentString: string, namedTemplates: Map<string, string[]>): vscode.CompletionItem[] {
    const listOfCompletionItems: vscode.CompletionItem[] = []
    const typedPrefix: string = currentString.startsWith('"') ? currentString.substring(1) : currentString
    const replacementRange: vscode.Range = new vscode.Range(
      new vscode.Position(position.line, Math.max(0, position.character - typedPrefix.length)),
      position
    )
    for (const [namedTemplate, sources] of namedTemplates.entries()) {
      const item: vscode.CompletionItem = new vscode.CompletionItem(namedTemplate, vscode.CompletionItemKind.Field)
      item.insertText = namedTemplate
      item.detail = sources.join(' | ')
      item.range = replacementRange
      listOfCompletionItems.push(item)
    }
    return listOfCompletionItems
  }
}
