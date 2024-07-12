# Helm-Intellisense-X

VS Code 插件。基于 [Helm-Intellisense](https://github.com/tim-koehler/Helm-Intellisense) 修改。

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

## Commands

- 无法处理复杂情况
- 更改了部分不影响整体逻辑的处理逻辑
  - 注释处理由原来的分词处理改为按行处理
- 只处理有 `.Values` 的行，以下情况会跳过处理
  - 遇到 if...else、range、with 关键字时
  - 不包括 `.Values` 的行
  - 类似这种情况的行 `pluck "lifecycle" . $.Context $.Values`

`Helm-Intellisense-x: Lint File`: 解析当前活动文档并验证所有路径（如 .Values.foo.bar）是否指向有效值
`Helm-Intellisense-x: Lint Chart`: 与 `Lint File` 相同，但是针对整个 templates/ 目录下所有的 `.yaml` 和 `.yml` 文件

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
- `helm-intellisense-x.variablesCurrentPosition(true)`: 是否从当前光标位置向上检索变量。为 false 时会检索至文件开始位置。当 `variablesCurrentFile = true` 时生效
- `helm-intellisense-x.valuesCurrentFile(true)`: 是否只在当前文件内全文检索变量。为 false 时会在 chartRootPath 范围内检索所有 .yaml 文件
- `helm-intellisense-x.valuesCurrentPosition(true)`: 是否从当前光标位置向上检索变量。为 false 时会检索至文件开始位置。当 `valuesCurrentFile = true` 时生效
- `helm-intellisense-x.valuesMappingEnable(false)`: 是否开启 yaml 文件的“键映射：跳转到定义”功能
- `helm-intellisense-x.valuesMapping({})`: yaml 文件键映射跳转到定义配置。查看 [注意事项：关于-YAML-键映射：跳转到定义配置](#yaml-values-mapping-jumpto) 中的内容
- `helm-intellisense-x.parseVariablesOfCurrentNamedTemplate(true)`: 是否从当前光标位置向上检索命名模板，当遇到 *define* 时，立即停止。为 false 时会检索至文件开始位置
- `helm-intellisense-x.separators("")`: [功能未启用]分隔符，为空则使用全局定义。参考 'editor.separators'
- `helm-intellisense-x.separatorsExclude("")`: [功能未启用]需要排除的分隔符

## 注意事项

- 默认不绑定 `.yaml` 文件，有需要时建议配合“设置”中的 `files.associations` 来修改特定路径下的 YAML 文件的语言模式

  > 这里强烈推荐使用 **绝对路径**，下面的这种使用方式，很容易造成所有的 yaml 文件都被改变语言模式

  ```json
  "files.associations": {
    "**/templates/**/*.{yaml,yml}": "helm-template"
  }
  ```

  也可以使用快捷键 `Cmd+k m` 或点击界面右下角相应的位置来临时修改

- 未知类型的文件，如果第一行能匹配到正则表达式：`^(#\\s+\\bhelm(-template)\\b|{{-?.*)$`，则会被识别为 `Helm` 类型的文件，以下是完整的 `languages` 设置

  ```json
  "languages": [
    {
      "id": "helm-template",
      "aliases": [
        "Helm",
        "Helm Template",
        "helm",
        "helm-template"
      ],
      "extensions": [
        ""
      ],
      "firstLine": "^(#\\s+\\bhelm(-template)?\\b|{{-?.*)$",
      "filenamePatterns": [
        "**/templates/**/*.tpl"
      ],
      "configuration": "./language-configuration.json"
    }
  ]
  ```

- <span id="yaml-values-mapping-jumpto">关于 YAML 的“键映射：跳转到定义”配置</span>

  可以使用键映射，将 YAML 中的第一级键（没有缩进的键，一般为 Map）映射一个别名，在 HELM 模板中使用该别名对其下的子项取值，使用此功能，请确保 `helm-intellisense-x.valuesMappingEnable = true`。

  > 以下例子中，将 `values.yaml` 中的 `example` 映射到 `Context` 中

  - `helm-intellisense-x.valuesMapping` 配置格式
    - `key`: 需要映射（别名）的键
    - `path`: 检索时的文件范围，会在列出的文件中查询，为空时使用 `helm-intellisense-x.values`

    ```json
    {
      "helm-intellisense-x.valuesMappingEnable": true,
      "helm-intellisense-x.valuesMapping": {
        "Context": {
          "key": "example",
          "path": [
            "values.yaml"
          ]
        }
      }
    }
    ```

  - `values.yaml` 配置

    ```yaml
    name: "helm"
    example:
      enable: false
    ```

  - `templates/example.yaml` 使用

    > `.Values.example` 中的 `example` 和 `.Context.enable` 中的 `enable` 可以跳转到 `values.yaml` 中定义的位置

    ```yaml
    {{- $_ := set . "Context" .Values.example }}

    {{- if .Context.enable }}
      {{- include "workloads.Deployment" . }}
    {{- end }}
    ```

## 已知问题

- 在 yaml 文件中使用 helm 模板配置时，由于文件类型是 yaml，如果使用了 [YAML 插件](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml&ssr=false#overview)，会造成 `.Values.xxx`、`.Chart.xxx` 无法跳转。如下所示，`.Values.ABC` 中的 `ABC` 无法跳转

  ```yaml
  {{- $_ := set . "Context" .Values.ABC }}

  {{- if .Context.enable }}
    {{- include "workloads.Deployment" . }}
  {{- end }}
  ```

  **原因：**

  [YAML 插件](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml&ssr=false#overview) 改变了 [wordPattern](https://github.com/redhat-developer/vscode-yaml/blob/main/language-configuration.json#L37)，致使英文句号（.）不会作为分隔符

  **解决方案**

  将文件类型（语言模式）从 `YAML` 切换为 `Helm` 即可
