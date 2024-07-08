# Helm-Intellisense-X

VS Code 插件。基于 [Helm-Intellisense](https://github.com/tim-koehler/Helm-Intellisense) 修改，并移除了 `Lint command`。

## 功能

应该算是能用的功能

- 支持 glob 模式
- 语法高亮
- 代码片段
- 跳转到定义
  - HELM 命名模板
  - HELM 模板文件（.tpl）中定义的变量
  - `.Values`、`.Chart`、`$.Values`、`$.Chart` 引用的来自 YAML 中的变量
  - YAML 中的锚点
- 自动提示
  - .Values
  - .Chart
  - .Capabilities
  - .Release
  - .Template
  - 定义的变量
  - 命名模板
  - 锚点

## 设置

- `helm-intellisense-x.chartRootPath(default)`: Chart Root Path。可用值 `default`, `current`, `绝对路径(/path/to/chartRootPath)`
- `helm-intellisense-x.maxRecursionDepthOfRootPath(10)`: 以当前文件为基准，检索确定 chartRootPath 时，允许向前递归检索的目录层级。超过此值仍未找到，则使用 workspaceFolder 替换。当 chartRootPath = 'current' 时生效
- `helm-intellisense-x.values(["values.yaml"])`: 需要按序解析的 yaml 文件或目录。支持 glob 模式
- `helm-intellisense-x.valuesExclude(["node_modules/**"])`: 需要排除的 yaml 文件或目录
- `helm-intellisense-x.valuesReverse(false)`: 反转 values 定义的列表
- `helm-intellisense-x.templates(["**/*.tpl"])`: 需要加载的 templates 文件或目录
- `helm-intellisense-x.templatesExclude(["node_modules/**"])`: 需要排除的 templates 文件或目录
- `helm-intellisense-x.readFileMode(single)`: 解析文件时的读取模式。
  - `single`: 每个文件独立读取并处理
  - `all`: 一次性读取所有文件后再进行处理
- `helm-intellisense-x.variablesCurrentFile(true)`: 是否只在当前文件内全文检索变量。为 false 时会在 chartRootPath 范围内检索所有 .tpl 文件
- `helm-intellisense-x.variablesCurrentPosition(true)`: 是否从当前光标位置向上检索变量。为 false 时会检索至文件开始位置。当 `variables.currentFile = true` 时生效
- `helm-intellisense-x.parseVariablesOfCurrentNamedTemplate(true)`: 是否从当前光标位置向上检索命名模板，当遇到 *define* 时，立即停止。为 false 时会检索至文件开始位置
- `helm-intellisense-x.separators("")`: [功能未启用]分隔符，为空则使用全局定义。参考 'editor.separators'
- `helm-intellisense-x.separatorsExclude("")`: [功能未启用]需要排除的分隔符
