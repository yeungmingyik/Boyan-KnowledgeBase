import type { FeishuImportResult, FeishuPackage } from '@shared/types/feishuPackage'
import type { FeishuUpdateStatus } from '@shared/types/feishuUpdate'
import semver from 'semver'
import * as z from 'zod'

import {
  FEISHU_ENVELOPE_MAX_BYTES,
  type FeishuUpdateConfig,
  parseFeishuPackage,
  sha256,
  validateFeishuUpdateUrl,
  verifyFeishuEnvelope
} from '../../utils/feishuRelease'

export const FeishuReleaseIdentitySchema = z.strictObject({
  distributionId: z.string(),
  sequence: z.number().int().positive(),
  manifestHash: z.string()
})
export type FeishuReleaseIdentity = z.infer<typeof FeishuReleaseIdentitySchema>

export const FeishuUpdateJournalSchema = z.strictObject({
  sequence: z.number().int().positive(),
  manifestHash: z.string(),
  installedSequence: z.number().int().positive().optional(),
  baseId: z.string().optional(),
  lastUpdatedAt: z.string().optional()
})
export type FeishuUpdateJournal = z.infer<typeof FeishuUpdateJournalSchema>

interface UpdateOptions {
  config: FeishuUpdateConfig
  appVersion: string
  development?: boolean
  fetch: (url: string, init: RequestInit) => Promise<Response>
  read: () => FeishuUpdateJournal | undefined
  write: (journal: FeishuUpdateJournal) => void
  import: (pack: FeishuPackage, release: FeishuReleaseIdentity, signal: AbortSignal) => Promise<FeishuImportResult>
}

class FeishuDownloadLimitError extends Error {}

export class FeishuUpdateRunner {
  private inFlight?: Promise<FeishuUpdateStatus>
  private installing = false
  private controller?: AbortController
  private stopped = false
  private cachedPackage?: { hash: string; bytes: Uint8Array }
  status: FeishuUpdateStatus = { phase: 'idle' }

  constructor(private readonly options: UpdateOptions) {
    validateFeishuUpdateUrl(options.config.manifestUrl, options.development)
    const previous = options.read()
    if (previous)
      this.status = {
        phase: 'idle',
        sequence: previous.installedSequence,
        baseId: previous.baseId,
        lastUpdatedAt: previous.lastUpdatedAt
      }
  }

  stop(): void {
    this.stopped = true
    this.controller?.abort()
  }

  check(): Promise<FeishuUpdateStatus> {
    return this.start()
  }

  install(sequence: number): Promise<FeishuUpdateStatus> {
    if (this.inFlight && !this.installing) return this.inFlight.then(() => this.install(sequence))
    return this.start(sequence)
  }

  private start(sequence?: number): Promise<FeishuUpdateStatus> {
    if (this.stopped) return Promise.resolve(this.status)
    if (this.inFlight) return this.inFlight
    this.installing = sequence !== undefined
    this.inFlight = this.run(sequence).finally(() => {
      this.inFlight = undefined
      this.installing = false
    })
    return this.inFlight
  }

  private async download(url: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
    const response = await this.options.fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-cache',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok || !response.body) throw new Error('Download failed')
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body.cancel()
      throw new FeishuDownloadLimitError('Download exceeds limit')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) throw new FeishuDownloadLimitError('Download exceeds limit')
        chunks.push(value)
      }
      return Buffer.concat(chunks)
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
  }

  private async run(requestedSequence?: number): Promise<FeishuUpdateStatus> {
    this.controller = new AbortController()
    const signal = this.controller.signal
    let errorCode: FeishuUpdateStatus['error'] = 'network'
    this.status = { ...this.status, phase: 'checking', error: undefined, lastCheckedAt: new Date().toISOString() }
    try {
      const { config } = this.options
      const envelope = await this.download(config.manifestUrl, FEISHU_ENVELOPE_MAX_BYTES, signal)
      errorCode = 'integrity'
      const { release, manifestHash } = verifyFeishuEnvelope(envelope, config.keys)
      if (release.distributionId !== config.distributionId || release.spaceId !== config.spaceId)
        throw new Error('Release identity mismatch')
      const previous = this.options.read()
      errorCode = 'rollback'
      if (
        previous &&
        (release.sequence < previous.sequence ||
          (release.sequence === previous.sequence && manifestHash !== previous.manifestHash))
      )
        throw new Error('Release rollback or equivocation')
      errorCode = 'incompatible'
      if (!semver.gte(this.options.appVersion, release.minAppVersion)) throw new Error('Application update required')
      const journal = { ...previous, sequence: release.sequence, manifestHash }
      this.options.write(journal)
      if (previous?.installedSequence === release.sequence) {
        this.status = { ...this.status, phase: 'current', availableSequence: undefined }
        return this.status
      }
      this.status = { ...this.status, phase: 'available', availableSequence: release.sequence }
      if (requestedSequence !== release.sequence) return this.status
      errorCode = 'network'
      this.status = { ...this.status, phase: 'downloading' }
      const packageUrl = new URL(`${release.sha256}.json`, config.manifestUrl).href
      const bytes =
        this.cachedPackage?.hash === release.sha256
          ? this.cachedPackage.bytes
          : await this.download(packageUrl, release.bytes, signal)
      errorCode = 'integrity'
      if (bytes.byteLength !== release.bytes || sha256(bytes) !== release.sha256)
        throw new Error('Package digest mismatch')
      const pack = parseFeishuPackage(bytes)
      if (pack.packId !== release.packId || pack.spaceId !== config.spaceId)
        throw new Error('Package identity mismatch')
      this.cachedPackage = { hash: release.sha256, bytes }
      signal.throwIfAborted()
      errorCode = 'import_failed'
      this.status = { ...this.status, phase: 'indexing' }
      const result = await this.options.import(
        pack,
        { distributionId: config.distributionId, sequence: release.sequence, manifestHash },
        signal
      )
      signal.throwIfAborted()
      const lastUpdatedAt =
        result.unchanged && previous?.lastUpdatedAt ? previous.lastUpdatedAt : new Date().toISOString()
      this.options.write({ ...journal, installedSequence: release.sequence, baseId: result.baseId, lastUpdatedAt })
      this.status = {
        ...this.status,
        phase: 'current',
        sequence: release.sequence,
        availableSequence: undefined,
        baseId: result.baseId,
        previousBaseId: result.previousBaseId,
        lastUpdatedAt
      }
    } catch (error) {
      this.status = {
        ...this.status,
        phase: 'error',
        error: error instanceof FeishuDownloadLimitError ? 'integrity' : errorCode
      }
    }
    return this.status
  }
}
