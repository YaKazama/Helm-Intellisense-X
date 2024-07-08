import * as yaml from 'js-yaml';
import * as fs from 'fs';
import lodash from 'lodash';

export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml }

// 加载 yaml 文件内容
export function load(filename:string): Yaml | undefined {
  if (!fs.existsSync(filename)) { return undefined }
  const content = fs.readFileSync(filename, {encoding: 'utf8'})
  return yaml.load(content, {filename}) as Yaml
}

// 批量加载 yaml 文件内容，递归合并内容。
// 参考：https://www.lodashjs.com/docs/lodash.merge#_mergeobject-sources
export function loadMerge(filenames: string[]): Yaml {
  let mergedValues = {}
  for (const filename of filenames) {
    const values = load(filename)
    if (values !== undefined) {
      mergedValues = lodash.merge(mergedValues, values)
    }
  }
  return mergedValues
}
