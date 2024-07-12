import * as vscode from 'vscode';
import * as utils from '../utils';
import * as fs from 'fs';
import * as path from 'path';
import { LintCommand } from './LintCommand';

// 解析当前活动文档并验证所有路径是否指向有效值
// 功能与 LintCommand 相同。但是解析的是 Chart 中 templates/ 目录下所有的 .yaml 和 .yml 文件
export async function LintChartCommand(collection: vscode.DiagnosticCollection): Promise<void> {
  const document: vscode.TextDocument | undefined = vscode.window.activeTextEditor?.document
  if (document === undefined) { return }

  const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path
  const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder)
  if (chartBasePath === undefined) { return }

  const templatesFolder: string = path.join(chartBasePath, 'templates')
  const templates: string[] = walkDirectory(templatesFolder)
  let hasErrors: boolean = false
  for (const template of templates) {
    await vscode.workspace.openTextDocument(template).then(template => {
      if (LintCommand(collection, template)) { hasErrors = true }
    })
  }
  if (hasErrors) { return }
  vscode.window.showInformationMessage(`No errors found in '${templatesFolder}' :)`);
}

// 遍历 templates/ 目录
function walkDirectory(dir: string): string[] {
  let results: string[] = []
  const list = fs.readdirSync(dir)
  list.forEach(function (file) {
    file = path.join(dir, file)
    const stat: fs.Stats = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      /* Recurse into a subdirectory */
      results = results.concat(walkDirectory(file))
    } else {
      /* Is a file */
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        results.push(file)
      }
    }
  })
  return results
}
