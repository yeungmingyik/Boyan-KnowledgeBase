import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BaseService } from '@main/core/lifecycle'
import { FEISHU_RELEASE_PREFIX, sha256 } from '@main/utils/feishuRelease'
import { serializeFeishuPackage } from '@shared/utils/feishuPackage'
import { setupTestDatabase } from '@test-helpers/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FeishuUpdateService } from '../FeishuUpdateService'

const runtime = vi.hoisted(() => ({
  fetch: vi.fn(),
  online: true,
  packaged: false,
  importSignedFeishuPackage: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return runtime.packaged
    },
    getVersion: () => '2.0.14'
  },
  net: { fetch: runtime.fetch, isOnline: () => runtime.online }
}))
vi.mock('@application', async () => {
  const { defaultServiceInstances, mockApplicationFactory } = await import('@test-mocks/main/application')
  const services = { ...defaultServiceInstances, KnowledgeService: runtime }
  return mockApplicationFactory(services)
})

describe('Feishu update scheduling', () => {
  setupTestDatabase()
  let directory: string
  let service: FeishuUpdateService

  beforeEach(async () => {
    BaseService.resetInstances()
    directory = await mkdtemp(path.join(os.tmpdir(), 'feishu-schedule-'))
    const keys = generateKeyPairSync('ed25519')
    const body = {
      schemaVersion: 1 as const,
      spaceId: '123',
      name: 'Knowledge',
      documents: [
        {
          id: 'doc1',
          title: 'Document',
          path: [],
          sourceUrl: 'https://example.feishu.cn/docx/doc1',
          revision: 1,
          content: 'Verified text',
          resources: []
        }
      ]
    }
    const packId = sha256(serializeFeishuPackage(body))
    const bytes = Buffer.from(JSON.stringify({ ...body, packId }))
    const manifest = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        distributionId: 'test',
        spaceId: '123',
        sequence: 1,
        publishedAt: '2026-09-18T00:00:00.000Z',
        minAppVersion: '2.0.14',
        packId,
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
    runtime.online = true
    runtime.packaged = false
    runtime.fetch
      .mockReset()
      .mockImplementation(
        async (url: string) => new Response(url.endsWith('latest.json') ? JSON.stringify(envelope) : bytes)
      )
    runtime.importSignedFeishuPackage.mockReset().mockResolvedValue({
      baseId: 'base',
      packId,
      unchanged: false,
      importedCount: 1,
      emptyCount: 0,
      resourceCount: 0
    })
    const config = path.join(directory, 'config.json')
    await writeFile(
      config,
      JSON.stringify({
        distributionId: 'test',
        spaceId: '123',
        manifestUrl: 'http://127.0.0.1:8123/latest.json',
        keys: { test: keys.publicKey.export({ type: 'spki', format: 'pem' }) }
      })
    )
    vi.stubEnv('BOYAN_FEISHU_UPDATE_CONFIG', config)
    vi.useFakeTimers()
    service = new FeishuUpdateService()
  })

  afterEach(async () => {
    await service._doStop()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })

  it('checks after startup, schedules a later check, and checks on reconnect without needing the knowledge page', async () => {
    await service._doAllReady()
    expect(service.getStatus().phase).toBe('idle')
    await vi.advanceTimersByTimeAsync(5000)
    expect(service.getStatus()).toMatchObject({ phase: 'available', availableSequence: 1 })
    expect(runtime.importSignedFeishuPackage).not.toHaveBeenCalled()
    await service.install(1)
    expect(service.getStatus()).toMatchObject({ phase: 'current', sequence: 1 })
    const next = service.getStatus().nextCheckAt!
    expect(Date.parse(next) - Date.now()).toBeGreaterThanOrEqual(900_000)
    runtime.online = false
    await vi.advanceTimersByTimeAsync(5000)
    runtime.online = true
    runtime.fetch.mockRejectedValue(new Error('Connection refused'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(service.getStatus()).toMatchObject({ phase: 'error', error: 'network', sequence: 1 })
    expect(Date.parse(service.getStatus().nextCheckAt!) - Date.now()).toBeLessThanOrEqual(90_000)
    await service._doStop()
    const checked = service.getStatus().lastCheckedAt
    await vi.advanceTimersByTimeAsync(1_000_000)
    expect(service.getStatus().lastCheckedAt).toBe(checked)
  })

  it('ignores development trust overrides in packaged applications and performs no network request without bundled configuration', async () => {
    runtime.packaged = true
    await service._doAllReady()
    await vi.advanceTimersByTimeAsync(1_000_000)
    expect(service.getStatus().phase).toBe('disabled')
    expect(runtime.fetch).not.toHaveBeenCalled()
  })
})
