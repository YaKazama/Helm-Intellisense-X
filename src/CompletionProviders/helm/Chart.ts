import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as utils from '../../utils';
import * as yaml from '../../yaml';
import * as tgzChart from '../../tgzChart';
import { Yaml } from '../../yaml';

// 解析 Chart.yaml。同时支持 charts/*.tgz 内的 Chart.yaml
export class ChartCompletionItemProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem> | undefined> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString: string = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Chart', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Chart.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Chart', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.Chart.')) {
      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      const content: Yaml | undefined = await this.getValuesFromChartFile(document.fileName, workspaceFolder);

      if (currentString === '.Chart.') { return this.getCompletionItemList(content) }

      const allKeys: string[] = currentString.replace('.Chart.', '').split('.')
      allKeys.pop()
      return this.getCompletionItemList(this.updateCurrentKey(content, allKeys), true)
    }

    return undefined
  }

  private isInChartString(currentLine: string, position: number): boolean {
    return utils.getWordAt(currentLine, position - 1).includes('.Chart')
  }

  // 合并 file:// 依赖和 tgz 中的 Chart.yaml，根 Chart 最后合并并保持最高优先级。
  private async getValuesFromChartFile(fileName: string, workspaceFolder?: string | undefined): Promise<Yaml | undefined> {
    const chartBasePath: string | undefined = utils.getChartBasePath(fileName, workspaceFolder)
    if (chartBasePath === undefined) { return undefined }

    const pathToChartFile: string = path.join(chartBasePath, 'Chart.yaml')
    if (!fs.existsSync(pathToChartFile)) {
      vscode.window.showErrorMessage('Could not locate the Chart.yaml .')
      return undefined
    }

    const lodash = require('lodash')
    const mergeChartYaml = (target: Yaml, source: Yaml): Yaml => lodash.mergeWith(
      target,
      source,
      (_targetValue: any, sourceValue: any) => Array.isArray(sourceValue) ? sourceValue : undefined
    )
    let result: Yaml = {}
    const chartPaths: string[] = utils.getChartPathsWithLocalDependencies(chartBasePath).reverse()
    for (const chartPath of chartPaths) {
      // 先合并当前 chart 打包的依赖，再合并当前 chart 自身。
      for (const tgzPath of tgzChart.getTgzFiles(chartPath)) {
        const tgzChartYaml: Yaml = await tgzChart.getTgzChartYaml(tgzPath)
        if (typeof tgzChartYaml === 'object' && tgzChartYaml !== null && !Array.isArray(tgzChartYaml)) {
          result = mergeChartYaml(result, tgzChartYaml)
        }
      }
      const chartYamlPath: string = path.join(chartPath, 'Chart.yaml')
      const chartYaml: Yaml | undefined = yaml.load(chartYamlPath)
      if (typeof chartYaml === 'object' && chartYaml !== null && !Array.isArray(chartYaml)) {
        result = mergeChartYaml(result, chartYaml)
      }
    }
    return result
  }

  private updateCurrentKey(currentKey: any, allKeys: string[]): any {
    for (const requestedKey of allKeys) {
      if (typeof currentKey !== 'object' || currentKey === null || Array.isArray(currentKey)) { return undefined }
      const actualKey: string | undefined = Object.keys(currentKey).find((key) => key.toLowerCase() === requestedKey.toLowerCase())
      if (actualKey === undefined || Array.isArray(currentKey[actualKey])) { return undefined }
      currentKey = currentKey[actualKey]
    }
    return currentKey
  }

  private getCompletionItemList(currentKey: any, native: boolean = false): vscode.CompletionItem[] {
    const keys: any[] = []
    if (typeof currentKey !== 'object' || currentKey === null || Array.isArray(currentKey)) { return keys }
    for (const sourceKey of Object.keys(currentKey)) {
      const label: string = native ? sourceKey : this.toHelmChartKey(sourceKey)
      const value: any = currentKey[sourceKey]
      if (value === null) {
        const nullItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value)
        nullItem.detail = 'null'
        keys.push(nullItem)
        continue
      }
      if (Array.isArray(value)) {
        const arrayItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value)
        arrayItem.detail = `[${value.length} items]`
        keys.push(arrayItem)
        continue
      }
      switch (typeof value) {
        case 'object':
          keys.push(new vscode.CompletionItem(label, vscode.CompletionItemKind.Method))
          break
        case 'string':
        case 'boolean':
        case 'number':
          const valueItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Field)
          valueItem.detail = value.toString()
          keys.push(valueItem)
          break
        default:
          const unknownItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Issue)
          unknownItem.detail = 'Helm-Intellisense-X could not find type'
          keys.push(unknownItem)
          break
      }
    }
    return keys
  }

  private toHelmChartKey(key: string): string {
    if (key.toLowerCase() === 'apiversion') { return 'APIVersion' }
    return key.charAt(0).toUpperCase() + key.substring(1)
  }
}
