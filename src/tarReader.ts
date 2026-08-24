import * as fs from 'fs';
import * as zlib from 'zlib';

// tar 文件读取结果。键为 tar 内的相对路径（如 "mychart/templates/_helpers.tpl"），值为文件内容
export type TarFileMap = Map<string, string>

// tar 头常量
const TAR_BLOCK_SIZE: number = 512
const TAR_NAME_OFFSET: number = 0
const TAR_NAME_SIZE: number = 100
const TAR_SIZE_OFFSET: number = 124
const TAR_SIZE_SIZE: number = 12
const TAR_TYPE_OFFSET: number = 156
const TAR_PREFIX_OFFSET: number = 345
const TAR_PREFIX_SIZE: number = 155

// 解析 tar header 中以 null 结尾的字符串字段
function readTarString(header: Buffer, offset: number, size: number): string {
  const slice: Buffer = header.subarray(offset, offset + size)
  // 查找第一个 null 字节
  let end: number = slice.length
  for (let i: number = 0; i < slice.length; i++) {
    if (slice[i] === 0) { end = i; break }
  }
  return slice.subarray(0, end).toString('utf8')
}

// 解析 USTAR 的 name + prefix，支持超过 100 字节的 chart 内路径
function readTarName(header: Buffer): string {
  const name: string = readTarString(header, TAR_NAME_OFFSET, TAR_NAME_SIZE)
  const prefix: string = readTarString(header, TAR_PREFIX_OFFSET, TAR_PREFIX_SIZE)
  return prefix.length > 0 ? `${prefix}/${name}` : name
}

// 解析 tar header 中的 size 字段（八进制 ASCII 字符串）
function readTarSize(header: Buffer): number {
  const slice: Buffer = header.subarray(TAR_SIZE_OFFSET, TAR_SIZE_OFFSET + TAR_SIZE_SIZE)
  const str: string = slice.toString('utf8').replace(/\0/g, '').trim()
  if (str.length === 0) { return 0 }
  const n: number = parseInt(str, 8)
  return Number.isFinite(n) ? n : 0
}

// 读取 tar header 中的 type flag
// '0' 或 '\0' = 普通文件，'5' = 目录，其他类型跳过
function readTarType(header: Buffer): string {
  return String.fromCharCode(header[TAR_TYPE_OFFSET])
}

// PAX 扩展头的记录格式为 "<byte-length> <key>=<value>\n"
function readPaxPath(content: Buffer): string | undefined {
  let offset: number = 0
  while (offset < content.length) {
    const spaceIndex: number = content.indexOf(0x20, offset)
    if (spaceIndex < 0) { break }
    const length: number = Number(content.subarray(offset, spaceIndex).toString('ascii'))
    if (!Number.isFinite(length) || length <= 0 || offset + length > content.length) { break }

    const record: string = content.subarray(spaceIndex + 1, offset + length).toString('utf8').replace(/\n$/, '')
    const separatorIndex: number = record.indexOf('=')
    if (separatorIndex > 0 && record.substring(0, separatorIndex) === 'path') {
      return record.substring(separatorIndex + 1)
    }
    offset += length
  }
  return undefined
}

// 从 tar 缓冲区解析所有文件条目
export function parseTar(buffer: Buffer): TarFileMap {
  const result: TarFileMap = new Map<string, string>()
  let offset: number = 0
  let pendingPath: string | undefined

  while (offset + TAR_BLOCK_SIZE <= buffer.length) {
    const header: Buffer = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)

    // 全 0 块表示 tar 结束
    if (header.every((b) => b === 0)) { break }

    const headerName: string = readTarName(header)
    const size: number = readTarSize(header)
    const type: string = readTarType(header)

    offset += TAR_BLOCK_SIZE
    if (offset + size > buffer.length) { break }
    const content: Buffer = buffer.subarray(offset, offset + size)

    // PAX 和 GNU longname 都用下一个 header 表示真实文件。
    // Helm 生成的包在长路径时可能使用这两种形式。
    if (type === 'x') {
      pendingPath = readPaxPath(content) ?? pendingPath
    } else if (type === 'L') {
      pendingPath = content.toString('utf8').replace(/\0.*$/s, '').replace(/\n$/, '')
    } else {
      // PAX/GNU 长路径只对紧随的一个条目生效（包括目录条目）
      if (type === '0' || type === '' || type === '\0') {
        const name: string = (pendingPath ?? headerName).replace(/^\.\//, '')
        if (name.length > 0) { result.set(name, content.toString('utf8')) }
      }
      pendingPath = undefined
    }
    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
  }

  return result
}

// 异步读取 .tgz / .tar.gz 文件并返回内部文件 map
// 解析失败时返回空 map，不抛出异常
export async function readTgzFile(tgzPath: string): Promise<TarFileMap> {
  if (!fs.existsSync(tgzPath)) { return new Map<string, string>() }

  return new Promise<TarFileMap>((resolve) => {
    fs.readFile(tgzPath, (err, data) => {
      if (err !== null && err !== undefined) { resolve(new Map<string, string>()); return }
      // 转成 Uint8Array 视图以匹配新版 @types/node 中 zlib 的 InputType
      const input: Uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      zlib.gunzip(input, (gzErr, decompressed) => {
        if (gzErr !== null && gzErr !== undefined) { resolve(new Map<string, string>()); return }
        try {
          resolve(parseTar(decompressed))
        } catch {
          resolve(new Map<string, string>())
        }
      })
    })
  })
}
