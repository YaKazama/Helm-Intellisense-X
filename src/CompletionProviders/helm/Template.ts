import * as vscode from 'vscode';
import * as utils from '../../utils';

// 注入 Template
export class TemplateCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Template', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Template.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Template', vscode.CompletionItemKind.Method)]
    }
    if (/^\.Template\.\w*$/.test(currentString)) {
        return this.getCompletionItemList()
    }

    return [];
  }

  private getCompletionItemList(): vscode.CompletionItem[] {
    const name = new vscode.CompletionItem('Name', vscode.CompletionItemKind.Field)
    name.detail = 'A namespaced file path to the current template (e.g. mychart/templates/mytemplate.yaml)'

    const basePath = new vscode.CompletionItem('BasePath', vscode.CompletionItemKind.Field)
    basePath.detail = 'BasePath: The namespaced path to the templates directory of the current chart (e.g. mychart/templates).'

    return [name, basePath]
  }
}
