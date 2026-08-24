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
      // 1. 收集 chartRootPath 下的所有命名模板
      const result: (string | utils.Variable)[] = utils.getAllNamedTemplatesAndVariablesFromFiles(document.fileName, workspaceFolder)
      const namedTemplates: string[] = result.filter((item): item is string => typeof item === 'string')
      // 2. 收集 charts/*.tgz 内的命名模板
      const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
      if (chartBasePath !== undefined) {
        const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
        for (const tgzPath of tgzFiles) {
          const templates: Map<string, tgzChart.TgzLocation> = await tgzChart.getTgzNamedTemplates(tgzPath)
          for (const key of templates.keys()) {
            if (!namedTemplates.includes(key)) { namedTemplates.push(key) }
          }
        }
      }
      return this.getCompletionItemList(namedTemplates) ?? []
    }

    return undefined
  }

  private getCompletionItemList(namedTemplates: string[]): vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem> | undefined {
    const listOfCompletionItems: vscode.CompletionItem[] = []
    for (const namedTemplate of namedTemplates) {
      const item: vscode.CompletionItem = new vscode.CompletionItem(namedTemplate, vscode.CompletionItemKind.Field)
      item.insertText = namedTemplate
      listOfCompletionItems.push(item)
    }
    return listOfCompletionItems
  }
}
