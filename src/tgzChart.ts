import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readTgzFile, TarFileMap } from './tarReader';
import { getListOfVariables, Variable } from './utils';
import { loadFromString, Yaml } from './yaml';

// VS Code 中的 tgz 协议方案；实际路径编码在 URI query 中
export const TGZ_SCHEME: string = 'tgz'

// tgz 内某个命中的位置
export type TgzLocation = {
  tgzPath: string,       // 磁盘上 tgz 文件的绝对路径
  innerPath: string,     // 在 tgz 内相对于 chart 根目录的文件路径（如 templates/_helpers.tpl）
  line: number,          // 文件内的行号
  column: number,        // 行内的列号
}

// chart 在 tgz 内对应的根目录信息
export type TgzChartInfo = {
  chartRoot: string,     // tgz 内的 chart 根目录名（如 mychart-1.0.0）
  entries: TarFileMap,   // tgz 内的所有文件
}

// 内存缓存。key 为 tgz 绝对路径
const tgzCache: Map<string, Promise<TgzChartInfo>> = new Map<string, Promise<TgzChartInfo>>()

// 清除缓存。配置变化或编辑器关闭时调用
export function clearTgzCache(): void {
  tgzCache.clear()
}

// 读取 tgz 并返回其中的 chart 信息。带缓存
export function getTgzChartInfo(tgzPath: string): Promise<TgzChartInfo> {
  const cached: Promise<TgzChartInfo> | undefined = tgzCache.get(tgzPath)
  if (cached !== undefined) { return cached }

  const promise: Promise<TgzChartInfo> = readTgzFile(tgzPath).then((entries) => {
    return { chartRoot: detectChartRoot(entries), entries }
  })
  tgzCache.set(tgzPath, promise)
  return promise
}

// 推断 tgz 内的 chart 根目录。
// tar 内的路径形式为 "<chart-name>-<version>/..."，根目录为第一段路径
function detectChartRoot(entries: TarFileMap): string {
  const chartYamlPaths: string[] = Array.from(entries.keys())
    .filter((entryPath) => entryPath === 'Chart.yaml' || entryPath.endsWith('/Chart.yaml'))
    .sort((a, b) => a.split('/').length - b.split('/').length)
  if (chartYamlPaths.length === 0) { return '' }

  const chartYamlPath: string = chartYamlPaths[0]
  const separatorIndex: number = chartYamlPath.lastIndexOf('/')
  return separatorIndex < 0 ? '' : chartYamlPath.substring(0, separatorIndex)
}

function toEntryKey(chartRoot: string, innerPath: string): string {
  const normalizedInnerPath: string = innerPath.replace(/^\.\//, '').replace(/^\//, '')
  return chartRoot.length > 0 ? `${chartRoot}/${normalizedInnerPath}` : normalizedInnerPath
}

// 在 tgz 内的指定文件中搜索。返回匹配项位置列表
function searchInTgzFile(content: string, searchRegex: RegExp, tgzPath: string, innerPath: string, startString?: string): TgzLocation[] {
  const result: TgzLocation[] = []
  const lines: string[] = content.split('\n')
  let startStringMatched: boolean = startString === undefined
  for (let i: number = 0; i < lines.length; i++) {
    const line: string = lines[i]
    if (!startStringMatched) {
      if (startString !== undefined && new RegExp(`^\\b${startString}\\b:`).test(line)) { startStringMatched = true }
      continue
    }
    const match: RegExpMatchArray | null = line.match(searchRegex)
    if (match !== null) {
      const column: number = match[1] ? match[1].length : (match.index ?? 0)
      result.push({ tgzPath, innerPath, line: i, column })
      if (startString !== undefined) { break }
    }
  }
  return result
}

// 枚举 tgz 内所有 templates/ 文件，包括嵌套的 dependency chart。
// Helm 允许在 .tpl/.yaml/.yml 等任意模板文件中声明 define。
function listTemplateFilesInTgz(entries: TarFileMap, chartRoot: string): string[] {
  const prefix: string = chartRoot ? `${chartRoot}/` : ''
  const result: string[] = []
  for (const key of entries.keys()) {
    if (!key.startsWith(prefix)) { continue }
    const relative: string = key.substring(prefix.length)
    if (relative.startsWith('templates/') || relative.includes('/templates/')) {
      result.push(relative)
    }
  }
  return result
}

// 解析 tgz 内的 Chart.yaml
export async function getTgzChartYaml(tgzPath: string): Promise<Yaml> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const chartFileKey: string = toEntryKey(info.chartRoot, 'Chart.yaml')
  const content: string | undefined = info.entries.get(chartFileKey)
  if (content === undefined) { return {} }
  return loadFromString(content, chartFileKey) ?? {}
}

