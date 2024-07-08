import * as vscode from 'vscode';

// 修改 editor.wordSeparators
// 改了之后不会自动恢复，需要手动操作。慎重操作
export async function removeSeparatorFromConfig() {
  // 读取当前的 editor.wordSeparators 配置
  const currentSeparators: string = vscode.workspace.getConfiguration('editor').get('wordSeparators', '')
  // 获取 helm-intellisense-x.separators helm-intellisense-x.separatorsExclude
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x')
  const customSeparators: string = config.get('separators', '')
  const customSeparatorsExclude: string = config.get('separatorsExclude', '')
  // 移除指定的分隔符
  let updatedSeparators: string = customSeparators || currentSeparators
  if (customSeparatorsExclude) {
    const separatorsToRemove = new Set(customSeparatorsExclude)
    updatedSeparators = updatedSeparators.split('').filter(char => !separatorsToRemove.has(char)).join('')
  }
  // 使用 editor 配置组更新 wordSeparators
  await vscode.workspace.getConfiguration('editor').update('wordSeparators', updatedSeparators, vscode.ConfigurationTarget.Global)
}
