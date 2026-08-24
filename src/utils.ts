import * as vscode from 'vscode';
import * as yaml from './yaml';
import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

// yaml 文件解析
export function getValuesFromFile(fileName: string, workspaceFolder?: string | undefined): yaml.Yaml | undefined {
  const chartBasePath: string | undefined = getChartBasePath(fileName, workspaceFolder)
  if (chartBasePath === undefined) { return undefined }

  return yaml.loadMerge(getValueFileNamesWithLocalDependencies(chartBasePath))
}

// 获取 chart 所需要的 basePath
// helm-intellisense-x.chartRootPath = 'default' 优先使用包含 Chart.yaml 的 workspaceFolder；否则从当前文件向上查找 Chart.yaml
// helm-intellisense-x.chartRootPath = 'current' 使用当前文件所在的目录
// helm-intellisense-x.chartRootPath = '/path/to/folder' 绝对路径，直接使用
export function getChartBasePath(fileName: string, workspaceFolder?: string | undefined): string | undefined {
  const chartBasePath: string | undefined = vscode.workspace.getConfiguration('helm-intellisense-x').get('chartRootPath', 'default')
  if (chartBasePath === undefined) { return undefined }

  let basePath: string | undefined = workspaceFolder
  if (['default', 'current'].includes(chartBasePath)) {
    const workspaceIsChart: boolean = workspaceFolder !== undefined && fs.existsSync(path.join(workspaceFolder, 'Chart.yaml'))
    if (chartBasePath === 'current' || !workspaceIsChart) {
      basePath = getChartBasePathFromFile(fileName, workspaceFolder)
    }
  } else {
    return path.isAbsolute(chartBasePath) ? chartBasePath : undefined
  }

  return basePath
}

// 通过文件路径获取 basePath
export function getChartBasePathFromFile(fileName: string, workspaceFolder?: string | undefined): string | undefined {
  if (!fs.existsSync(fileName) || !fs.statSync(fileName).isFile()) { return undefined }

  // helm-intellisense-x.maxRecursionDepthOfRootPath basePath 父路径的最大递归深度。当 helm-intellisense-x.chartRootPath = 'current' 时生效。默认 10
  const maxRecursionDepthOfRootPath: number = vscode.workspace.getConfiguration('helm-intellisense-x').get('maxRecursionDepthOfRootPath', 10)

  let basePath: string = path.dirname(fileName)

  for (let depth: number = 0; depth <= maxRecursionDepthOfRootPath; depth++) {
    if (fs.existsSync(path.join(basePath, 'Chart.yaml'))) { return basePath }
    if (workspaceFolder !== undefined && basePath === workspaceFolder) { break }
    const parentPath: string = path.dirname(basePath)
    if (parentPath === basePath) { break }
    basePath = parentPath
  }
  return workspaceFolder
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
  // coverFiles 覆盖
  if (coverFiles !== undefined && coverFiles.length > 0) { valuesFiles = coverFiles }
  // helm-intellisense.valuesExclude 需要排除的 yaml 文件或目录。默认 ['node_modules/**']
  const excludeFiles: string[] = config.get('valuesExclude', ['node_modules/**'])

  return parseGlobFiles(chartBasePath, valuesFiles, excludeFiles)
}

// 获取需要加载的 tpl 文件。支持 * 号通配符，使用 glob 模块解析
export function getTemplatesFileFromConfig(chartBasePath: string, coverFiles?: string[] | undefined): string[] {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
  // helm-intellisense.templates.external 。默认 ['**/*.tpl']
  let tplFiles: string[] = config.get('templates', ['**/*.tpl'])
  // coverFiles 覆盖
  if (coverFiles !== undefined && coverFiles.length > 0) { tplFiles = coverFiles }
  // helm-intellisense-x.templatesExclude 需要从 templates/ 下排除的文件或目录。默认 ['node_modules/**']
  const excludeTplFiles: string[] = config.get('templatesExclude', ['node_modules/**'])

  return parseGlobFiles(chartBasePath, tplFiles, excludeTplFiles)
}

// 获取 templates/ 下可用于声明命名模板的全部普通文件。
// Helm 不根据扩展名决定模板文件，define 可以出现在 .tpl/.yaml/.txt 或其他任意文件中。
export function getNamedTemplateFiles(chartBasePath: string): string[] {
  const excludeFiles: string[] = vscode.workspace.getConfiguration('helm-intellisense-x').get('templatesExclude', ['node_modules/**'])
  const files: Set<string> = new Set<string>(getTemplatesFileFromConfig(chartBasePath))
  const filesInTemplatesDirectory: string[] = globSync('templates/**/*', {
    cwd: chartBasePath,
    ignore: excludeFiles,
    absolute: true,
    nodir: true,
    dot: true
  })
  for (const templateFile of filesInTemplatesDirectory) { files.add(templateFile) }
  return Array.from(files).filter((templateFile) => {
    try { return fs.statSync(templateFile).isFile() } catch { return false }
  })
}

