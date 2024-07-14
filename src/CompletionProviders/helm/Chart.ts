import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as utils from '../../utils';
import * as yaml from '../../yaml';
import { Yaml } from '../../yaml';

// 解析 Chart.yaml
export class ChartCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
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
      const content: Yaml | undefined = this.getValuesFromChartFile(document.fileName, workspaceFolder);

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

  private getValuesFromChartFile(fileName: string, workspaceFolder?: string | undefined): Yaml | undefined {
    const chartBasePath: string | undefined = utils.getChartBasePath(fileName, workspaceFolder)
    if (chartBasePath === undefined) { return undefined }

    const pathToChartFile: string = path.join(chartBasePath, 'Chart.yaml')
    if (fs.existsSync(pathToChartFile)) { return yaml.load(pathToChartFile) }

    vscode.window.showErrorMessage('Could not locate the Chart.yaml .')
    return undefined
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
