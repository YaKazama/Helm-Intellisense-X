import * as vscode from 'vscode';
import { JumpToNamedTemplatesDefinitionProvider } from "./DefinitionProviders/helm/JumpToNamedTemplates";
import { JumpToVariablesDefinitionProvider } from "./DefinitionProviders/helm/JumpToVariables";
import { JumpToConstDefineProvider } from "./DefinitionProviders/helm/JumpToConst";
import { JumpToValuesDefinitionProvider } from "./DefinitionProviders/yaml/JumpToValues";
import { CapabilitiesCompletionItemProvider } from "./CompletionProviders/helm/Capabilities";
import { ChartCompletionItemProvider } from "./CompletionProviders/helm/Chart";
import { FilesCompletionItemProvider } from "./CompletionProviders/helm/Files";
import { NamedTemplatesCompletionItemProvider } from "./CompletionProviders/helm/NamedTemplates";
import { ReleaseCompletionItemProvider } from "./CompletionProviders/helm/Release";
import { TemplateCompletionItemProvider } from "./CompletionProviders/helm/Template";
import { VariablesCompletionItemProvider } from "./CompletionProviders/helm/Variables";
import { ConstCompletionItemProvider } from "./CompletionProviders/helm/Const";
import { AnchorCompletionItemProvider } from "./CompletionProviders/yaml/Anchors";
import { ValuesCompletionItemProvider } from "./CompletionProviders/yaml/Values";
import { LintCommand } from "./Commands/LintCommand";
import { LintChartCommand } from "./Commands/LintChartCommand";
import { registerTgzContentProvider } from "./tgzContentProvider";
import { clearTgzCache } from "./tgzChart";

const LINT_CMD: string = 'helm-intellisense-x.Lint'
const LINT_CHART_CMD: string = 'helm-intellisense-x.LintChart'
export function activate(context: vscode.ExtensionContext) {
  const helmLanguageActive: string[] = ['yaml', 'helm-template']

  // 注册 tgz 协议方案的文本内容提供器，使跳转到 charts/*.tgz 内的文件时可正常显示内容
  registerTgzContentProvider(context)

  // 配置变化时清除 tgz 缓存，确保重新解析
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('helm-intellisense-x.chartsIncludeTgz')) {
        clearTgzCache()
      }
    })
  )

  const collection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('Helm-Intellisense')
  const lintCommand: vscode.Disposable = vscode.commands.registerCommand(LINT_CMD, () => LintCommand(collection))
  const lintChartCommand: vscode.Disposable = vscode.commands.registerCommand(LINT_CHART_CMD, () => LintChartCommand(collection))
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToNamedTemplatesDefinitionProvider()),
    vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToVariablesDefinitionProvider()),
    vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToValuesDefinitionProvider()),
    vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToConstDefineProvider()),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new CapabilitiesCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ChartCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new FilesCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new NamedTemplatesCompletionItemProvider(), '"'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ReleaseCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new TemplateCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new VariablesCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new AnchorCompletionItemProvider(), '*'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ValuesCompletionItemProvider(), '.'),
    vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ConstCompletionItemProvider(), '.'),
    collection,
    lintCommand,
    lintChartCommand
  )
}

export function deactivate() {
  clearTgzCache()
}
