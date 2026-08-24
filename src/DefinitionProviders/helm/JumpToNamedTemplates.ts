import * as vscode from 'vscode';
import * as utils from "../../utils";
import { findStringInFiles } from "../findStringInFiles";
import * as tgzChart from "../../tgzChart";

// tpl 文件中，include 中的内容跳转到 define
// 同时支持 charts/*.tgz 内定义的命名模板
export class JumpToNamedTemplatesDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    // 当前行文本
    const currentLine: string = document.lineAt(position).text
    // 检查当前行是否在 {{ }} 之内
    if (!utils.isInsideBrackets(currentLine, position.character)) { return undefined }
    if (!((currentLine.includes('include')) || currentLine.includes('template'))) { return undefined }
    // 获取双引号内的内容
    const currentString: string = utils.getWordAtRange({ str: currentLine, pos: position.character, sep: '"' })
    if (currentString.length === 0) { return undefined }

    const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
    const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
    if (chartBasePath === undefined) { return [] }

    // 1. 检索 chartRootPath 下配置的模板文件
    const tplFiles: string[] = utils.getTemplatesFileFromConfig(chartBasePath)
    const escapedTemplateName: string = currentString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchPattern: RegExp = new RegExp(`{{-?\\s*define\\s+"${escapedTemplateName}"\\s*-?}}`)
    const locations: vscode.Location[] = await findStringInFiles(tplFiles, searchPattern)

    // 2. 检索 charts/*.tgz 内的命名模板
    const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
    for (const tgzPath of tgzFiles) {
      const matches: tgzChart.TgzLocation[] = await tgzChart.findTplNameInTgz(tgzPath, currentString)
      locations.push(...tgzChart.tgzLocationsToVsLocations(matches))
    }

    return locations.length > 0 ? locations : undefined
  }
}