type ChartDependency = {
  repository?: unknown
}

// 递归获取 Chart.yaml 中 repository: file://... 指向的本地依赖 chart。
// 仅返回包含 Chart.yaml 的目录，并用 realpath 防止循环依赖和重复扫描。
export function getLocalDependencyChartPaths(chartBasePath: string): string[] {
  const result: string[] = []
  const visited: Set<string> = new Set<string>()

  const visit = (currentChartPath: string): void => {
    let realChartPath: string
    try {
      realChartPath = fs.realpathSync(currentChartPath)
    } catch {
      return
    }
    if (visited.has(realChartPath)) { return }
    visited.add(realChartPath)

    const chartYamlPath: string = path.join(realChartPath, 'Chart.yaml')
    let chartYaml: yaml.Yaml | undefined
    try {
      chartYaml = yaml.load(chartYamlPath)
    } catch {
      return
    }
    if (typeof chartYaml !== 'object' || chartYaml === null || Array.isArray(chartYaml)) { return }

    const dependencies: unknown = chartYaml.dependencies
    if (!Array.isArray(dependencies)) { return }
    for (const dependency of dependencies as ChartDependency[]) {
      const repository: unknown = dependency?.repository
      if (typeof repository !== 'string' || !repository.startsWith('file://')) { continue }

      let repositoryPath: string = repository.substring('file://'.length)
      try { repositoryPath = decodeURIComponent(repositoryPath) } catch { continue }
      const dependencyPath: string = path.isAbsolute(repositoryPath)
        ? path.normalize(repositoryPath)
        : path.resolve(realChartPath, repositoryPath)
      if (!fs.existsSync(path.join(dependencyPath, 'Chart.yaml'))) { continue }

      let realDependencyPath: string
      try {
        realDependencyPath = fs.realpathSync(dependencyPath)
      } catch {
        continue
      }
      if (!visited.has(realDependencyPath)) {
        result.push(realDependencyPath)
        visit(realDependencyPath)
      }
    }
  }

  visit(chartBasePath)
  return result
}

// 获取当前 chart 及其全部 file:// 递归依赖。当前 chart 始终位于首位。
export function getChartPathsWithLocalDependencies(chartBasePath: string): string[] {
  return [chartBasePath, ...getLocalDependencyChartPaths(chartBasePath)]
}

// 获取当前 chart 及 file:// 依赖的 Chart.yaml 文件。
export function getChartFilesWithLocalDependencies(chartBasePath: string): string[] {
  const files: Set<string> = new Set<string>()
  for (const chartPath of getChartPathsWithLocalDependencies(chartBasePath)) {
    for (const chartFile of getChartFileFromConfig(chartPath)) { files.add(chartFile) }
  }
  return Array.from(files)
}

// 获取当前 chart 及 file:// 依赖的 values 文件。
// 依赖先于父 chart，确保合并时父 chart 的值具有更高优先级。
export function getValueFileNamesWithLocalDependencies(chartBasePath: string, coverFiles?: string[] | undefined): string[] {
  const files: Set<string> = new Set<string>()
  const chartPaths: string[] = getChartPathsWithLocalDependencies(chartBasePath).reverse()
  const reverse: boolean = vscode.workspace.getConfiguration('helm-intellisense-x').get('valuesReverse', false)
  for (const chartPath of chartPaths) {
    const valuesFiles: string[] = getValueFileNamesFromConfig(chartPath, coverFiles)
    if (reverse) { valuesFiles.reverse() }
    for (const valuesFile of valuesFiles) { files.add(valuesFile) }
  }
  return Array.from(files)
}

// 获取当前 chart 和 file:// 本地依赖中配置的模板定义文件。
export function getTemplateFilesWithLocalDependencies(chartBasePath: string, coverFiles?: string[] | undefined): string[] {
  const chartPaths: string[] = getChartPathsWithLocalDependencies(chartBasePath)
  const files: Set<string> = new Set<string>()
  for (const chartPath of chartPaths) {
    for (const templateFile of getTemplatesFileFromConfig(chartPath, coverFiles)) {
      files.add(templateFile)
    }
  }
  return Array.from(files)
}

// 获取 charts/<dependency>/ 下以目录形式解压的直接依赖 chart。
function getUnpackedDependencyChartPaths(chartBasePath: string): string[] {
  const chartFiles: string[] = globSync('charts/*/Chart.yaml', {
    cwd: chartBasePath,
    absolute: true,
    nodir: true,
    dot: true
  })
  const result: string[] = []
  const visited: Set<string> = new Set<string>()
  for (const chartFile of chartFiles) {
    try {
      const chartPath: string = fs.realpathSync(path.dirname(chartFile))
      if (!visited.has(chartPath)) {
        visited.add(chartPath)
        result.push(chartPath)
      }
    } catch {
      continue
    }
  }
  return result
}

