import * as vscode from 'vscode';
import * as utils from "../../utils";
import { findStringInFiles } from "../findStringInFiles";
// import { removeSeparatorFromConfig } from './updateSeparator'

// tpl 文件中，include 中的内容跳转到 define
export class JumpToNamedTemplatesDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    // 检查是否需要修改分隔符。操作不可逆
    // removeSeparatorFromConfig()
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 检查当前行是否在 {{ }} 之内
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }
    if (!((currentLine.includes('include')) || currentLine.includes('template'))) { return undefined }
    // 获取按下 cmd 键时的字符
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position)
    if (wordRange === undefined) { return undefined }
    // 获取双引号内的内容
    const currentString: string = utils.getWordAtRange({ str: currentLine, pos: position.character, sep: '"' })

    const pattern: RegExp = /^[a-zA-Z][a-zA-Z0-9_.]+$/g
    if (pattern.test(currentString)) {
      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
      if (chartBasePath === undefined) { return [] }
      const tplFiles: string[] = utils.getTemplatesFileFromConfig(chartBasePath)

      const searchString = `define "${currentString}"`

      try {
        const locations: vscode.Location[] = await findStringInFiles(tplFiles, searchString)

        return locations.length > 0 ? locations : undefined
      } catch (error) {
        vscode.window.showErrorMessage(`Error finding definition: ${error}`)
        return undefined
      }
    }
  }
}
