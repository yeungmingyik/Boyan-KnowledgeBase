import { generateKeyPairSync, sign } from 'node:crypto'

import { FEISHU_RELEASE_PREFIX, sha256, validateFeishuUpdateUrl } from '@main/utils/feishuRelease'
import type { FeishuPackage } from '@shared/types/feishuPackage'
import { serializeFeishuPackage } from '@shared/utils/feishuPackage'
import { describe, expect, it, vi } from 'vitest'

import { type FeishuUpdateJournal, FeishuUpdateRunner } from '../FeishuUpdateRunner'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

function fixture(sequence = 1, content = 'Verified body', minAppVersion = '2.0.14') {
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
  const pack = { ...body, packId: sha256(serializeFeishuPackage(body)) }
  const bytes = Buffer.from(JSON.stringify(pack))
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      distributionId: 'test',
      spaceId: '123',
      sequence,
      publishedAt: '2026-09-18T00:00:00.000Z',
      minAppVersion,
      packId: pack.packId,
      sha256: sha256(bytes),
      bytes: bytes.length
    })
  )
  const envelope = {
    keyId: 'test',
    manifest: manifest.toString('base64'),
    sha256: sha256(manifest),
    signature: sign(null, Buffer.concat([Buffer.from(FEISHU_RELEASE_PREFIX), manifest]), keys.privateKey).toString(
      'base64'
    )
  }
  return { bytes, envelope, pack }
}

function setup() {
  let release = fixture()
  let journal: FeishuUpdateJournal | undefined
  let installed: FeishuPackage | undefined
  let offline = false
  let failImport = false
  let corruptPackage = false
  let packageDownloads = 0
  const importer = vi.fn(async (pack: FeishuPackage) => {
    if (failImport) throw new Error('Disk full')
    installed = pack
    return { baseId: 'base', packId: pack.packId, importedCount: 1, emptyCount: 0, resourceCount: 0, unchanged: false }
  })
  const options = {
    config: {
      distributionId: 'test',
      spaceId: '123',
      manifestUrl: 'https://updates.example/latest.json',
      keys: { test: publicKey }
    },
    appVersion: '2.0.14',
    read: () => journal,
    write: (value: FeishuUpdateJournal) => {
      journal = value
    },
    import: importer,
    fetch: async (url: string) => {
      if (offline) throw new Error('Offline')
      if (url.endsWith('latest.json')) return new Response(JSON.stringify(release.envelope))
      packageDownloads++
      return new Response(corruptPackage ? Buffer.from('corrupted') : release.bytes)
    }
  }
  return {
    options,
    importer,
    runner: new FeishuUpdateRunner(options),
    setRelease: (next: ReturnType<typeof fixture>) => {
      release = next
    },
    offline: (value: boolean) => {
      offline = value
    },
    failImport: (value: boolean) => {
      failImport = value
    },
    corruptPackage: () => {
      corruptPackage = true
    },
    journal: () => journal,
    installed: () => installed,
    downloads: () => packageDownloads
  }
}

