import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from "readline";

async function* asyncEntries<T>(iterable: AsyncIterable<T>): AsyncIterable<[number, T]> {
  let index: number = 0
  for await (const value of iterable) {
    yield [index++, value]
  }
}

async function* readLinesAsync(filePath: string): AsyncIterableIterator<string> {
  const stream: fs.ReadStream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl: readline.Interface = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    yield line
  }
}

function isString(value: any): value is string {
  return typeof value === 'string';
}

function isRegExp(value: any): value is RegExp {
  return value instanceof RegExp;
}

export async function findStringInFiles(fileNames: string[], searchRegexOrString: string | RegExp, offSetPosition: number = 0, concurrencyLimit = 5): Promise<vscode.Location[]> {
  const results: vscode.Location[] = []
  let running: number = 0

  async function processFile() {
    while (fileNames.length > 0 && running < concurrencyLimit) {
      const fileName: string | undefined = fileNames.shift()
      if (fileName === undefined) { return undefined }

      let searchRegex: RegExp
      if (isRegExp(searchRegexOrString)) {
        searchRegex = searchRegexOrString;
      } else {
        searchRegex = new RegExp(searchRegexOrString)
      }

      running++

      try {
        let totalChars: number = 0
        for await (const [lineIndex, line] of asyncEntries(readLinesAsync(fileName))) {
          // const index: number = line.indexOf(searchString)
          // if (index !== -1) {
          //   const pos = new vscode.Position(lineIndex, index + searchString.length - offSetPosition)
          //   const location = new vscode.Location(vscode.Uri.file(fileName), pos)
          //   results.push(location)
          // }
          const match: RegExpMatchArray | null = line.match(searchRegex)
          if (match) {
            const c: number = match[1] ? match[1].length : match.index!
            const pos = new vscode.Position(lineIndex, c)
            const location = new vscode.Location(vscode.Uri.file(fileName), pos)
            results.push(location)
          }
          totalChars += line.length + 1
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error reading file ${fileName}: ${error}`)
      } finally {
        running--
      }
    }
  }

  while (fileNames.length > 0 || running > 0) {
    await processFile()
  }
  return results
}