// 解析 tgz 内的 values.yaml。fileNames 为相对 chart 根目录的路径列表
export async function getTgzValuesAsYaml(tgzPath: string, fileNames: string[]): Promise<Yaml> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  let merged: Yaml = {}
  for (const fileName of fileNames) {
    const entryKey: string = toEntryKey(info.chartRoot, fileName)
    const content: string | undefined = info.entries.get(entryKey)
    if (content === undefined) { continue }
    const parsed: Yaml | undefined = loadFromString(content, entryKey)
    if (parsed !== undefined) {
      const lodash = require('lodash')
      merged = lodash.merge(merged, parsed)
    }
  }
  return merged
}

// 在 tgz 内的所有模板文件中搜索命名模板定义
// 返回 templateName -> TgzLocation
export async function getTgzNamedTemplates(tgzPath: string): Promise<Map<string, TgzLocation>> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const result: Map<string, TgzLocation> = new Map<string, TgzLocation>()
  const tplFiles: string[] = listTemplateFilesInTgz(info.entries, info.chartRoot)
  const defineRegex: RegExp = /{{-?\s*define\s+"([^"]+)"\s*-?}}/g

  for (const innerPath of tplFiles) {
    const fullKey: string = toEntryKey(info.chartRoot, innerPath)
    const content: string | undefined = info.entries.get(fullKey)
    if (content === undefined) { continue }
    // 找出文件中所有的 define
    const matches: RegExpMatchArray[] = [...content.matchAll(defineRegex)]
    for (const match of matches) {
      const templateName: string = match[1]
      const matchIndex: number = match.index ?? 0
      const line: number = content.substring(0, matchIndex).split('\n').length - 1
      const lineStart: number = content.lastIndexOf('\n', matchIndex - 1) + 1
      const column: number = matchIndex - lineStart
      result.set(templateName, { tgzPath, innerPath, line, column })
    }
  }
  return result
}

// 在 tgz 内的所有模板文件中搜索变量定义
// 返回 key -> { variable, location }
export async function getTgzVariables(tgzPath: string): Promise<Map<string, { variable: Variable, location: TgzLocation }>> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const result: Map<string, { variable: Variable, location: TgzLocation }> = new Map<string, { variable: Variable, location: TgzLocation }>()
  const tplFiles: string[] = listTemplateFilesInTgz(info.entries, info.chartRoot)

  for (const innerPath of tplFiles) {
    const fullKey: string = toEntryKey(info.chartRoot, innerPath)
    const content: string | undefined = info.entries.get(fullKey)
    if (content === undefined) { continue }
    const variables: Variable[] = getListOfVariables(content)
    for (const variable of variables) {
      // 找到该变量在文件中的具体位置
      const variablePattern: RegExp = new RegExp(`{{-?\\s*\\$${variable.key}\\s*:=`)
      const match: RegExpExecArray | null = variablePattern.exec(content)
      if (match === null) { continue }
      const matchIndex: number = match.index
      const line: number = content.substring(0, matchIndex).split('\n').length - 1
      const lineStart: number = content.lastIndexOf('\n', matchIndex - 1) + 1
      const column: number = matchIndex - lineStart
      result.set(variable.key, { variable, location: { tgzPath, innerPath, line, column } })
    }
  }
  return result
}

// 在 tgz 内的 yaml 文件中查找与 searchRegex 匹配的行
// fileNames: 相对 chart 根目录的 yaml 文件路径列表
// valuesMappingInfoKey: 可选，传入时会从该键所在行之后开始搜索
export async function findInTgzYaml(tgzPath: string, fileNames: string[], searchRegex: RegExp, valuesMappingInfoKey?: string): Promise<TgzLocation[]> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const result: TgzLocation[] = []
  for (const fileName of fileNames) {
    const entryKey: string = toEntryKey(info.chartRoot, fileName)
    const content: string | undefined = info.entries.get(entryKey)
    if (content === undefined) { continue }
    const matches: TgzLocation[] = searchInTgzFile(content, searchRegex, tgzPath, fileName, valuesMappingInfoKey)
    result.push(...matches)
  }
  return result
}