// 获取命名模板扫描覆盖的全部 chart：当前 chart、file:// 依赖和 charts/ 下已解压的依赖。
// 使用 realpath 去重，同时递归处理已解压依赖自身的 file:// 和 charts/ 依赖。
function getNamedTemplateChartPaths(chartBasePath: string): string[] {
  const result: string[] = []
  const pending: string[] = [chartBasePath]
  const visited: Set<string> = new Set<string>()
  while (pending.length > 0) {
    const currentChartPath: string | undefined = pending.shift()
    if (currentChartPath === undefined) { continue }

    let realChartPath: string
    try {
      realChartPath = fs.realpathSync(currentChartPath)
    } catch {
      continue
    }
    if (visited.has(realChartPath)) { continue }
    visited.add(realChartPath)
    result.push(realChartPath)

    pending.push(...getLocalDependencyChartPaths(realChartPath))
    pending.push(...getUnpackedDependencyChartPaths(realChartPath))
  }
  return result
}

// 获取当前 chart、file:// 递归依赖和已解压依赖中 templates/ 下的全部普通文件，仅用于命名模板定义扫描。
export function getNamedTemplateFilesWithLocalDependencies(chartBasePath: string): string[] {
  const files: Set<string> = new Set<string>()
  for (const chartPath of getNamedTemplateChartPaths(chartBasePath)) {
    for (const templateFile of getNamedTemplateFiles(chartPath)) { files.add(templateFile) }
  }
  return Array.from(files)
}

// 收集命名模板及其定义文件，供补全列表展示来源。
export function getNamedTemplatesWithSources(chartBasePath: string): Map<string, string[]> {
  const result: Map<string, string[]> = new Map<string, string[]>()
  for (const templateFile of getNamedTemplateFilesWithLocalDependencies(chartBasePath)) {
    try {
      const content: string = fs.readFileSync(templateFile, 'utf8')
      for (const templateName of getListOfNamedTemplates(content)) {
        const sources: string[] = result.get(templateName) ?? []
        if (!sources.includes(templateFile)) { sources.push(templateFile) }
        result.set(templateName, sources)
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Error in '${templateFile}': ${(e as Error).message}`)
    }
  }
  return result
}

// 从 *.tpl 文件中解析命名模板（define）和变量定义（$variable := value）。过滤变量定义时，忽略 "$_ := <operator>" 格式
// parseVariables = false 返回 string[]
// parseVariables = true 返回 Variable[]
export function getAllNamedTemplatesAndVariablesFromFiles(fileName: string, workspaceFolder: string | undefined, parseVariables: boolean = false): string[] | Variable[] {
  // 确定 chart 所使用的父目录 basePath
  const chartBasePath: string | undefined = getChartBasePath(fileName, workspaceFolder)
  if (chartBasePath === undefined) { return [] }

  const tplFiles: string[] = parseVariables
    ? getTemplateFilesWithLocalDependencies(chartBasePath)
    : getNamedTemplateFilesWithLocalDependencies(chartBasePath)

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
        if (parseVariables) {
          cleanData.push(...getListOfVariables(content))
        } else {
          cleanData.push(...getListOfNamedTemplates(content))
        }
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
    if (parseVariables) {
      cleanData.push(...getListOfVariables(content))
    } else {
      cleanData.push(...getListOfNamedTemplates(content))
    }
  }
  return cleanData
}

// 过滤命名模板
export function getListOfNamedTemplates(content: string): string[] {
  const matchRanges: any[] = []

  const templatePattern: RegExp = /{{-?\s*define\s+"(.+?)"\s*-?}}/g
  let result
  while ((result = templatePattern.exec(content)) !== null) {
    matchRanges.push(result[1])
    // templatePattern.lastIndex = 0
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
    matchRanges.push({ key: result.groups.key.trim(), value: result.groups.value.trim() })
    // variablePattern.lastIndex = 0
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
  // key: string,
  // path: string[]
  [key: string]: string[]
}

export type valuesMapping = {
  [keyword: string]: valuesMappingInfo
}

export function getRegExpPattern(transferString: string, patternStr: string): RegExp {
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

// 判断数组中的任何一个子字符串是否存在于主字符串中
export function stringContainsAny(mainStr: string, subStrings: string[]): boolean {
    // 使用some()方法检查是否有至少一个子字符串被包含
    return subStrings.some(subStr => mainStr.includes(subStr));
}
