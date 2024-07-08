import * as vscode from "vscode";
import * as utils from "../../utils";
import { findStringInFiles } from '../findStringInFiles';

export class JumpToValuesDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 获取按下 cmd 键时的字符
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position)
    if (wordRange === undefined) { return undefined }
    let currentString: string = document.getText(wordRange)
    // // 检查光标所在位置以空格分隔的文本，是否以 .Values. 或 .Chart. 开头
    const transferString: string = utils.getWordAtRange({ str: currentLine, pos: position.character })

    const pattern: RegExp = /^(\$?\.(Chart|Values)|[\w-]+)(\.[\w-]+)*|(?:<<:\s*)?\[?\*\b[\w-]+\b\]?/g
    if (pattern.test(transferString)) {
      // 从文件开头往后找，匹配成功则停止
      const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
      const parseVariablesOfCurrentFile: boolean = config.get('variablesCurrentFile', true)
      // true 从开头到光标行；false 全文检索
      const parseVariablesOfCurrentPosition: boolean = config.get('variablesCurrentPosition', true)

      // 处理 Chart
      //  要将 currentString 首字母小写
      //  isChart 标识，区分 Values
      let isChart: boolean = false
      if (transferString.startsWith('.Chart.') || transferString.startsWith('$.Chart.')) {
        currentString = currentString.charAt(0).toLowerCase() + currentString.slice(1)
        isChart = true
      }

      if (parseVariablesOfCurrentFile) {
        let endLine: vscode.Position = position
        // 注意这个地方是 取反
        if (!parseVariablesOfCurrentPosition) {
          const lastLineNumber = document.lineCount - 1
          const lastLine = document.lineAt(lastLineNumber)
          endLine = new vscode.Position(lastLineNumber, lastLine.text.length)
        }
        // 正序检索
        // 定义默认正则
        // 处理 锚点、模板中定义的变量

        let pattern: RegExp
        const tranferPatternAnchor: RegExp = new RegExp(`\\[?\\*\\b${currentString}\\b\\]?`)
        if (tranferPatternAnchor.test(transferString)) {
          pattern = new RegExp(`(.*)(&\\b${currentString.replace('*', '')}\\b)`)
        } else {
          pattern = new RegExp(`^(.*)(\\b${currentString}\\b:)`)
        }
        for (let i: number = endLine.line; i >= 0; i--) {
          const currentLine: string = document.lineAt(i).text
          const match: RegExpExecArray | null = pattern.exec(currentLine)
          if (match) {
            const c: number = match[1] ? match[1].length : match.index!
            return new vscode.Location(document.uri, new vscode.Position(i, c))
          }
        }
      } else {
        const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
        const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
        if (chartBasePath === undefined) { return [] }
        let valuesFiles: string[] = []
        if (isChart) {
          valuesFiles = utils.getChartFileFromConfig(chartBasePath)
        } else {
          valuesFiles = utils.getValueFileNamesFromConfig(chartBasePath)
        }

        let pattern: RegExp
        const tranferPatternAnchor: RegExp = new RegExp(`\\[?\\*\\b${currentString}\\b\\]?`)
        if (tranferPatternAnchor.test(transferString)) {
          pattern = new RegExp(`(.*)(&\\b${currentString.replace('*', '')}\\b)`)
        } else {
          pattern = new RegExp(`^(.*)(\\b${currentString}\\b:)`)
        }

        const offSetPosition: number = currentString.length + 1
        try {
          const locations: vscode.Location[] = await findStringInFiles(valuesFiles, pattern, offSetPosition)
          return locations.length > 0 ? locations : undefined
        } catch (error) {
          vscode.window.showErrorMessage(`Error finding definition: ${error}`)
          return undefined
        }
      }
    }
  }
}
