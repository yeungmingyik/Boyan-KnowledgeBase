import { readFile } from 'node:fs/promises'

import { application } from '@application'
import { appStateTable } from '@data/db/schemas/appState'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { FeishuUpdateConfigSchema } from '@main/utils/feishuRelease'
import type { FeishuUpdateStatus } from '@shared/types/feishuUpdate'
import { eq } from 'drizzle-orm'
import { app, net } from 'electron'

import bundledConfig from '../../../../resources/feishu-update.json'
import { FeishuUpdateJournalSchema, FeishuUpdateRunner } from './FeishuUpdateRunner'

@Injectable('FeishuUpdateService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['KnowledgeService'])
export class FeishuUpdateService extends BaseService {
  private runner?: FeishuUpdateRunner
  private unavailable: FeishuUpdateStatus = { phase: 'disabled' }
  private nextCheck = 0
  private wasOnline = true
  private failures = 0
  private checkInFlight?: Promise<FeishuUpdateStatus>
  private installInFlight?: Promise<FeishuUpdateStatus>

  protected async onAllReady(): Promise<void> {
    try {
      const override = !app.isPackaged ? process.env.BOYAN_FEISHU_UPDATE_CONFIG : undefined
      const value: unknown = override ? JSON.parse(await readFile(override, 'utf8')) : bundledConfig
      if (value === null) return
      const config = FeishuUpdateConfigSchema.parse(value)
      const key = `feishuUpdate:${config.distributionId}`
      this.runner = new FeishuUpdateRunner({
        config,
        appVersion: app.getVersion(),
        development: !app.isPackaged,
        fetch: (url, init) => net.fetch(url, init),
        read: () => {
          const row = application
            .get('DbService')
            .getDb()
            .select()
            .from(appStateTable)
            .where(eq(appStateTable.key, key))
            .get()
          return row ? FeishuUpdateJournalSchema.parse(row.value) : undefined
        },
        write: (value) => {
          application
            .get('DbService')
            .getDb()
            .insert(appStateTable)
            .values({ key, value })
            .onConflictDoUpdate({ target: appStateTable.key, set: { value } })
            .run()
        },
        import: (pack, release, signal) =>
          application.get('KnowledgeService').importSignedFeishuPackage(pack, release, signal)
      })
      this.nextCheck = Date.now() + 5_000
      this.registerInterval(async () => {
        const online = net.isOnline()
        const recovered = online && !this.wasOnline
        this.wasOnline = online
        if (online && (recovered || Date.now() >= this.nextCheck)) await this.check()
      }, 5_000)
    } catch {
      this.unavailable = { phase: 'error', error: 'config' }
    }
  }

  getStatus(): FeishuUpdateStatus {
    return this.runner
      ? { ...this.runner.status, nextCheckAt: new Date(this.nextCheck).toISOString() }
      : this.unavailable
  }

  check(): Promise<FeishuUpdateStatus> {
    if (this.checkInFlight) return this.checkInFlight
    this.checkInFlight = this.runCheck().finally(() => {
      this.checkInFlight = undefined
    })
    return this.checkInFlight
  }

  install(sequence: number): Promise<FeishuUpdateStatus> {
    if (!this.runner) return Promise.resolve(this.unavailable)
    if (this.installInFlight) return this.installInFlight
    this.installInFlight = this.runner
      .install(sequence)
      .then(() => this.getStatus())
      .finally(() => {
        this.installInFlight = undefined
      })
    return this.installInFlight
  }

  private async runCheck(): Promise<FeishuUpdateStatus> {
    if (!this.runner) return this.unavailable
    const result = await this.runner.check()
    this.failures = result.phase === 'error' ? this.failures + 1 : 0
    const interval = this.failures ? Math.min(60_000 * 2 ** Math.min(this.failures - 1, 4), 900_000) : 900_000
    this.nextCheck = Date.now() + interval + Math.floor(Math.random() * 30_000)
    return this.getStatus()
  }

  protected async onStop(): Promise<void> {
    this.runner?.stop()
    await this.checkInFlight
    await this.installInFlight
  }
}
