import * as vscode from 'vscode';
import * as utils from "../../utils";
import { findStringInFiles } from '../findStringInFiles';
import * as tgzChart from '../../tgzChart';

// 跳转到变量定义。同时支持 charts/*.tgz 内定义的变量
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
    if (!transferString.startsWith('$')) { return undefined }

    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
    const parseVariablesOfCurrentFile: boolean = config.get('variablesCurrentFile', true)
    // 在当前命名模板（当前位置到向上找到的第一个 define 关键字范围）内查找变量定义
    const parseVariablesOfCurrentNamedTemplate: boolean = config.get('variablesCurrentNamedTemplate', true)

    if (parseVariablesOfCurrentFile) {
      let prevStartLine: vscode.Position = new vscode.Position(0, 0)
      if (parseVariablesOfCurrentNamedTemplate) {
        const pattern: RegExp = new RegExp(`{{.*\\bdefine\\b.*}}`)
        const prevContent: string = document.getText(new vscode.Range(0, 0, position.line, 0))
        let prevContentMatched: number = -1
        const match: RegExpExecArray | null = pattern.exec(prevContent)
        if (match) { prevContentMatched = match.index }
        prevStartLine = document.positionAt(prevContentMatched)
      }
      // 倒序检索
      const pattern: RegExp = new RegExp(`\\$\\b${currentString}\\b\\s*\:\=.*}}`)
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

      // 1. 在 .tpl 文件中搜索
      const locations: vscode.Location[] = await findStringInFiles(tplFiles, pattern)

      // 2. 在 charts/*.tgz 中搜索
      const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
      for (const tgzPath of tgzFiles) {
        const matches: tgzChart.TgzLocation[] = await tgzChart.findVariableInTgz(tgzPath, pattern)
        locations.push(...tgzChart.tgzLocationsToVsLocations(matches))
      }

      return locations.length > 0 ? locations : undefined
    }
  }
}
