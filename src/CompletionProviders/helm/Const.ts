import * as vscode from 'vscode';
import * as utils from '../../utils';
import * as fs from 'fs';
import { isEmpty } from 'lodash';
import * as yaml from 'js-yaml'; // 需要安装: npm install js-yaml @types/js-yaml

export class ConstCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('helm-intellisense-x');
    const envFiles: string[] = config.get('envFiles', []);
    const envJumpPrefixes: string[] = config.get('envJumpPrefixes', []);

    // 当前行
    const currentLine: string = document.lineAt(position).text;
    // 不在大括号，不处理
    if (!utils.isInsideBrackets(currentLine, position.character)) {
      return undefined;
    }

    // 获取当前输入的完整字符串（包含可能的前缀）
    let currentString: string = utils.getWordAt(currentLine, position.character - 1);
    // 提取有效的前缀关键字（如 $__const 或 $__var）
    const matchedPrefix = envJumpPrefixes.find(prefix => currentString.startsWith(prefix));

    if (envFiles.length > 0 && matchedPrefix) {
      // 从当前字符串中移除前缀关键字，保留后续部分（如从 $__const.parent.child. 得到 .parent.child.）
      const trimmedString = currentString.slice(matchedPrefix.length);

      // 只有当剩余部分包含点号且以点号结尾时才触发提示
      if (!trimmedString.includes('.') || !trimmedString.endsWith('.')) {
        return undefined;
      }

      // 清洗前缀，用于过滤（如从 .parent.child. 得到 parent.child）
      const filterPrefix = trimmedString.startsWith('.')
        ? trimmedString.slice(1, -1)  // 移除首尾的点号
        : trimmedString.slice(0, -1);

      // 分割前缀为层级数组（如 "parent.child" → ["parent", "child"]）
      const prefixLevels = filterPrefix.split('.').filter(level => !isEmpty(level));

      const workspaceFolder: string | undefined = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path;
      const chartBasePath: string | undefined = utils.getChartBasePath(document.fileName, workspaceFolder);
      const _envFiles: string[] = utils.getTemplatesFileFromConfig(chartBasePath!, envFiles);

      // 存储解析后的变量，支持嵌套结构
      const variables: utils.Variable[] = [];

      for (const filename of _envFiles) {
        if (!fs.existsSync(filename)) {
          continue;
        }

        try {
          const content: string = fs.readFileSync(filename, 'utf8');

          // 从 Helm 模板中提取 YAML 内容
          const yamlContent = this.extractYamlContent(content);
          if (yamlContent) {
             // 使用 js-yaml 解析提取出的 YAML
             const parsedData = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA }); // 使用 JSON_SCHEMA 更安全
             if (parsedData && typeof parsedData === 'object') {
               this.extractVariables(parsedData, variables, '');
             }
          }
        } catch (e) {
          vscode.window.showErrorMessage(`Error parsing '${filename}': ${(e as Error).message}`);
        }
      }

      // 去重并根据当前层级过滤
      const uniqueVariables = this.removeDuplicates(variables);
      const filteredVariables = this.filterVariablesByLevels(uniqueVariables, prefixLevels);
      const completionItems = filteredVariables.map(variable =>
        this.toCompletionItem(variable, prefixLevels)
      );

      return completionItems;
    }

    return undefined;
  }

  /**
   * 从 Helm 模板内容中提取 YAML 部分
   * @param content Helm 模板文件的完整内容
   * @returns 提取出的纯 YAML 内容，如果没有找到则返回 null
   */
  private extractYamlContent(content: string): string | null {
    // 正则表达式匹配 {{- define "..." -}} ... {{- end }} 结构
    // 考虑可能的空格和换行
    const definePattern = /{{-?\s*define\s+"[^"]+"\s*-?}}\s*\n?([\s\S]*?)\s*{{-?\s*end\s*-?}}/;
    const match = content.match(definePattern);

    if (match && match[1]) {
      // 返回匹配到的中间部分（YAML 内容）
      // 移除可能存在的前后空白
      return match[1].trim();
    }

    // 如果没有找到标准的 define 结构，尝试其他方式，比如查找整个文件内容（如果文件本身就是 YAML）
    // 这里可以扩展更多逻辑，但目前基于您的示例，主要处理 define 情况
    return null; // 或者返回 content，但这可能不安全
  }


  /**
   * 递归提取变量
   * @param obj 要解析的对象
   * @param variables 存储结果的数组
   * @param prefix 当前的键前缀
   */
  private extractVariables(obj: any, variables: utils.Variable[], prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 是对象，添加其键名（作为父键）并递归解析其内容
        variables.push({ key: fullKey, value: '' }); // 父键值设为空字符串
        this.extractVariables(value, variables, fullKey);
      } else {
        // 是基本类型或数组，直接添加键值对
        variables.push({ key: fullKey, value: String(value) });
      }
    }
  }

  /**
   * 动态根据层级数组过滤变量（核心改进）
   * @param variables 所有变量
   * @param prefixLevels 前缀层级数组（如 []、["parent"]、["parent", "child"]）
   */
  private filterVariablesByLevels(variables: utils.Variable[], prefixLevels: string[]): utils.Variable[] {
    const targetLevel = prefixLevels.length + 1; // 目标层级 = 当前层级 + 1

    return variables.filter(variable => {
      const variableLevels = variable.key.split('.');

      // 变量层级必须正好是目标层级
      if (variableLevels.length !== targetLevel) {
        return false;
      }

      // 所有前缀层级必须完全匹配
      for (let i = 0; i < prefixLevels.length; i++) {
        if (variableLevels[i] !== prefixLevels[i]) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 生成补全项
   */
  private toCompletionItem(variable: utils.Variable, prefixLevels: string[]): vscode.CompletionItem {
    const variableLevels = variable.key.split('.');
    // 只显示当前层级的键名（最后一级）
    const label = variableLevels[variableLevels.length - 1];

    const completionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);
    completionItem.detail = variable.value ? `值: ${variable.value}` : '包含子项';
    completionItem.insertText = label;

    return completionItem;
  }

  // 其他方法保持不变
  private removeDuplicates(variables: utils.Variable[]): utils.Variable[] {
    const seen = new Set<string>();
    return variables.filter(variable => {
      if (seen.has(variable.key)) {
        return false;
      }
      seen.add(variable.key);
      return true;
    });
  }
}
