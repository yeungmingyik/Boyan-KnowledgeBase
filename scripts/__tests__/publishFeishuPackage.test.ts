import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { FeishuReader } from '../collectFeishuDocuments'
import { publishFeishuPackage } from '../publishFeishuPackage'

describe('Feishu publication', () => {
  let directory: string
  let ids: string[]
  let revision: number
  let failing: boolean
  let emptied: Set<string>
  const wiki = 'https://example.feishu.cn/wiki/root'
  const node = (id: string) => ({
    node_token: id,
    obj_token: `doc${id}`,
    obj_type: 'docx',
    space_id: '123',
    title: id,
    has_child: false
  })
  const read: FeishuReader = async <T>(args: string[]): Promise<T> => {
    if (failing) throw new Error('Feishu unavailable')
    if (args[1] === '+node-get') return node('root') as T
    if (args[1] === '+node-list') return { nodes: ids.map(node), has_more: false, page_token: '' } as T
    return {
      document: {
        document_id: args[3],
        revision_id: revision,
        content: emptied.has(args[3]) ? `# ${args[3]}` : `# ${args[3]}\n\n正文版本 ${revision}`
      }
    } as T
  }
  const publish = (acceptRemovalsFrom?: string) =>
    publishFeishuPackage(
      {
        wiki,
        output: path.join(directory, 'knowledge.json'),
        name: '博研知识库',
        acceptRemovalsFrom
      },
      read
    )

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'feishu-publish-'))
    ids = ['root', 'two', 'three', 'four', 'five']
    revision = 1
    failing = false
    emptied = new Set()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reports additions, edits and deletions without rewriting an unchanged package', async () => {
    expect(await publish()).toMatchObject({ added: 5, changed: 0, removed: 0, unchanged: false })
    const output = path.join(directory, 'knowledge.json')
    const before = await stat(output)
    expect(await publish()).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: true })
    expect((await stat(output)).mtimeMs).toBe(before.mtimeMs)
    ids = ['root', 'two', 'three', 'four', 'six']
    revision = 2
    expect(await publish()).toMatchObject({ added: 1, changed: 4, removed: 1, unchanged: false })
  })

  it('preserves the last successful bytes on read failure and releases its lock for retry', async () => {
    await publish()
    const output = path.join(directory, 'knowledge.json')
    const before = await readFile(output, 'utf8')
    failing = true
    await expect(publish()).rejects.toThrow('Feishu unavailable')
    expect(await readFile(output, 'utf8')).toBe(before)
    failing = false
    expect(await publish()).toMatchObject({ unchanged: true })
  })

  it('blocks large removals until a one-shot override matches the previous version', async () => {
    const first = await publish()
    const output = path.join(directory, 'knowledge.json')
    const before = await readFile(output, 'utf8')
    ids = ['root']
    await expect(publish()).rejects.toThrow('Publication blocked: 4 removed')
    await expect(publish('wrong')).rejects.toThrow('Publication blocked')
    expect(await readFile(output, 'utf8')).toBe(before)
    expect(await publish(first.packId)).toMatchObject({ removed: 4, bodies: 1 })
  })

  it('does not replace a locked output or remove another publisher lock', async () => {
    await publish()
    const output = path.join(directory, 'knowledge.json')
    const before = await readFile(output, 'utf8')
    await writeFile(`${output}.lock`, 'another publisher')
    await expect(publish()).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(output, 'utf8')).toBe(before)
    expect(await readFile(`${output}.lock`, 'utf8')).toBe('another publisher')
  })

  it('refuses to overwrite a corrupted previous package', async () => {
    await publish()
    const output = path.join(directory, 'knowledge.json')
    const pack = JSON.parse(await readFile(output, 'utf8'))
    pack.documents[0].content += ' tampered'
    await writeFile(output, JSON.stringify(pack))
    await expect(publish()).rejects.toThrow('checksum mismatch')
  })

  it('treats cleared bodies as destructive changes and retains the published package', async () => {
    await publish()
    const output = path.join(directory, 'knowledge.json')
    const before = await readFile(output, 'utf8')
    emptied = new Set(['doctwo', 'docthree'])
    await expect(publish()).rejects.toThrow('Publication blocked: 0 removed, 2 emptied')
    expect(await readFile(output, 'utf8')).toBe(before)
  })

  it('rejects an incomplete space listing that omits its entry node', async () => {
    await publish()
    const output = path.join(directory, 'knowledge.json')
    const before = await readFile(output, 'utf8')
    ids = ['two', 'three', 'four', 'five']
    await expect(publish()).rejects.toThrow('Entry node missing')
    expect(await readFile(output, 'utf8')).toBe(before)
  })
})
