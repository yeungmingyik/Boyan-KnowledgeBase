import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

import { application } from '@application'
import { appStateTable } from '@data/db/schemas/appState'
import { knowledgeBaseService } from '@data/services/KnowledgeBaseService'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { ErrorCode, isDataApiError } from '@shared/data/api/errors'
import type { KnowledgeItem } from '@shared/data/types/knowledge'
import { FEISHU_PACKAGE_MAX_BYTES, type FeishuImportResult, FeishuPackageSchema } from '@shared/types/feishuPackage'
import { hasFeishuBody, renderFeishuDocument, serializeFeishuPackage } from '@shared/utils/feishuPackage'
import { eq } from 'drizzle-orm'
import * as z from 'zod'

const GenerationSchema = z.strictObject({
  baseId: z.uuidv4(),
  packId: z.string(),
  count: z.number().int().nonnegative()
})
const JournalSchema = z.strictObject({
  active: GenerationSchema.optional(),
  pending: GenerationSchema.optional()
})
type Journal = z.infer<typeof JournalSchema>

export class FeishuPackageImporter {
  private readonly locks = new KeyedMutex()

  private readJournal(key: string): Journal {
    const row = application
      .get('DbService')
      .getDb()
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, key))
      .get()
    return row ? JournalSchema.parse(row.value) : {}
  }

  private writeJournal(key: string, value: Journal): void {
    application
      .get('DbService')
      .getDb()
      .insert(appStateTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { value }
      })
      .run()
  }

  private findItems(baseId: string): KnowledgeItem[] | undefined {
    try {
      knowledgeBaseService.getById(baseId)
    } catch (error) {
      if (isDataApiError(error) && error.code === ErrorCode.NOT_FOUND) return undefined
      throw error
    }
    return application.get('KnowledgeService').listRootItems(baseId)
  }

  private promote(key: string, journal: Journal, name: string): void {
    if (!journal.pending) throw new Error('Missing pending knowledge version')
    if (journal.active && this.findItems(journal.active.baseId)) {
      const previous = knowledgeBaseService.getById(journal.active.baseId)
      if (previous.name === name)
        knowledgeBaseService.update(previous.id, { name: `${name} · ${journal.active.packId.slice(0, 8)}` })
    }
    knowledgeBaseService.update(journal.pending.baseId, { name })
    this.writeJournal(key, { active: journal.pending })
  }

  async importFile(filePath: string): Promise<FeishuImportResult> {
    const file = await open(filePath, 'r')
    let json: string
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Invalid package file size')
      const bytes = Buffer.alloc(FEISHU_PACKAGE_MAX_BYTES + 1)
      let size = 0
      while (size < bytes.length) {
        const read = await file.read(bytes, size, bytes.length - size)
        if (read.bytesRead === 0) break
        size += read.bytesRead
      }
      if (size > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Package exceeds 20 MiB')
      json = bytes.subarray(0, size).toString('utf8')
    } finally {
      await file.close()
    }
    const pack = FeishuPackageSchema.parse(JSON.parse(json))
    if (new Set(pack.documents.map((document) => document.id)).size !== pack.documents.length) {
      throw new Error('Duplicate document IDs')
    }
    const hash = createHash('sha256').update(serializeFeishuPackage(pack)).digest('hex')
    if (hash !== pack.packId) throw new Error('Package checksum mismatch')
    const documents = pack.documents.filter(hasFeishuBody)
    if (documents.length === 0) throw new Error('Package contains no document body')
    const expectedContent = new Set(documents.map((document) => `${document.title}\n${renderFeishuDocument(document)}`))
    const matches = (items: KnowledgeItem[] | undefined): boolean =>
      items?.length === documents.length &&
      items.every(
        (item) =>
          item.status === 'completed' &&
          item.type === 'note' &&
          expectedContent.has(`${item.data.source}\n${item.data.content}`)
      )
    return this.locks.runExclusive(pack.spaceId, async () => {
      const key = `feishuPackage:${pack.spaceId}`
      const journal = this.readJournal(key)
      const result = (baseId: string, unchanged: boolean): FeishuImportResult => ({
        baseId,
        packId: pack.packId,
        importedCount: documents.length,
        emptyCount: pack.documents.length - documents.length,
        resourceCount: pack.documents.filter((document) => document.resources.length > 0).length,
        unchanged
      })
      if (journal.active?.packId === pack.packId) {
        const items = this.findItems(journal.active.baseId)
        if (matches(items)) {
          const base = knowledgeBaseService.getById(journal.active.baseId)
          if (base.name === `${pack.name} · ${pack.packId.slice(0, 8)}`)
            knowledgeBaseService.update(base.id, { name: pack.name })
          return result(journal.active.baseId, true)
        }
      }
      const service = application.get('KnowledgeService')
      if (journal.pending) {
        const items = this.findItems(journal.pending.baseId)
        if (journal.pending.packId === pack.packId && matches(items)) {
          this.promote(key, journal, pack.name)
          return result(journal.pending.baseId, false)
        }
        if (items) await service.deleteBase(journal.pending.baseId)
        delete journal.pending
        this.writeJournal(key, journal)
      }
      const base = await service.createBase({ name: pack.name })
      journal.pending = { baseId: base.id, packId: pack.packId, count: documents.length }
      this.writeJournal(key, journal)
      for (let offset = 0; offset < documents.length; offset += 100) {
        await service.addItems(
          base.id,
          documents.slice(offset, offset + 100).map((document) => ({
            type: 'note' as const,
            data: { source: document.title, content: renderFeishuDocument(document) }
          }))
        )
      }
      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        const items = this.findItems(base.id)
        if (
          !items ||
          items.length !== documents.length ||
          items.some((item) => item.status === 'failed' || item.status === 'deleting')
        ) {
          throw new Error('Knowledge import failed; previous version retained')
        }
        if (items.every((item) => item.status === 'completed')) {
          this.promote(key, journal, pack.name)
          return result(base.id, false)
        }
        await setTimeout(250)
      }
      throw new Error('Knowledge import timed out; previous version retained. Import the package again to resume.')
    })
  }
}
