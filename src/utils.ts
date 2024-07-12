import * as vscode from 'vscode';
import * as yaml from './yaml';
import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

// yaml 文件解析
export function getValuesFromFile(fileName: string, workspaceFolder?: string | undefined): yaml.Yaml | undefined {
  const chartBasePath: string | undefined = getChartBasePath(fileName, workspaceFolder)
  if (chartBasePath === undefined) { return undefined }

  // 是否反转 helm-intellisense-x.values 列表中的文件
  const reverse: boolean | undefined = vscode.workspace.getConfiguration('helm-intellisense-x').get('valuesReverse', false)
  let filenames: string[] = getValueFileNamesFromConfig(chartBasePath)
  if (reverse) { filenames = filenames.reverse() }

  return yaml.loadMerge(filenames)
}

// 获取 chart 所需要的 basePath
// helm-intellisense-x.chartRootPath = 'default' 使用 vscode 的 workspaceFolder
// helm-intellisense-x.chartRootPath = 'current' 使用当前文件所在的目录
// helm-intellisense-x.chartRootPath = '/path/to/folder' 绝对路径，直接使用
export function getChartBasePath(fileName: string, workspaceFolder?: string | undefined): string | undefined {
  const chartBasePath: string | undefined = vscode.workspace.getConfiguration('helm-intellisense-x').get('chartRootPath', 'default')
  if (chartBasePath === undefined) { return undefined }

  let basePath: string | undefined = workspaceFolder
  if (['default', 'current'].includes(chartBasePath)) {
    if (chartBasePath === 'current') { basePath = getChartBasePathFromFile(fileName, workspaceFolder) }
  } else {
    if (chartBasePath.startsWith('/')) { basePath = chartBasePath }
    return undefined
  }

  return basePath
}

// 通过文件路径获取 basePath
export function getChartBasePathFromFile(fileName: string, workspaceFolder?: string | undefined): string | undefined {
  if (!fs.statSync(fileName).isFile()) { return undefined }
  if (workspaceFolder === undefined) { return undefined }

  // helm-intellisense-x.maxRecursionDepthOfRootPath basePath 父路径的最大递归深度。当 helm-intellisense-x.chartRootPath = 'current' 时生效。默认 10
  const maxRecursionDepthOfRootPath: number = vscode.workspace.getConfiguration('helm-intellisense-x').get('maxRecursionDepthOfRootPath', 10)

  const pattern: RegExp = /[/\\]+(templates|charts)$/g
  let basePath: string = path.dirname(fileName)

  let i: number = 0
  while (i < maxRecursionDepthOfRootPath || pattern.test(basePath)) {
    if (workspaceFolder !== undefined && basePath === workspaceFolder) { break }
    basePath = path.dirname(basePath)
    i++
  }

  return basePath
}

export function getChartFileFromConfig(chartBasePath: string): string[] {
  const chartFile: string = path.join(chartBasePath, 'Chart.yaml')
  if (fs.existsSync(chartFile)) { return [chartFile] }
  return []
}

export function parseGlobFiles(chartBasePath: string, fileNames: string[], excludeFiles: string[]): string[] {
  let globFiles: string[] = []
  for (const filename of fileNames) {
    if (!filename.startsWith('/')) {
      globFiles.push(path.join(chartBasePath, filename))
    } else {
      globFiles.push(filename)
    }
  }
  return globSync(globFiles, { ignore: excludeFiles, absolute: true })
}

// 获取需要加载的 yaml 文件。支持 * 号通配符，使用 glob 模块解析
export function getValueFileNamesFromConfig(chartBasePath: string, coverFiles?: string[] | undefined): string[] {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
  // helm-intellisense.values 按顺解析的 yaml 文件。注意：valuse.yaml 应该放在第一个位置。默认 ['values.yaml']
  let valuesFiles: string[] = config.get('values', ['values.yaml'])
  // helm-intellisense.valuesExclude 需要排除的 yaml 文件或目录。默认 ['node_modules/**']
  const excludeFiles: string[] = config.get('valuesExclude', ['node_modules/**'])

  return parseGlobFiles(chartBasePath, valuesFiles, excludeFiles)
}

// 获取需要加载的 tpl 文件。支持 * 号通配符，使用 glob 模块解析
export function getTemplatesFileFromConfig(chartBasePath: string): string[] {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
  // helm-intellisense.templates.external 。默认 ['**/*.tpl']
  const tplFiles: string[] = config.get('templates', ['**/*.tpl'])
  // helm-intellisense-x.templatesExclude 需要从 templates/ 下排除的文件或目录。默认 ['node_modules/**']
  const excludeTplFiles: string[] = config.get('templatesExclude', ['node_modules/**'])

  return parseGlobFiles(chartBasePath, tplFiles, excludeTplFiles)
}

