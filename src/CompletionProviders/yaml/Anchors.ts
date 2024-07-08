import * as vscode from 'vscode';

// 解析当前文件 锚点。YAML 标准规范本身不直接支持跨文件的锚点引用
export class AnchorCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const txt: string = document.getText()
    return this.getCompletionItemList(txt, document, position)
  }

  private getCompletionItemList(txt: string, document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const anchors: string[] = this.getAllAnchors(txt)
    const completionItems: vscode.CompletionItem[] = []
    for (const anchor of anchors) {
      const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
      if (wordRange === undefined) {
        const completionItem = new vscode.CompletionItem(anchor.replace('&', ''))
        completionItems.push(completionItem)
        continue
      }
      const completionItemWithAsteriskReplace = new vscode.CompletionItem(anchor.replace('&', ''))
      completionItemWithAsteriskReplace.range = new vscode.Range(new vscode.Position(wordRange.start.line, wordRange.start.character - 1), wordRange.end)
      completionItemWithAsteriskReplace.insertText = ' *' + anchor.replace('&', '')
      completionItems.push(completionItemWithAsteriskReplace)

      const completionItemWithoutAsterisk = new vscode.CompletionItem(anchor.replace('&', ''))
      completionItemWithoutAsterisk.range = new vscode.Range(new vscode.Position(wordRange.start.line, wordRange.start.character), wordRange.end)
      completionItemWithoutAsterisk.insertText = anchor.replace('&', '*')
      completionItems.push(completionItemWithoutAsterisk)
    }
    return completionItems
  }

  private getAllAnchors(txt: string): string[] {
    const phrases: string[] = txt.split(' ')
    const anchors: string[] = []

    for (const v of phrases) {
      if (v.startsWith('&')) {
        anchors.push(v.replace(/[^\x20-\x7E]+/g, ''))
      }
    }
    return anchors
  }
}
