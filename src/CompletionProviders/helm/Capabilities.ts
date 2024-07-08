import * as vscode from 'vscode';
import * as utils from '../../utils';

// 注入 Capabilities
export class CapabilitiesCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const currentLine: string = document.lineAt(position).text
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    const currentString = utils.getWordAt(currentLine, position.character - 1).replace('$.', '.').trim()
    if (currentString.length === 0) {
      return [new vscode.CompletionItem('.Capabilities', vscode.CompletionItemKind.Method)]
    }
    if (currentString.startsWith('.') && !currentString.includes('.Capabilities.') && currentString.split('.').length < 3) {
      return [new vscode.CompletionItem('Capabilities', vscode.CompletionItemKind.Method)]
    }

    if (/^\.Capabilities\.\w*$/.test(currentString)) {
      return [
        new vscode.CompletionItem('APIVersions', vscode.CompletionItemKind.Method),
        new vscode.CompletionItem('KubeVersion', vscode.CompletionItemKind.Method)
      ]
    }

    if (/^\.Capabilities\.APIVersions\.\w*$/.test(currentString)) {
      const has = new vscode.CompletionItem('Has', vscode.CompletionItemKind.Field)
      has.detail = 'Capabilities.APIVersions.Has $version indicates whether a version (e.g., batch/v1) or resource (e.g., apps/v1/Deployment) is available on the cluster.'
      return [has]
    }

    if (/^\.Capabilities\.KubeVersion\.\w*$/.test(currentString)) {
      const version = new vscode.CompletionItem('Version', vscode.CompletionItemKind.Field)
      version.detail = 'Capabilities.KubeVersion and Capabilities.KubeVersion.Version is the Kubernetes version.'

      const major = new vscode.CompletionItem('Major', vscode.CompletionItemKind.Field)
      major.detail = 'Capabilities.KubeVersion.Major is the Kubernetes major version.'

      const minor = new vscode.CompletionItem('Minor', vscode.CompletionItemKind.Field)
      minor.detail = 'Capabilities.KubeVersion.Minor is the Kubernetes minor version.'

      return [version, major, minor]
    }

    return []
  }
}
