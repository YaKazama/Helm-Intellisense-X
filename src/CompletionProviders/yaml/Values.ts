import * as vscode from 'vscode';
import * as utils from '../../utils';
import * as tgzChart from '../../tgzChart';
import type { Yaml } from '../../yaml';

// 解析 values.yaml 及其他指定的 yaml 文件。同时支持 charts/*.tgz 内的 values.yaml
export class ValuesCompletionItemProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem> | undefined> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString: string = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Values', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Values.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Values', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.Values.')) {
      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      // 1. 合并 chartRootPath 下与 charts/*.tgz 内的 values
      const content: Yaml | undefined = await this.getValuesWithTgz(document.fileName, workspaceFolder)

      if (currentString === '.Values.') { return this.getCompletionItemList(content) }

      const allKeys: string[] = currentString.replace('.Values.', '').split('.')
      allKeys.pop()
      return this.getCompletionItemList(this.updateCurrentKey(content, allKeys))
    }

    return undefined
  }

  // 合并 chartRootPath 下的 values 与 charts/*.tgz 内的 values（tgz 后解析，作为覆盖）
  private async getValuesWithTgz(fileName: string, workspaceFolder?: string | undefined): Promise<Yaml | undefined> {
    let merged: Yaml | undefined = utils.getValuesFromFile(fileName, workspaceFolder)
    const chartBasePath: string | undefined = utils.getChartBasePath(fileName, workspaceFolder)
    if (chartBasePath === undefined) { return merged }

    // 加载 tgz 内的 values.yaml（按照配置中定义的 values 文件名列表）
    const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
    if (tgzFiles.length === 0) { return merged }

    const valuesFileNames: string[] = vscode.workspace.getConfiguration('helm-intellisense-x').get('values', ['values.yaml'])
    for (const tgzPath of tgzFiles) {
      const tgzValues: Yaml = await tgzChart.getTgzValuesAsYaml(tgzPath, valuesFileNames)
      if (typeof tgzValues === 'object' && tgzValues !== null && !Array.isArray(tgzValues)) {
        const lodash = require('lodash')
        if (merged === undefined) { merged = {} }
        merged = lodash.merge(merged, tgzValues)
      }
    }
    return merged
  }

  private updateCurrentKey(currentKey: any, allKeys: string[]): any {
    for (const key of allKeys) {
      if (Array.isArray(currentKey[key])) { return undefined }
      currentKey = currentKey[key]
    }
    return currentKey
  }

  private getCompletionItemList(currentKey: any): vscode.CompletionItem[] {
    const keys: any[] = []
    for (const key in currentKey) {
      switch (typeof currentKey[key]) {
        case 'object':
          keys.push(new vscode.CompletionItem(key, vscode.CompletionItemKind.Method))
          break
        case 'string':
        case 'boolean':
        case 'number':
        const valueItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field)
          valueItem.detail = currentKey[key].toString()
          keys.push(valueItem)
          break
        default:
          const unknownItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Issue)
          unknownItem.detail = 'Helm-Intellisense-X could not find type'
          keys.push(unknownItem)
          break
      }
    }
    return keys
  }
}
