import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { verifyFeishuEnvelope } from '../../src/main/utils/feishuRelease'
import type { FeishuReader } from '../collectFeishuDocuments'
import { type PublisherConfig, publishKnowledge } from '../knowledge-publisher/publisher'

describe('portable knowledge publisher', () => {
  let directory: string
  let revision: number
  let failing: boolean
  let config: PublisherConfig
  const read: FeishuReader = async <T>(args: string[]): Promise<T> => {
    if (failing) throw new Error('Access denied')
    const node = {
      node_token: 'root',
      obj_token: 'doc1',
      obj_type: 'docx',
      space_id: '123',
      title: 'Document',
      has_child: false
    }
    if (args[1] === '+node-get') return node as T
    if (args[1] === '+node-list') return { nodes: [node], has_more: false } as T
    return {
      document: { document_id: 'doc1', revision_id: revision, content: `# Document\n\nVersion ${revision}` }
    } as T
  }
  const options = (user: string) => ({
    config,
    privateKeyPath: path.join(directory, 'private.pem'),
    releaseDirectory: path.join(directory, 'shared'),
    workingDirectory: path.join(directory, user),
    read
  })
  const latest = () => readFile(path.join(directory, 'shared/latest.json'))

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'portable-publisher-'))
    revision = 1
    failing = false
    const keys = generateKeyPairSync('ed25519')
    await writeFile(path.join(directory, 'private.pem'), keys.privateKey.export({ type: 'pkcs8', format: 'pem' }))
    config = {
      schemaVersion: 1,
      wiki: 'https://example.feishu.cn/wiki/root',
      name: 'Knowledge',
      spaceId: '123',
      includeLinkedDocuments: false,
      distributionId: 'test',
      keyId: 'test',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      minAppVersion: '2.0.14',
      manifestUrl: ''
    }
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('continues signed history when a colleague publishes from a different local working directory', async () => {
    expect(await publishKnowledge(options('alice'))).toMatchObject({ sequence: 1, mode: 'generated', bodies: 1 })
    const initial = await latest()
    expect(await publishKnowledge(options('bob'))).toMatchObject({ sequence: 1, unchanged: true })
    expect(await latest()).toEqual(initial)
    await writeFile(path.join(directory, 'invalid.pem'), 'invalid')
    await expect(
      publishKnowledge({ ...options('bob'), privateKeyPath: path.join(directory, 'invalid.pem') })
    ).rejects.toThrow('发布密钥无效')
    expect(await latest()).toEqual(initial)
    revision = 2
    expect(await publishKnowledge(options('bob'))).toMatchObject({ sequence: 2, changed: 1 })
    const release = verifyFeishuEnvelope(await latest(), { test: config.publicKey }).release
    expect(release.sequence).toBe(2)
    expect(await readdir(path.join(directory, 'alice'))).toEqual([])
    expect(await readdir(path.join(directory, 'bob'))).toEqual([])
    const published = await readdir(path.join(directory, 'shared'))
    expect(published).toHaveLength(3)
    expect(published.every((name) => name === 'latest.json' || /^[a-f0-9]{64}\.json$/.test(name))).toBe(true)
  })

  it('preserves the current release on missing Feishu access, foreign keys, and concurrent publication', async () => {
    await publishKnowledge(options('alice'))
    const initial = await latest()
    failing = true
    await expect(publishKnowledge(options('bob'))).rejects.toThrow('Access denied')
    failing = false
    const wrong = generateKeyPairSync('ed25519')
    await writeFile(path.join(directory, 'wrong.pem'), wrong.privateKey.export({ type: 'pkcs8', format: 'pem' }))
    await expect(
      publishKnowledge({ ...options('bob'), privateKeyPath: path.join(directory, 'wrong.pem') })
    ).rejects.toThrow('不匹配')
    await writeFile(path.join(directory, 'shared/release.lock'), 'another publisher')
    await expect(publishKnowledge(options('bob'))).rejects.toThrow('正在运行')
    expect(await latest()).toEqual(initial)
  })

  it('refuses publication when prior assets disappear or secrets would be placed inside the public directory', async () => {
    await publishKnowledge(options('alice'))
    const initial = await latest()
    const release = verifyFeishuEnvelope(initial, { test: config.publicKey }).release
    await rm(path.join(directory, 'shared', `${release.sha256}.json`))
    await expect(publishKnowledge(options('bob'))).rejects.toThrow()
    await expect(publishKnowledge({ ...options('bob'), releaseDirectory: directory })).rejects.toThrow('发布目录之外')
    expect(await latest()).toEqual(initial)
  })

  it('verifies public assets before switching the manifest and distinguishes files from a verified online publication', async () => {
    await publishKnowledge(options('alice'))
    const initial = await latest()
    revision = 2
    config.manifestUrl = 'https://downloads.example/knowledge/latest.json'
    await expect(
      publishKnowledge({ ...options('bob'), fetch: async () => new Response('missing', { status: 404 }) })
    ).rejects.toThrow('不可访问')
    expect(await latest()).toEqual(initial)
    const result = await publishKnowledge({
      ...options('bob'),
      fetch: async (url) =>
        new Response(await readFile(path.join(directory, 'shared', path.basename(new URL(String(url)).pathname))))
    })
    expect(result).toMatchObject({ sequence: 2, mode: 'published' })
  })
})
