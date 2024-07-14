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
    // // 检查光标所在位置以指定的分隔符分隔的文本
    const transferString: string = utils.getWordAtRange({ str: currentLine, pos: position.character })

    // 从文件开头往后找，匹配成功则停止
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
    const parseValuesOfCurrentFile: boolean = config.get('valuesCurrentFile', true)
    // true 从开头到光标行；false 全文检索
    const parseValuesOfCurrentPosition: boolean = config.get('valuesCurrentPosition', true)
    // .Values.xxx 映射，用于处理 {{- $_ := set . "Context" .Values.Keyword }}
    const valuesMappingEnable: boolean = config.get('valuesMappingEnable', false)
    // 如果 path 为空，则使用 helm-intellisense-x.values 定义的值
    const valuesMapping: utils.valuesMapping = config.get('valuesMapping', {})

    let pattern: RegExp = /^(\$?\.(Chart|Values)|[\w-]+)(\.[\w-]+)*|(?:<<:\s*)?\[?\*\b[\w-]+\b\]?/g
    let valuesMappingKey: string = ''
    if (valuesMappingEnable) {
      // 检查是否为 .Values.xxx 映射
      // 将 .Context 当作 .Values 处理，先找 Keyword: 行，然后再换后续的内容并返回 Location 不符合规则的，不处理
      // ['', 'Context', 'xxx', 'yyy'] => .Values.<analytic>.xxx.yyy
      const valuesMappingKeys: string[] = Object.keys(valuesMapping)
      if (valuesMappingKeys.length > 0) {
        const transferStringList: string[] = transferString.split('.')
        // 取出 Mapping 中的 keyword
        if (transferStringList.length > 2) {
          valuesMappingKey = transferStringList.at(1)!
          if (['Chart', 'Values'].includes(valuesMappingKey)) { valuesMappingKey = '' }
        }
      }
      if (valuesMappingKey) {
        pattern = new RegExp(`^(\\$?\\.(Chart|Values|${valuesMappingKey})|[\\w-]+)(\\.[\\w-]+)*|(?:<<:\\s*)?\\[?\\*\\b[\\w-]+\\b\\]?`)
      }
    }
    if (pattern.test(transferString)) {
      if (parseValuesOfCurrentFile) {
        let endLine: vscode.Position = position
        // 注意这个地方是 取反
        if (!parseValuesOfCurrentPosition) {
          const lastLineNumber = document.lineCount - 1
          const lastLine = document.lineAt(lastLineNumber)
          endLine = new vscode.Position(lastLineNumber, lastLine.text.length)
        }
        // 正序检索
        // 定义正则
        const matchPattern: RegExp = getRegExpPattern(transferString, currentString)
        for (let i: number = endLine.line; i >= 0; i--) {
          const currentLine: string = document.lineAt(i).text
          const match: RegExpExecArray | null = matchPattern.exec(currentLine)
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
        let valuesMappingInfoKey: string = ''
        // 确定需要检索的文件范围
        let isChart: boolean = false
        let keyPattern: RegExp = /^\$?\.Chart\./g
        if (keyPattern.test(transferString)) {
          // Chart.yaml 中的变量，需要首字母转为小写后查询
          if (currentString.toLowerCase().indexOf('api') > -1) {
            currentString = currentString.slice(0, 3).toLowerCase() + currentString.slice(3)
          } else {
            currentString = currentString.charAt(0).toLowerCase() + currentString.slice(1)
          }
          isChart = true
        }
        if (isChart) {
          // 处理 Chart
          //  要将 currentString 首字母小写
          //  isChart 标识，区分 Values
          valuesFiles = utils.getChartFileFromConfig(chartBasePath)
        } else if (valuesMappingEnable && valuesMappingKey) {
          // 处理 .Values.xxx 映射，用于处理 {{- $_ := set . "Context" .Values.Keyword }}
          const o: utils.valuesMappingInfo = valuesMapping[valuesMappingKey]
          valuesMappingInfoKey = o.key
          valuesFiles = utils.getValueFileNamesFromConfig(chartBasePath, o.path)
        } else {
          // 默认
          valuesFiles = utils.getValueFileNamesFromConfig(chartBasePath)
        }

        const matchPattern: RegExp = getRegExpPattern(transferString, currentString)
        try {
          const locations: vscode.Location[] = await findStringInFiles(valuesFiles, matchPattern, valuesMappingInfoKey)
          return locations.length > 0 ? locations : undefined
        } catch (error) {
          vscode.window.showErrorMessage(`Error finding definition: ${error}`)
          return undefined
        }
      }
    }
  }
}

function getRegExpPattern(transferString: string, patternStr: string): RegExp {
  let pattern: RegExp
  // 处理 锚点、模板中定义的变量
  const anchorPattern: RegExp = new RegExp(`\\[?\\*\\b${patternStr}\\b\\]?`)
  if (anchorPattern.test(transferString)) {
    pattern = new RegExp(`(.*)(&\\b${patternStr.replace('*', '')}\\b)`)
  } else {
    pattern = new RegExp(`^(.*)(\\b${patternStr}\\b:)`)
  }
  return pattern
}