describe('Feishu user-initiated updates', () => {
  it('checks on startup and after restart without downloading or installing until the user accepts the displayed version', async () => {
    const test = setup()
    expect(await test.runner.check()).toMatchObject({ phase: 'available', availableSequence: 1 })
    expect(test.downloads()).toBe(0)
    expect(test.installed()).toBeUndefined()
    const restarted = new FeishuUpdateRunner(test.options)
    expect(await restarted.check()).toMatchObject({ phase: 'available', availableSequence: 1 })
    test.setRelease(fixture(2, 'Newer than the prompt'))
    expect(await restarted.install(1)).toMatchObject({ phase: 'available', availableSequence: 2 })
    expect(test.downloads()).toBe(0)
    expect(test.installed()).toBeUndefined()
    expect(await restarted.install(2)).toMatchObject({ phase: 'current', sequence: 2 })
    expect(test.installed()?.documents[0].content).toBe('Newer than the prompt')
    test.setRelease(fixture(3, 'Another release'))
    expect(await restarted.check()).toMatchObject({ phase: 'available', availableSequence: 3, sequence: 2 })
    expect(test.installed()?.documents[0].content).toBe('Newer than the prompt')
  })

  it('installs verified knowledge, coalesces concurrent installations, and avoids repeated package downloads', async () => {
    const test = setup()
    const first = test.runner.install(1)
    expect(test.runner.install(1)).toBe(first)
    expect(await first).toMatchObject({ phase: 'current', sequence: 1 })
    expect(test.installed()?.documents[0].content).toBe('Verified body')
    await test.runner.install(1)
    expect(test.downloads()).toBe(1)
    expect(test.journal()).toMatchObject({ sequence: 1, installedSequence: 1 })
  })

  it.each(['manifest', 'key', 'signature', 'package'] as const)(
    'rejects %s tampering without replacing knowledge',
    async (kind) => {
      const test = setup()
      const release = fixture()
      if (kind === 'manifest') release.envelope.manifest = Buffer.from('{}').toString('base64')
      if (kind === 'key') release.envelope.keyId = 'unknown'
      if (kind === 'signature') release.envelope.signature = Buffer.alloc(64).toString('base64')
      if (kind === 'package') test.corruptPackage()
      test.setRelease(release)
      expect(await test.runner.install(1)).toMatchObject({ phase: 'error', error: 'integrity' })
      expect(test.installed()).toBeUndefined()
    }
  )

  it('retains the installed version through offline and indexing failures and retries after restart', async () => {
    const test = setup()
    await test.runner.install(1)
    test.offline(true)
    expect(await test.runner.install(1)).toMatchObject({ phase: 'error', error: 'network', sequence: 1 })
    test.offline(false)
    test.failImport(true)
    test.setRelease(fixture(2, 'New body'))
    expect(await test.runner.install(2)).toMatchObject({ phase: 'error', error: 'import_failed', sequence: 1 })
    expect(test.installed()?.documents[0].content).toBe('Verified body')
    expect(test.journal()).toMatchObject({ sequence: 2, installedSequence: 1 })
    test.failImport(false)
    expect(await new FeishuUpdateRunner(test.options).install(2)).toMatchObject({ phase: 'current', sequence: 2 })
    expect(test.installed()?.documents[0].content).toBe('New body')
  })

  it('rejects lower sequences and conflicting same-sequence releases across restart, allowing a higher-sequence rollback', async () => {
    const test = setup()
    await test.runner.install(1)
    test.setRelease(fixture(2, 'New body'))
    await test.runner.install(2)
    const restarted = new FeishuUpdateRunner(test.options)
    for (const release of [fixture(1), fixture(2, 'Conflicting body')]) {
      test.setRelease(release)
      expect(await restarted.check()).toMatchObject({ phase: 'error', error: 'rollback' })
      expect(test.installed()?.documents[0].content).toBe('New body')
    }
    test.setRelease(fixture(3))
    expect(await restarted.install(3)).toMatchObject({ phase: 'current', sequence: 3 })
    expect(test.installed()?.documents[0].content).toBe('Verified body')
  })

  it('rejects incompatible releases and refuses checks after shutdown', async () => {
    const test = setup()
    test.setRelease(fixture(1, 'Body', '99.0.0'))
    expect(await test.runner.install(1)).toMatchObject({ phase: 'error', error: 'incompatible' })
    expect(test.journal()).toBeUndefined()
    test.runner.stop()
    test.setRelease(fixture())
    await test.runner.install(1)
    expect(test.installed()).toBeUndefined()
  })

  it('enforces download size even without a Content-Length header', async () => {
    const test = setup()
    test.options.fetch = async () => new Response('x'.repeat(33 * 1024))
    expect(await new FeishuUpdateRunner(test.options).check()).toMatchObject({ phase: 'error', error: 'integrity' })
    expect(test.installed()).toBeUndefined()
  })

  it('requires HTTPS in production and permits only numeric loopback HTTP for local development', () => {
    for (const url of [
      'http://updates.example/latest.json',
      'file:///tmp/latest.json',
      'https://user:secret@example.com/latest.json',
      'https://example.com/latest.json?token=secret'
    ])
      expect(() => validateFeishuUpdateUrl(url)).toThrow()
    expect(() => validateFeishuUpdateUrl('http://127.0.0.1:8123/latest.json')).toThrow()
    expect(validateFeishuUpdateUrl('http://127.0.0.1:8123/latest.json', true).hostname).toBe('127.0.0.1')
  })
})