// 在 tgz 内的所有模板文件中搜索 define "<name>"
// templateName 为 include/template 引用的完整名称
export async function findTplNameInTgz(tgzPath: string, templateName: string): Promise<TgzLocation[]> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const result: TgzLocation[] = []
  const tplFiles: string[] = listTemplateFilesInTgz(info.entries, info.chartRoot)
  const escapedTemplateName: string = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const searchPattern: RegExp = new RegExp(`{{-?\\s*define\\s+"${escapedTemplateName}"\\s*-?}}`)
  for (const innerPath of tplFiles) {
    const fullKey: string = toEntryKey(info.chartRoot, innerPath)
    const content: string | undefined = info.entries.get(fullKey)
    if (content === undefined) { continue }
    result.push(...searchInTgzFile(content, searchPattern, tgzPath, innerPath))
  }
  return result
}

// 在 tgz 内的所有模板文件中搜索 $variable := value
// searchRegex 用于匹配变量定义行
export async function findVariableInTgz(tgzPath: string, searchRegex: RegExp): Promise<TgzLocation[]> {
  const info: TgzChartInfo = await getTgzChartInfo(tgzPath)
  const result: TgzLocation[] = []
  const tplFiles: string[] = listTemplateFilesInTgz(info.entries, info.chartRoot)
  for (const innerPath of tplFiles) {
    const fullKey: string = toEntryKey(info.chartRoot, innerPath)
    const content: string | undefined = info.entries.get(fullKey)
    if (content === undefined) { continue }
    result.push(...searchInTgzFile(content, searchRegex, tgzPath, innerPath))
  }
  return result
}

// 获取 chartBasePath 下 charts/ 目录中的所有 tgz 文件
export function getTgzFiles(chartBasePath: string): string[] {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
  // helm-intellisense-x.chartsIncludeTgz: false 时直接跳过
  if (!config.get('chartsIncludeTgz', true)) { return [] }

  const chartsDir: string = path.join(chartBasePath, 'charts')
  if (!fs.existsSync(chartsDir)) { return [] }

  return fs.readdirSync(chartsDir)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => path.join(chartsDir, name))
    .filter((fullPath) => {
      try { return fs.statSync(fullPath).isFile() } catch { return false }
    })
}

// 将 TgzLocation 转为 vscode.Location，URI 使用 tgz: 协议
export function tgzLocationToVsLocation(loc: TgzLocation): vscode.Location {
  const archive: string = Buffer.from(loc.tgzPath, 'utf8').toString('base64url')
  const entry: string = Buffer.from(loc.innerPath, 'utf8').toString('base64url')
  const displayPath: string = `/${path.basename(loc.tgzPath)}/${loc.innerPath}`
  const uri: vscode.Uri = vscode.Uri.from({
    scheme: TGZ_SCHEME,
    path: displayPath,
    query: `archive=${archive}&entry=${entry}`
  })
  return new vscode.Location(uri, new vscode.Position(loc.line, loc.column))
}

// 解析 tgz 虚拟文档 URI。路径使用 base64url 传递，避免空格、#、%、!和 Windows 盘符破坏 URI。
export function parseTgzUri(uri: vscode.Uri): { tgzPath: string, innerPath: string } | undefined {
  const parameters: Map<string, string> = new Map<string, string>()
  for (const parameter of uri.query.split('&')) {
    const separatorIndex: number = parameter.indexOf('=')
    if (separatorIndex > 0) {
      parameters.set(parameter.substring(0, separatorIndex), parameter.substring(separatorIndex + 1))
    }
  }

  const archive: string | undefined = parameters.get('archive')
  const entry: string | undefined = parameters.get('entry')
  if (archive === undefined || entry === undefined) { return undefined }
  try {
    return {
      tgzPath: Buffer.from(archive, 'base64url').toString('utf8'),
      innerPath: Buffer.from(entry, 'base64url').toString('utf8')
    }
  } catch {
    return undefined
  }
}

// 批量转换
export function tgzLocationsToVsLocations(locs: TgzLocation[]): vscode.Location[] {
  return locs.map(tgzLocationToVsLocation)
}
