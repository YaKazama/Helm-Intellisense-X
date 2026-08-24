import * as vscode from 'vscode';
import * as utils from "../../utils";
import { findStringInFiles } from '../findStringInFiles';

// 只能适用于特殊的命名模板 base.env.const

// 1 获取当前位置的值 A
// 2 获取 helm-intellisense-x.envFiles helm-intellisense-x.envJumpPrefixes 定义
// 3 检查 A 的前缀是否在 helm-intellisense-x.envJumpPrefixes 中
// 4 跳转到 A 所在位置的开始位置
export class JumpToConstDefineProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
    const envFiles: string[] = config.get('envFiles', [])
    const envJumpPrefixes: string[] = config.get('envJumpPrefixes', [])
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 按下 cmd 键时的字符
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position)
    if (wordRange === undefined) { return undefined }
    let currentString: string = document.getText(wordRange)
    // 检查是否以指定分隔符分隔的文本
    const transferString: string = utils.getWordAtRange({ str: currentLine, pos: position.character })
    // 前缀符合，才触发
    const prefix: string = transferString.split('.')[0]
    if (envJumpPrefixes.includes(prefix)) {

      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
      const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
      const valuesFiles: string[] = utils.getValueFileNamesWithLocalDependencies(chartBasePath!, envFiles)

      const matchPattern: RegExp = utils.getRegExpPattern(transferString, currentString)
      try {
        const locations: vscode.Location[] = await findStringInFiles(valuesFiles, matchPattern)
        return locations.length > 0 ? locations : undefined
      } catch (error) {
        vscode.window.showErrorMessage(`Error finding definition: ${error}`)
        return undefined
      }
    }
    return undefined
  }
}
