import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sha256, verifyFeishuEnvelope } from '../../src/main/utils/feishuRelease'
import { serializeFeishuPackage } from '../../src/shared/utils/feishuPackage'
import { signFeishuRelease } from '../signFeishuRelease'

describe('signed Feishu publication', () => {
  const keys = generateKeyPairSync('ed25519')
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'feishu-release-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function publish(content = 'First body') {
    const body = {
      schemaVersion: 1 as const,
      spaceId: '123',
      name: 'Knowledge',
      documents: [
        {
          id: 'doc1',
          title: 'Document',
          path: ['Document'],
          sourceUrl: 'https://example.feishu.cn/docx/doc1',
          revision: 1,
          content,
          resources: []
        }
      ]
    }
    const packagePath = path.join(directory, 'input.json')
    await writeFile(packagePath, JSON.stringify({ ...body, packId: sha256(serializeFeishuPackage(body)) }))
    return signFeishuRelease({
      packagePath,
      directory,
      privateKey,
      keyId: 'test',
      distributionId: 'test',
      minAppVersion: '2.0.14'
    })
  }

  it('publishes an independently verifiable manifest after its immutable package and reuses unchanged releases', async () => {
    expect(await publish()).toMatchObject({ sequence: 1, unchanged: false })
    const initial = await readFile(path.join(directory, 'latest.json'))
    const { release } = verifyFeishuEnvelope(initial, { test: publicKey })
    const bytes = await readFile(path.join(directory, `${release.sha256}.json`))
    expect(sha256(bytes)).toBe(release.sha256)
    expect(bytes.length).toBe(release.bytes)
    expect(await publish()).toMatchObject({ sequence: 1, unchanged: true })
    expect(await readFile(path.join(directory, 'latest.json'))).toEqual(initial)
    expect(await publish('Second body')).toMatchObject({ sequence: 2 })
    expect(await readFile(path.join(directory, `${release.sha256}.json`))).toEqual(bytes)
    expect(await publish()).toMatchObject({ sequence: 3 })
  })

  it('preserves the last release when existing publication data is corrupted or another publisher owns the lock', async () => {
    await publish()
    const file = path.join(directory, 'latest.json')
    const previous = await readFile(file)
    await writeFile(path.join(directory, 'release.lock'), 'busy')
    await expect(publish('New content')).rejects.toThrow()
    expect(await readFile(file)).toEqual(previous)
    await rm(path.join(directory, 'release.lock'))
    await writeFile(file, '{}')
    await expect(publish('New content')).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('{}')
  })
})