// 从 *.tpl 文件中解析命名模板（define）和变量定义（$variable := value）。过滤变量定义时，忽略 "$_ := <operator>" 格式
// parseVariables = false 返回 string[]
// parseVariables = true 返回 Variable[]
export function getAllNamedTemplatesAndVariablesFromFiles(fileName: string, workspaceFolder: string | undefined, parseVariables: boolean = false): string[] | Variable[] {
  // 确定 chart 所使用的父目录 basePath
  const chartBasePath: string | undefined = getChartBasePath(fileName, workspaceFolder)
  if (chartBasePath === undefined) { return [] }

  const tplFiles: string[] = getTemplatesFileFromConfig(chartBasePath)

  // 读取文件时使用的模式。可用值 single（默认值，一次读取一个文件）, all（一次性读取所有文件）
  // TODO：分块读取，需要用到异步函数，但是这个地方是同步函数，不知道怎么处理。
  const readFileMode: string = vscode.workspace.getConfiguration('helm-intellisense-x').get('readFileMode', 'single')
  // 使用块读取模式时，每个块的大小。可能会引发行中断问题
  // const maxChunk: number = vscode.workspace.getConfiguration('helm-intellisense-x').get('maxChunkOfReadFile', 64 * 1024)

  let cleanData: any[] = []

  if (readFileMode === 'single') {
    for (const filename of tplFiles) {
      if (!fs.existsSync(filename)) { continue }
      try {
        const content: string = fs.readFileSync(filename, 'utf8')
        if (parseVariables) { cleanData.push(...getListOfVariables(content)) }
        cleanData.push(...getListOfNamedTemplates(content))
      } catch (e) {
        vscode.window.showErrorMessage(`Error in '${filename}': ${(e as Error).message}`)
      }
    }
  } else {
    let content: string = ''
    for (const filename of tplFiles) {
      if (!fs.existsSync(filename)) { continue }
      try {
        content += fs.readFileSync(filename, 'utf8') + '\n\n'
      } catch (e) {
        vscode.window.showErrorMessage(`Error in '${filename}': ${(e as Error).message}`)
      }
    }
    if (parseVariables) { cleanData.push(...getListOfVariables(content)) }
    cleanData.push(...getListOfNamedTemplates(content))
  }
  return cleanData
}

// 过滤命名模板
function getListOfNamedTemplates(content: string): string[] {
  const matchRanges: any[] = []

  const templatePattern: RegExp = /{{-?\s*define +"(.+?)"\s*-?}}/g
  let result
  while ((result = templatePattern.exec(content)) !== null) {
    matchRanges.push(result[1])
  }
  return matchRanges
}

export type Variable = { key: string, value: any }

// 过滤变量定义。忽略 "$_ := <operator>" 格式
export function getListOfVariables(content: string): Variable[] {
  const matchRanges: Variable[] = []

  const variablePattern: RegExp = /{{-?\s*\$(?<key>(?!_\s*:=)[a-zA-Z0-9_]+?)\s*:=\s*(?<value>.+?)\s*-?}}/g
  let result
  while ((result = variablePattern.exec(content)) !== null) {
    if (result.groups === undefined) { continue }
    matchRanges.push({ key: result.groups.key, value: result.groups.value.trim() })
  }
  return matchRanges
}

// 检查光标是否在大括号内
export function isInsideBrackets(currentLine: string, position: number): boolean {
  const prefix: string = currentLine.substring(0, position)
  return isBracketsInPrefix(prefix)
}

// 检查光前前后字符是否有大括号
function isBracketsInPrefix(prefix: string): boolean {
  let prevChar: string = ''
  for (let idx: number = prefix.length - 1; idx >= 0; idx--) {
    if (prefix.charAt(idx) === '}') { return false }
    if (prefix.charAt(idx) === '{' && prevChar === '{') { return true }
    prevChar = prefix.charAt(idx)
  }
  return false
}

// 光标位置的字符/单词。空格分隔
export function getWordAt(str: string, pos: number): string {
  const left: number = str.slice(0, pos + 1).search(/\S+$/)
  return str.slice(left, pos + 1)
}

type WordAtRange = {
  str: string,
  pos: number,
  sep?: string,
  startSep?: string,
  endSep?: string,
  rtStartSep?: boolean,
  rtEndSep?: boolean
}
export function getWordAtRange(options: WordAtRange): string {
  // 默认值
  const sep: string = options.sep || ' '
  const startSep: string = options.startSep || sep
  const endSep: string = options.endSep || sep
  const rtStartSep: boolean = options.rtStartSep || false
  const rtEndSep: boolean = options.rtEndSep || false
  // 查找光标前的最近的分隔符位置
  let start: number = Math.max(0, options.str.lastIndexOf(startSep, options.pos - 1) + 1)
  if (rtStartSep) { start = start - 1 }
  // 查找光标后的最近的分隔符位置
  let end: number = options.str.indexOf(endSep, options.pos)
  if (end === -1) { end = options.str.length }
  if (rtEndSep) { end = end + 1 }
  // 截取分隔符之间的文本
  return options.str.substring(start, end)
}

// 获取光标位置前的双引号位置信息
// 其他方法：string.indexOf('include "') + 9 但是这种方法，不能处理 include 嵌套问题，所以还是拆分处理
export function getWordAtPrev(line: string, pos: number, str: string = ' '): number {
  for (let idx: number = pos - 1; idx >= 0; idx--) {
    if (line.charAt(idx) === str) {
      return idx
    }
  }
  return 0
}

// 获取光标位置后的双引号位置信息
export function getWordAtNext(line: string, pos: number, str: string = ' '): number {
  for (let idx: number = pos + 1; idx < line.length; idx++) {
    if (line.charAt(pos) === str) {
      return idx
    }
  }
  return 0
}

// 好像会破坏原有的分词下划线，不推荐使用。使用 getWordAtRange
export function getTransferRange(content: string, lineNumber: number, wordStart: number, wordEnd: number, str: string = ' ') {
  const s: number = getWordAtPrev(content, wordStart, str) + 1
  const e: number = getWordAtNext(content, wordEnd, str) - 1
  return new vscode.Range(lineNumber, s, lineNumber, e)
}

export type valuesMappingInfo = {
  key: string,
  path: string[]
}

export type valuesMapping = {
  [keyword: string]: valuesMappingInfo
}
