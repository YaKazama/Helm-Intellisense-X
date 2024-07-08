import * as vscode from 'vscode';
import { JumpToNamedTemplatesDefinitionProvider } from "./DefinitionProvider/helm/JumpToNamedTemplates";
import { JumpToVariablesDefinitionProvider } from "./DefinitionProvider/helm/JumpToVariables";
import { JumpToValuesDefinitionProvider } from "./DefinitionProvider/yaml/JumpToValues";
import { CapabilitiesCompletionItemProvider } from "./CompletionProviders/helm/Capabilities";
import { ChartCompletionItemProvider } from "./CompletionProviders/helm/Chart";
import { FilesCompletionItemProvider } from "./CompletionProviders/helm/Files";
import { NamedTemplatesCompletionItemProvider } from "./CompletionProviders/helm/NamedTemplates";
import { ReleaseCompletionItemProvider } from "./CompletionProviders/helm/Release";
import { TemplateCompletionItemProvider } from "./CompletionProviders/helm/Template";
import { VariablesCompletionItemProvider } from "./CompletionProviders/helm/Variables";
import { AnchorCompletionItemProvider } from "./CompletionProviders/yaml/Anchors";
import { ValuesCompletionItemProvider } from "./CompletionProviders/yaml/Values";

export function activate(context: vscode.ExtensionContext) {
  const helmLanguageActive: string[] = ['yaml', 'helm-template']

  vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToNamedTemplatesDefinitionProvider())
  vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToVariablesDefinitionProvider())
  vscode.languages.registerDefinitionProvider(helmLanguageActive, new JumpToValuesDefinitionProvider())

  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new CapabilitiesCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ChartCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new FilesCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new NamedTemplatesCompletionItemProvider(), '"')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ReleaseCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new TemplateCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new VariablesCompletionItemProvider(), '.')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new AnchorCompletionItemProvider(), '*')
  vscode.languages.registerCompletionItemProvider(helmLanguageActive, new ValuesCompletionItemProvider(), '.')
}

export function deactivate() {}
