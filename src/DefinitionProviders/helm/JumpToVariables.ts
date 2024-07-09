import * as vscode from 'vscode';
import * as utils from "../../utils";
import { findStringInFiles } from '../findStringInFiles';

// 只在当前文件中查找
export class JumpToVariablesDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 检查当前行是否在 {{ }} 之内
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }
    // 获取按下 cmd 键时的字符
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position)
    if (wordRange === undefined) { return undefined }
    const currentString: string = document.getText(wordRange)
    const transferString: string = utils.getWordAtRange({ str: currentLine, pos: position.character, startSep: '$', rtStartSep: true })

    // 当取到的值以 $ 开头时，触发
    if (transferString.startsWith('$')) {
      // 从当前行往前找，匹配成功则停止
      const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
      const parseVariablesOfCurrentFile: boolean = config.get('variablesCurrentFile', true)
      // 在当前命名模板（当前位置到向上找到的第一个 define 关键字范围）内查找变量定义
      // true 向上找到第一个 define 就停止；false 一直找到文档开头
      const parseVariablesOfCurrentNamedTemplate: boolean = config.get('variablesCurrentNamedTemplate', true)

      // helm-intellisense-x.variablesCurrentFile = true 在当前文件中过滤 Variables
      // helm-intellisense-x.variablesCurrentFile = false 在所有文件中过滤 Variables
      //  具体会有多少 *.tpl 文件加载，受 helm-intellisense-x.templates helm-intellisense-x.templatesExclude 设置影响
      if (parseVariablesOfCurrentFile) {
        let prevStartLine: vscode.Position = new vscode.Position(0, 0)
        if (parseVariablesOfCurrentNamedTemplate) {
          const prevContent: number = document.getText(new vscode.Range(0, 0, position.line, 0)).lastIndexOf('define')
          prevStartLine = document.positionAt(prevContent)
        }
        // 倒序检索
        const pattern: RegExp = new RegExp(`\\$\\b${currentString}\\b\\s*:=.*}}`)
        for (let i: number = position.line - 1; i >= prevStartLine.line; i--) {
          const currentLine: string = document.lineAt(i).text
          const match: RegExpExecArray | null = pattern.exec(currentLine)
          if (match) {
            return new vscode.Location(document.uri, new vscode.Position(i, match.index))
          }
        }
      } else {
        const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
        const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
        if (chartBasePath === undefined) { return [] }
        const tplFiles: string[] = utils.getTemplatesFileFromConfig(chartBasePath)

        const pattern: RegExp = new RegExp(`\\$\\b${currentString}\\b\\s*:=.*}}`)

        try {
          const locations: vscode.Location[] = await findStringInFiles(tplFiles, pattern)
          return locations.length > 0 ? locations : undefined
        } catch (error) {
          vscode.window.showErrorMessage(`Error finding definition: ${error}`)
          return undefined
        }
      }
    }
  }
}
