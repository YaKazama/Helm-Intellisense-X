import * as vscode from 'vscode';
import * as utils from '../../utils';

// 注入 Files
export class FilesCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Files', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Files.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Files', vscode.CompletionItemKind.Method)]
    }
    if (/^\.Files\.\w*$/.test(currentString)) {
        return this.getCompletionItemList()
    }

    return [];
  }

  private getCompletionItemList(): vscode.CompletionItem[] {
    const get = new vscode.CompletionItem('Get', vscode.CompletionItemKind.Field)
        get.detail = 'Files.Get is a function for getting a file by name (.Files.Get config.ini)'

        const getBytes = new vscode.CompletionItem('GetBytes', vscode.CompletionItemKind.Field)
        getBytes.detail = 'Files.GetBytes is a function for getting the contents of a file as an array of bytes instead of as a string. This is useful for things like images.'

        const glob = new vscode.CompletionItem('Glob', vscode.CompletionItemKind.Field)
        glob.detail = 'Files.Glob is a function that returns a list of files whose names match the given shell glob pattern.'

        const lines = new vscode.CompletionItem('Lines', vscode.CompletionItemKind.Field)
        lines.detail = 'Files.Lines is a function that reads a file line-by-line. This is useful for iterating over each line in a file.'

        const asSecrets = new vscode.CompletionItem('AsSecrets', vscode.CompletionItemKind.Field)
        asSecrets.detail = 'Files.AsSecrets is a function that returns the file bodies as Base 64 encoded strings.'

        const asConfig = new vscode.CompletionItem('AsConfig', vscode.CompletionItemKind.Field)
        asConfig.detail = 'Files.AsConfig is a function that returns file bodies as a YAML map.'

        return [get, getBytes, glob, lines, asSecrets, asConfig]
  }
}
