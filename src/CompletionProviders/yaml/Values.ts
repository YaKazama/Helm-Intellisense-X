import * as vscode from 'vscode';
import * as utils from '../../utils';
import type { Yaml } from '../../yaml';

// 解析 values.yaml 及其他指定的 yaml 文件
export class ValuesCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
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
      const content: Yaml | undefined = utils.getValuesFromFile(document.fileName, workspaceFolder)

      if (currentString === '.Values.') { return this.getCompletionItemList(content) }

      const allKeys: string[] = currentString.replace('.Values.', '').split('.')
      allKeys.pop()
      return this.getCompletionItemList(this.updateCurrentKey(content, allKeys))
    }

    return undefined
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
