import * as vscode from 'vscode';
import * as utils from '../../utils';

// 注入 Release
export class ReleaseCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Release', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Release.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Release', vscode.CompletionItemKind.Method)]
    }
    if (/^\.Release\.\w*$/.test(currentString)) {
        return this.getCompletionItemList()
    }

    return [];
  }

  private getCompletionItemList(): vscode.CompletionItem[] {
    const name = new vscode.CompletionItem('Name', vscode.CompletionItemKind.Field)
    name.detail = 'The release name'

    const namespace = new vscode.CompletionItem('Namespace', vscode.CompletionItemKind.Field)
    namespace.detail = 'The namespace to be released into (if the manifest doesn’t override)'

    const isUpgrade = new vscode.CompletionItem('IsUpgrade', vscode.CompletionItemKind.Field)
    isUpgrade.detail = 'This is set to true if the current operation is an upgrade or rollback.'

    const isInstall = new vscode.CompletionItem('IsInstall', vscode.CompletionItemKind.Field)
    isInstall.detail = 'This is set to true if the current operation is an install.'

    const revision = new vscode.CompletionItem('Revision', vscode.CompletionItemKind.Field)
    revision.detail = 'The revision number for this release. On install, this is 1, and it is incremented with each upgrade and rollback.'

    const service = new vscode.CompletionItem('Service', vscode.CompletionItemKind.Field)
    service.detail = 'The service that is rendering the present template. On Helm, this is always Helm.'

    return [name, namespace, isUpgrade, isInstall, revision, service]
  }
}
