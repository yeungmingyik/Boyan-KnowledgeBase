import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { agentTable } from '@data/db/schemas/agent'
import { appStateTable } from '@data/db/schemas/appState'
import { assistantTable } from '@data/db/schemas/assistant'
import { agentKnowledgeBaseTable, assistantKnowledgeBaseTable } from '@data/db/schemas/assistantRelations'
import { knowledgeBaseTable, knowledgeItemTable } from '@data/db/schemas/knowledge'
import { assistantDataService } from '@data/services/AssistantService'
import { knowledgeBaseService } from '@data/services/KnowledgeBaseService'
import { knowledgeItemService } from '@data/services/KnowledgeItemService'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import type { KnowledgeAddItemInput } from '@shared/data/types/knowledge'
import type { FeishuPackage } from '@shared/types/feishuPackage'
import { serializeFeishuPackage } from '@shared/utils/feishuPackage'
import { setupTestDatabase } from '@test-helpers/db'
import { eq, ne } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FeishuPackageImporter } from '../FeishuPackageImporter'

const runtime = vi.hoisted(() => ({
  createBase: vi.fn(),
  deleteBase: vi.fn(),
  addItems: vi.fn(),
  listRootItems: vi.fn()
}))

vi.mock('@application', async () => {
  const { defaultServiceInstances, mockApplicationFactory } = await import('@test-mocks/main/application')
  const services = { ...defaultServiceInstances, KnowledgeService: runtime }
  return mockApplicationFactory(services)
})

