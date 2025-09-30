import * as vscode from 'vscode';
import * as utils from '../../utils';

export class VariablesCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 检查当前行是否在 {{ }} 之内
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }

    // 光标位置输入的文本
    const currentString = utils.getWordAt(currentLine, position.character - 1).trim()
    if (currentString.startsWith('$')) {
      // 获取 helm-intellisense-x.variablesCurrentFile helm-intellisense-x.variablesCurrentNamedTemplate
      // 同时会影响 JumpToVariablesDefinitionProvider、JumpToValuesDefinitionProvider
      const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
      const parseVariablesOfCurrentFile: boolean = config.get('variablesCurrentFile', true)
      // 在当前命名模板（当前位置到向上找到的第一个 define 关键字范围）内查找变量定义
      const parseVariablesOfCurrentNamedTemplate: boolean = config.get('variablesCurrentNamedTemplate', true)

      // helm-intellisense-x.variablesCurrentFile = true 在当前文件中过滤 Variables
      // helm-intellisense-x.variablesCurrentFile = false 在所有文件中过滤 Variables
      //  具体会有多少 *.tpl 文件加载，受 helm-intellisense-x.templates helm-intellisense-x.templatesExclude 设置影响
      let variables: any[] = []
      if (parseVariablesOfCurrentFile) {
        let prevStartLine: vscode.Position = new vscode.Position(0, 0)
        if (parseVariablesOfCurrentNamedTemplate) {
          const prevContent: number = document.getText(new vscode.Range(0, 0, position.line, 0)).lastIndexOf('define')
          prevStartLine = document.positionAt(prevContent)
        }

        const pattern: RegExp = /{{-?\s*(?:range\s+)?\$?(?<key>\w+)(?:,\s*\$?(?<key2>\w+))?\s*:=\s*(?<value>.+?)\s*-?}}/g;
        for (let i: number = position.line; i >= prevStartLine.line; i--) {
          const checkLine = document.lineAt(i).text
          const match: RegExpExecArray | null = pattern.exec(checkLine)
          if (match) {
            if (match.groups === undefined) { continue }
            variables.push({
              key: match.groups.key.trim(),
              value: match.groups.value.trim()
            })
            if (match.groups.key2) {
              variables.push({
                key: match.groups.key2.trim(),
                value: match.groups.value.trim()
              })
            }
          }
          pattern.lastIndex = 0
        }

        // 👇 旧方法，留着待查
        // let content: string = ''
        // // helm-intellisense.variablesCurrentNamedTemplate = true 从光标位置向前查，遇到 define 后停止。在此范围中过滤 Variables
        // if (parseVariablesOfCurrentNamedTemplate) {
        //   const prevContent: number = document.getText(new vscode.Range(0, 0, position.line, 0)).lastIndexOf('define')
        //   const prevStartLine: vscode.Position = document.positionAt(prevContent)
        //   content = document.getText(new vscode.Range(prevStartLine.line, 0, position.line, 0))
        // } else {
        //   content = document.getText()
        // }
        // variables = utils.getListOfVariables(content)
        // 👆 旧方法，留着待查
      } else {
        const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
        variables = utils.getAllNamedTemplatesAndVariablesFromFiles(document.fileName, workspaceFolder, true)
      }

      let completionItems: vscode.CompletionItem[] = []
      variables.filter((item) => {
        completionItems.push(this.toCompletionItem(item))
      })
      return completionItems
    }
    return undefined
  }

  private toCompletionItem(variable: utils.Variable): vscode.CompletionItem {
    const completionItem = new vscode.CompletionItem(variable.key, vscode.CompletionItemKind.Variable)
    completionItem.detail = variable.value
    return completionItem
  }
}
