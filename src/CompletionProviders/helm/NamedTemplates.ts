import * as vscode from 'vscode';
import * as utils from '../../utils';

export class NamedTemplatesCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }
    if (!((currentLine.includes('include')) || currentLine.includes('template'))) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).trim()
    if (currentString.startsWith('"')) {
      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      const namedTemplates: any[] = utils.getAllNamedTemplatesAndVariablesFromFiles(document.fileName, workspaceFolder)
      return this.getCompletionItemList(namedTemplates)
    }

    return undefined
  }

  private getCompletionItemList(namedTemplates: string[]): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const listOfCompletionItems: vscode.CompletionItem[] = []
    for (const namedTemplate of namedTemplates) {
      const item: vscode.CompletionItem = new vscode.CompletionItem(namedTemplate, vscode.CompletionItemKind.Field)
      item.insertText = namedTemplate
      listOfCompletionItems.push(item)
    }
    return listOfCompletionItems
  }
}
