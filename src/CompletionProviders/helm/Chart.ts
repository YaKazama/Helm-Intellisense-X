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

  // 加载 Chart.yaml：优先使用 chartRootPath/Chart.yaml；再叠加 charts/*.tgz 内所有 Chart.yaml
  private async getValuesFromChartFile(fileName: string, workspaceFolder?: string | undefined): Promise<Yaml | undefined> {
    const chartBasePath: string | undefined = utils.getChartBasePath(fileName, workspaceFolder)
    if (chartBasePath === undefined) { return undefined }

    const pathToChartFile: string = path.join(chartBasePath, 'Chart.yaml')
    let result: Yaml | undefined
    if (fs.existsSync(pathToChartFile)) { result = yaml.load(pathToChartFile) }
    if (result === undefined) {
      vscode.window.showErrorMessage('Could not locate the Chart.yaml .')
      return undefined
    }

    // 叠加 charts/*.tgz 内的 Chart.yaml（tgz 后解析）
    const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
    if (tgzFiles.length > 0) {
      const lodash = require('lodash')
      for (const tgzPath of tgzFiles) {
        const tgzChartYaml: Yaml = await tgzChart.getTgzChartYaml(tgzPath)
        if (typeof tgzChartYaml === 'object' && tgzChartYaml !== null && !Array.isArray(tgzChartYaml)) {
          result = lodash.merge(result, tgzChartYaml)
        }
      }
    }
    return result
  }

  private updateCurrentKey(currentKey: any, allKeys: string[]): any {
    let result
    for (const key of allKeys) {
      if (Array.isArray(currentKey[key])) { return undefined }
      result = currentKey[key]
      if (result === undefined) {
        if (key.toLowerCase().indexOf('api') > -1) {
          result = currentKey[key.slice(0, 3).toLowerCase() + key.slice(1)]
        } else {
          result = currentKey[key.charAt(0).toLowerCase() + key.slice(1)]
        }
      }
    }
    return result
  }

  private getCompletionItemList(currentKey: any, native: boolean = false): vscode.CompletionItem[] {
    const keys: any[] = []
    for (let key in currentKey) {
      if (!native) {
        if (key.toLowerCase().indexOf('api') > -1) {
          key = key.slice(0, 3).toUpperCase() + key.slice(3)
        } else {
          key = key.charAt(0).toUpperCase() + key.slice(1)
        }
      }
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