describe('Feishu package import', () => {
  const dbh = setupTestDatabase()
  let directory: string
  let failing: boolean

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'feishu-package-'))
    failing = false
    runtime.createBase.mockImplementation(async (dto) => knowledgeBaseService.create(dto))
    runtime.deleteBase.mockImplementation(async (id) => knowledgeBaseService.delete(id))
    runtime.listRootItems.mockImplementation((id) => knowledgeItemService.getRootItemsByBaseId(id))
    runtime.addItems.mockImplementation(async (baseId: string, items: KnowledgeAddItemInput[]) => {
      for (const item of items) {
        dbh.db
          .insert(knowledgeItemTable)
          .values({
            baseId,
            type: 'note',
            data: item.data,
            status: failing ? 'failed' : 'completed',
            error: failing ? 'Indexing failed' : null
          })
          .run()
      }
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  async function fixture(content = '# 招聘标准\n\n教师需完成三天培训。', mutate?: (pack: FeishuPackage) => void) {
    const body = {
      schemaVersion: 1 as const,
      spaceId: '7610776951925509072',
      name: 'Test knowledge',
      documents: [
        {
          id: 'doc1',
          title: '招聘标准',
          path: ['开局与部署', '招聘标准'],
          sourceUrl: 'https://example.feishu.cn/wiki/node1',
          revision: 1,
          content,
          resources: []
        }
      ]
    }
    const pack: FeishuPackage = {
      ...body,
      packId: createHash('sha256').update(serializeFeishuPackage(body)).digest('hex')
    }
    mutate?.(pack)
    const file = path.join(directory, 'knowledge.json')
    await writeFile(file, JSON.stringify(pack))
    return file
  }

  function bind(baseId: string, personalId: string) {
    dbh.db
      .insert(assistantTable)
      .values({
        id: 'assistant',
        name: 'My assistant',
        emoji: 'A',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        orderKey: 'a0',
        prompt: 'Keep my prompt'
      })
      .run()
    dbh.db
      .insert(agentTable)
      .values({
        id: 'agent',
        name: 'My agent',
        type: 'claude-code',
        instructions: 'Keep my instructions',
        orderKey: 'a0'
      })
      .run()
    for (const knowledgeBaseId of [baseId, personalId]) {
      dbh.db.insert(assistantKnowledgeBaseTable).values({ assistantId: 'assistant', knowledgeBaseId }).run()
      dbh.db.insert(agentKnowledgeBaseTable).values({ agentId: 'agent', knowledgeBaseId }).run()
    }
  }

  it('switches assistant and agent bindings only after successful indexing, preserving personal knowledge and prompts', async () => {
    const importer = new FeishuPackageImporter()
    const first = await importer.importFile(await fixture())
    const personal = knowledgeBaseService.create({ name: 'Personal' })
    bind(first.baseId, personal.id)
    failing = true
    const nextFile = await fixture('# 招聘标准\n\nNew verified text')
    await expect(importer.importFile(nextFile)).rejects.toThrow()
    expect(
      dbh.db
        .select()
        .from(assistantKnowledgeBaseTable)
        .all()
        .map((row) => row.knowledgeBaseId)
    ).toContain(first.baseId)
    failing = false
    const next = await importer.importFile(nextFile)
    for (const rows of [
      dbh.db.select().from(assistantKnowledgeBaseTable).all(),
      dbh.db.select().from(agentKnowledgeBaseTable).all()
    ])
      expect(rows.map((row) => row.knowledgeBaseId).sort()).toEqual([next.baseId, personal.id].sort())
    expect(dbh.db.select().from(assistantTable).get()?.prompt).toBe('Keep my prompt')
    expect(dbh.db.select().from(agentTable).get()?.instructions).toBe('Keep my instructions')
    expect(knowledgeItemService.getRootItemsByBaseId(first.baseId)[0].data).toHaveProperty(
      'content',
      expect.stringContaining('三天')
    )
  })

  it('rolls back names, bindings, and the active journal together when activation fails', async () => {
    const importer = new FeishuPackageImporter()
    const first = await importer.importFile(await fixture())
    const personal = knowledgeBaseService.create({ name: 'Personal' })
    bind(first.baseId, personal.id)
    vi.spyOn(assistantDataService, 'replaceKnowledgeBaseTx').mockImplementationOnce(() => {
      throw new Error('Activation failed')
    })
    await expect(importer.importFile(await fixture('New body'))).rejects.toThrow('Activation failed')
    expect(knowledgeBaseService.getById(first.baseId).name).toBe('Test knowledge')
    expect(dbh.db.select().from(appStateTable).get()?.value).toMatchObject({ active: { baseId: first.baseId } })
    expect(
      dbh.db
        .select()
        .from(assistantKnowledgeBaseTable)
        .all()
        .map((row) => row.knowledgeBaseId)
    ).toContain(first.baseId)
  })

  it('does not activate while conversations are running and resumes the completed staging version', async () => {
    const first = await new FeishuPackageImporter().importFile(await fixture())
    let idle = false
    const importer = new FeishuPackageImporter(() => idle)
    const signal = new AbortController()
    const pack = JSON.parse(await readFile(await fixture('New body'), 'utf8')) as FeishuPackage
    const pending = importer.importPackage(pack, undefined, signal.signal)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(dbh.db.select().from(appStateTable).get()?.value).toMatchObject({
      active: { baseId: first.baseId },
      pending: { packId: pack.packId }
    })
    signal.abort()
    await expect(pending).rejects.toThrow()
    idle = true
    const result = await importer.importPackage(pack)
    expect(dbh.db.select().from(appStateTable).get()?.value).toMatchObject({ active: { baseId: result.baseId } })
    expect(dbh.db.select().from(knowledgeBaseTable).all()).toHaveLength(2)
  })

  it('prevents unsigned imports and signed downgrades from replacing a managed knowledge base', async () => {
    const importer = new FeishuPackageImporter()
    const file = await fixture()
    const pack = JSON.parse(await readFile(file, 'utf8')) as FeishuPackage
    const release = { distributionId: 'test', sequence: 2, manifestHash: 'verified' }
    const first = await importer.importPackage(pack, release)
    await expect(importer.importFile(file)).rejects.toThrow('Signed knowledge')
    await expect(importer.importPackage(pack, { ...release, sequence: 1 })).rejects.toThrow('Signed knowledge')
    expect((await importer.importPackage(pack, release)).baseId).toBe(first.baseId)
  })

  it('rejects a staging version edited while activation waits for conversations', async () => {
    const first = await new FeishuPackageImporter().importFile(await fixture())
    const importer = new FeishuPackageImporter(() => {
      dbh.db
        .update(knowledgeItemTable)
        .set({ data: { source: 'Edited', content: 'Altered content' } })
        .where(ne(knowledgeItemTable.baseId, first.baseId))
        .run()
      return true
    })
    await expect(importer.importFile(await fixture('New body'))).rejects.toThrow('changed before activation')
    expect(dbh.db.select().from(appStateTable).get()?.value).toMatchObject({ active: { baseId: first.baseId } })
  })

  it('imports searchable bodies with source attribution and reuses a completed version after restart', async () => {
    const file = await fixture()
    const first = await new FeishuPackageImporter().importFile(file)
    const second = await new FeishuPackageImporter().importFile(file)
    expect(second).toMatchObject({ baseId: first.baseId, unchanged: true, importedCount: 1 })
    expect(dbh.db.select().from(knowledgeBaseTable).all()).toHaveLength(1)
    const item = knowledgeItemService.getRootItemsByBaseId(first.baseId)[0]
    expect(item.data).toMatchObject({ source: '招聘标准' })
    expect(item.data).toHaveProperty('content', expect.stringContaining('https://example.feishu.cn/wiki/node1'))
    expect(item.data).toHaveProperty('content', expect.stringContaining('开局与部署 / 招聘标准'))
    expect(knowledgeBaseService.getById(first.baseId).embeddingModelId).toBeNull()
    expect(knowledgeBaseService.getById(first.baseId).name).toBe('Test knowledge')
  })

  it('removes the legacy hash suffix without replacing the base or overriding a custom name', async () => {
    const file = await fixture()
    const first = await new FeishuPackageImporter().importFile(file)
    knowledgeBaseService.update(first.baseId, { name: `Test knowledge · ${first.packId.slice(0, 8)}` })
    const second = await new FeishuPackageImporter().importFile(file)
    expect(second.baseId).toBe(first.baseId)
    expect(knowledgeBaseService.getById(first.baseId).name).toBe('Test knowledge')
    knowledgeBaseService.update(first.baseId, { name: 'My custom name' })
    await new FeishuPackageImporter().importFile(file)
    expect(knowledgeBaseService.getById(first.baseId).name).toBe('My custom name')
  })

  it('keeps the previous active generation when indexing fails and allows retry', async () => {
    const importer = new FeishuPackageImporter()
    const first = await importer.importFile(await fixture())
    failing = true
    const updated = await fixture('# 招聘标准\n\n教师需完成五天培训。')
    await expect(importer.importFile(updated)).rejects.toThrow('previous version retained')
    const journal = dbh.db.select().from(appStateTable).get()?.value
    expect(journal).toMatchObject({ active: { baseId: first.baseId } })
    expect(knowledgeItemService.getRootItemsByBaseId(first.baseId)[0].data).toHaveProperty(
      'content',
      expect.stringContaining('三天')
    )
    failing = false
    const next = await new FeishuPackageImporter().importFile(updated)
    expect(next.baseId).not.toBe(first.baseId)
    expect(dbh.db.select().from(appStateTable).get()?.value).toMatchObject({ active: { baseId: next.baseId } })
    expect(knowledgeBaseService.getById(first.baseId)).toBeDefined()
    expect(knowledgeItemService.getRootItemsByBaseId(next.baseId)[0].data).toHaveProperty(
      'content',
      expect.stringContaining('五天')
    )
  })

  it('rejects tampered content before creating any knowledge base', async () => {
    const file = await fixture(undefined, (pack) => {
      pack.documents[0].content += ' tampered'
    })
    await expect(new FeishuPackageImporter().importFile(file)).rejects.toThrow('checksum mismatch')
    expect(dbh.db.select().from(knowledgeBaseTable).all()).toHaveLength(0)
  })

  it('rejects duplicated document identities and title-only packages', async () => {
    await expect(
      new FeishuPackageImporter().importFile(
        await fixture(undefined, (pack) => {
          pack.documents.push(pack.documents[0])
        })
      )
    ).rejects.toThrow('Duplicate document IDs')
    await expect(new FeishuPackageImporter().importFile(await fixture('# 招聘标准'))).rejects.toThrow(
      'no document body'
    )
    expect(dbh.db.select().from(knowledgeBaseTable).all()).toHaveLength(0)
  })

  it('recreates a version if its local knowledge base was removed', async () => {
    const file = await fixture()
    const first = await new FeishuPackageImporter().importFile(file)
    dbh.db.delete(knowledgeBaseTable).where(eq(knowledgeBaseTable.id, first.baseId)).run()
    const next = await new FeishuPackageImporter().importFile(file)
    expect(next.baseId).not.toBe(first.baseId)
    expect(next.unchanged).toBe(false)
  })
})
