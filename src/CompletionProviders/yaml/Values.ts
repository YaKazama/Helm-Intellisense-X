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

  // 合并 file:// 依赖及 tgz 中的 values，本地 values 最后合并并保持最高优先级。
  private async getValuesWithTgz(fileName: string, workspaceFolder?: string | undefined): Promise<Yaml | undefined> {
    const fileValues: Yaml | undefined = utils.getValuesFromFile(fileName, workspaceFolder)
    const chartBasePath: string | undefined = utils.getChartBasePath(fileName, workspaceFolder)
    if (chartBasePath === undefined) { return fileValues }

    // 加载 tgz 内的 values.yaml（按照配置中定义的 values 文件名列表）
    const tgzFiles: string[] = tgzChart.getTgzFilesWithLocalDependencies(chartBasePath)
    const lodash = require('lodash')
    const mergeValues = (target: Yaml, source: Yaml): Yaml => lodash.mergeWith(
      target,
      source,
      (_targetValue: any, sourceValue: any) => Array.isArray(sourceValue) ? sourceValue : undefined
    )
    let merged: Yaml = {}
    const valuesFileNames: string[] = vscode.workspace.getConfiguration('helm-intellisense-x').get('values', ['values.yaml'])
    for (const tgzPath of tgzFiles) {
      const tgzValues: Yaml = await tgzChart.getTgzValuesAsYaml(tgzPath, valuesFileNames)
      if (typeof tgzValues === 'object' && tgzValues !== null && !Array.isArray(tgzValues)) {
        merged = mergeValues(merged, tgzValues)
      }
    }
    if (typeof fileValues === 'object' && fileValues !== null && !Array.isArray(fileValues)) {
      merged = mergeValues(merged, fileValues)
    }
    return merged
  }

  private updateCurrentKey(currentKey: any, allKeys: string[]): any {
    for (const key of allKeys) {
      if (typeof currentKey !== 'object' || currentKey === null || Array.isArray(currentKey)) { return undefined }
      if (Array.isArray(currentKey[key])) { return undefined }
      currentKey = currentKey[key]
    }
    return currentKey
  }

  private getCompletionItemList(currentKey: any): vscode.CompletionItem[] {
    const keys: any[] = []
    if (typeof currentKey !== 'object' || currentKey === null || Array.isArray(currentKey)) { return keys }
    for (const key in currentKey) {
      const value: any = currentKey[key]
      if (value === null) {
        const nullItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Value)
        nullItem.detail = 'null'
        keys.push(nullItem)
        continue
      }
      if (Array.isArray(value)) {
        const arrayItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Value)
        arrayItem.detail = `[${value.length} items]`
        keys.push(arrayItem)
        continue
      }
      switch (typeof value) {
        case 'object':
          keys.push(new vscode.CompletionItem(key, vscode.CompletionItemKind.Method))
          break
        case 'string':
        case 'boolean':
        case 'number':
          const valueItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field)
          valueItem.detail = value.toString()
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
