import * as vscode from "vscode";
import * as utils from "../../utils";
import { findStringInFiles } from '../findStringInFiles';
import * as tgzChart from '../../tgzChart';

// 跳转到 yaml 变量定义。同时支持 charts/*.tgz 内的 values.yaml
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

          const pattern: RegExp = new RegExp(`{{.*set.*"\\b([\\w-]+)\\b"\\s*\\.Values.*}}`)
          const match = currentLine.match(pattern)
          // 逻辑统一，让 {{- $_ := set . "Context" .Values.XXX }} 也使用 valuesMapping 定义的 yaml 列表
          if (match && valuesMappingKeys.includes(match[1])) {
            valuesMappingKey = match[1]
          }
        }
      }
      if (valuesMappingKey) {
        pattern = new RegExp(`^(\\$?\\.(Chart|Values|${valuesMappingKey})|[\\w-]+)(\\.[\\w-]+)*|(?:<<:\\s*)?\\[?\\*\\b[\\w-]+\\b\\]?`)
      }
    }
    if (!pattern.test(transferString)) { return undefined }

    if (parseValuesOfCurrentFile) {
      let endLine: vscode.Position = position
      // 注意这个地方是取反，表示检索整个文件
      if (!parseValuesOfCurrentPosition) {
        const lastLineNumber = document.lineCount - 1
        const lastLine = document.lineAt(lastLineNumber)
        endLine = new vscode.Position(lastLineNumber, lastLine.text.length)
      }
      // 正序检索
      // 定义正则
      const matchPattern: RegExp = utils.getRegExpPattern(transferString, currentString)
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
        const o: utils.valuesMappingInfo = valuesMapping[valuesMappingKey] // valuesMapping['Context'] => 'key': ['values.yaml']

        // 1. 从当前位置向上找 valuesMappingKey 找到第一个匹配值则停止
        const prevContent: number = document.getText(
          new vscode.Range(0, 0, position.line, 0)
        ).lastIndexOf(valuesMappingKey)
        let prevStartLine: vscode.Position = document.positionAt(prevContent)
        // 2. 过滤当前位置之前的内容中是否有 {{- $_ := set . "Context" .Values.XXX }}
        const pattern: RegExp = new RegExp(`{{.*set.*"\\b${valuesMappingKey}\\b"\\s*\\.Values\\.([\\w-]+)\\s*}}`)
        const match = document.lineAt(prevStartLine).text.match(pattern)
        // 3. 取值 XXX
        //  没有定义可用列表时，也使用 []
        let coverFiles: string[] = []
        if (match && match[1]) {
          valuesMappingInfoKey = match[1]
          if (Object.keys(o).includes(valuesMappingInfoKey)) {
            coverFiles = o[valuesMappingInfoKey]
          } else {
            valuesMappingInfoKey = ""
          }
        } else { // 3.1. 未能取到值 XXX，取文件所在的父目录名
          const pathList: string[] = document.uri.path.split('/')
          valuesMappingInfoKey = pathList[pathList.length - 2]
          if (Object.keys(o).includes(valuesMappingInfoKey)) {
            coverFiles = o[valuesMappingInfoKey]
          } else {
            // coverFiles 没有定义或为空，重置 valuesMappingInfoKey = 当前按下 cmd 命令时所获取的值
            valuesMappingInfoKey = ""
          }
        }
        // 4. 解析有哪些 yaml 可用
        // coverFiles 如果为空，则会使用 helm-intellisense-x.values 定义的文件
        valuesFiles = utils.getValueFileNamesFromConfig(chartBasePath, coverFiles)
      } else {
        // 默认：从 chartBasePath 下找 helm-intellisense-x.values 定义的文件
        valuesFiles = utils.getValueFileNamesFromConfig(chartBasePath)
      }

      const matchPattern: RegExp = utils.getRegExpPattern(transferString, currentString)

      // 1. 在 yaml 文件中搜索
      const locations: vscode.Location[] = await findStringInFiles(valuesFiles, matchPattern, valuesMappingInfoKey)

      // 2. 在 charts/*.tgz 中搜索 values.yaml
      // tgz 内的 yaml 文件名基于配置中的值（如 values.yaml、values.schema.json 等）
      const tgzFiles: string[] = tgzChart.getTgzFiles(chartBasePath)
      if (tgzFiles.length > 0) {
        // 从 valuesFiles 提取文件名（basename）作为 tgz 内查找的候选
        const yamlBaseNames: string[] = Array.from(new Set(valuesFiles.map((f) => {
          // 取最后一个非通配符段作为基准文件名
          const parts: string[] = f.split('/')
          return parts[parts.length - 1] || f
        })))
        for (const tgzPath of tgzFiles) {
          const matches: tgzChart.TgzLocation[] = await tgzChart.findInTgzYaml(tgzPath, yamlBaseNames, matchPattern, valuesMappingInfoKey)
          locations.push(...tgzChart.tgzLocationsToVsLocations(matches))
        }
      }

      return locations.length > 0 ? locations : undefined
    }
  }
}
