import * as vscode from 'vscode';
import { type Yaml } from '../yaml';
import * as utils from '../utils';

export enum ElementType {
  KEY_PATH,
  TEMPLATE
}

export type Element = {
  name: string;
  line: number;
  range: vscode.Range;
  type: ElementType;
};

// 解析当前活动文档并验证所有路径是否指向有效值。示例：
//  .Values.foo.bar
//  $.Values.foo.bar
export function LintCommand(collection: vscode.DiagnosticCollection, document: vscode.TextDocument | undefined = vscode.window.activeTextEditor?.document): boolean {
  if (document === undefined) { return false }

  const lintExcludeFiles: string[] = vscode.workspace.getConfiguration('helm-intellisense-x').get('lintExcludeFiles', []);
  if (!Array.isArray(lintExcludeFiles)) { return false }

  const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
  const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
  if (chartBasePath === undefined) { return false }
  // 移除列表中，默认会将当前文件排除
  const excludeFiles: string[] = utils.parseGlobFiles(chartBasePath, lintExcludeFiles, ['node_modules/**', document.fileName])
  if (excludeFiles.length < 1) { return false }
  // 不在 templates/ 目录下的文件，不处理
  if (!document.fileName.replace(`${chartBasePath}`, '').includes('templates')) { return false }
  // 解析 values.yaml 取错误之处
  const keyElements: Element[] = getAllKeyPathElementsOfDocument(document)
  const values: Yaml | undefined = utils.getValuesFromFile(document.fileName)
  const errorKeyPathElements: Element[] = getInvalidKeyPaths(keyElements, values, document)
  // 解析 include 引用的命名模板 取错误之处
  const usedTplElements: Element[] = getAllUsedNamedTemplateElementsOfDocument(document)
  const definedTpls: any[] = utils.getAllNamedTemplatesAndVariablesFromFiles(document.fileName, workspaceFolder)
  const errorTplElements: Element[] = getInvalidTpls(usedTplElements, definedTpls)
  // 收集错误之处，生成错误信息并返回
  const allErrorElementsCombined = errorKeyPathElements.concat(errorTplElements)
  markErrors(allErrorElementsCombined, document, collection)
  return allErrorElementsCombined.length > 0
}

export function getAllKeyPathElementsOfDocument(document: vscode.TextDocument): Element[] {
  const lines: string[] = document.getText().split('\n')

  const elementArray = new Array<Element>()
  let crossLineComment: boolean = false
  for (let lineIndex: number = 0; lineIndex < lines.length; lineIndex++) {
    const line: string = lines[lineIndex]
    // 注释行，直接跳过
    if (line.includes('/*')) {
      crossLineComment = true
      continue
    }
    if (line.includes('*/')) {
      crossLineComment = false
      continue
    }
    if (crossLineComment) { continue }
    // 不包含 .Values 的行，直接跳过
    //  这种情况，跳过 {{- $__lifecycleSrc := pluck "lifecycle" . $.Context $.Values }}
    if (!line.includes('.Values')) {
      continue
    } else {
      if (line.includes('pluck')) { continue }
    }
    // if ... else, range, with 直接跳过
    const regexBrackets = /\{\{-?( ?(else )?if |range|with).*?\}\}/g
    if (regexBrackets.exec(line) !== null) { continue }

    const words: string[] = line.split(' ')
    for (let word of words) {
      if (!word.includes('.Values')) { continue }
      word = word.replace('{{', '').replace('}}', '').replace('(', '').replace(')', '').replace('$', '')
      elementArray.push({
        line: lineIndex,
        name: word,
        range: new vscode.Range(new vscode.Position(lineIndex, line.indexOf(word)), new vscode.Position(lineIndex, line.indexOf(word) + word.length)),
        type: ElementType.KEY_PATH,
      })
    }
  }
  return elementArray
}

export function getAllUsedNamedTemplateElementsOfDocument(doc: vscode.TextDocument): Element[] {
  const lines: string[] = doc.getText().split('\n')

  const elementArray = new Array<Element>()
  for (let lineIndex: number = 0; lineIndex < lines.length; lineIndex++) {
    const line: string = lines[lineIndex]
    const regex = /\{\{-? *(template|include) +"(.+?)".*?\}\}/g
    const result: RegExpExecArray | null = regex.exec(line)
    if (result === null) { continue }
    elementArray.push({
      line: lineIndex,
      name: result[2],
      range: new vscode.Range(new vscode.Position(lineIndex, line.indexOf(result[2])), new vscode.Position(lineIndex, line.indexOf(result[2]) + result[2].length)),
      type: ElementType.TEMPLATE,
    })
  }
  return elementArray
}

export function getInvalidKeyPaths(elements: Element[], values: any, doc: vscode.TextDocument): Element[] {
  const errorElements = new Array<Element>()
  elements.forEach(element => {
    const parts = element.name.split('.')
    parts.shift() // Remove empty
    parts.shift() // Remove '.Values'

    let current = values
    for (const part of parts) {
      current = current[part]
      if (current === undefined) {
        if (isDefaultDefined(element.line, doc)) { break }
        errorElements.push(element)
      }
    }
  });
  return errorElements
}

export function getInvalidTpls(elements: Element[], definedTpls: string[]): Element[] {
  const errorElements = new Array<Element>();
  elements.forEach(element => {
    if (!definedTpls.includes(element.name)) {
      errorElements.push(element)
    }
  })
  return errorElements
}

export function isDefaultDefined(lineNumber: number, doc: vscode.TextDocument): boolean {
  const line = doc.getText(new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber + 1, 0)));
  return line.includes('| default');
}

export function clearErrors(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  collection.set(document.uri, []);
}

export function markErrors(elements: Element[], document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  collection.set(document.uri, createDiagnosticsArray(elements, document.uri))
}

function createDiagnosticsArray(elements: Element[], uri: vscode.Uri): vscode.Diagnostic[] {
  const diagnostics = new Array<vscode.Diagnostic>()
  elements.forEach(element => {
    let message = ''
    switch (element.type) {
      case ElementType.KEY_PATH:
        message = 'Value not defined'
        break
      case ElementType.TEMPLATE:
        message = 'Template not defined'
        break
      default:
        break
    }

    diagnostics.push({
      code: '',
      message: message,
      range: element.range,
      severity: vscode.DiagnosticSeverity.Error,
      source: 'Helm-Intellisense',
      relatedInformation: [new vscode.DiagnosticRelatedInformation(new vscode.Location(uri, element.range), element.name)]
    })
  })
  return diagnostics
}
