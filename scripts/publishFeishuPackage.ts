import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { FEISHU_PACKAGE_MAX_BYTES, type FeishuPackage, FeishuPackageSchema } from '../src/shared/types/feishuPackage'
import { hasFeishuBody, serializeFeishuPackage } from '../src/shared/utils/feishuPackage'
import { collectFeishuDocuments, type FeishuReader } from './collectFeishuDocuments'

interface PublishOptions {
  wiki: string
  output: string
  name: string
  includeLinkedDocuments?: boolean
  acceptRemovalsFrom?: string
}

function validatePackage(value: unknown): FeishuPackage {
  const pack = FeishuPackageSchema.parse(value)
  if (new Set(pack.documents.map((document) => document.id)).size !== pack.documents.length)
    throw new Error('Duplicate document IDs')
  if (createHash('sha256').update(serializeFeishuPackage(pack)).digest('hex') !== pack.packId)
    throw new Error('Package checksum mismatch')
  return pack
}

export async function publishFeishuPackage(options: PublishOptions, read: FeishuReader) {
  const output = path.resolve(options.output)
  await mkdir(path.dirname(output), { recursive: true })
  const lockPath = `${output}.lock`
  const lock = await open(lockPath, 'wx', 0o600)
  const temporary = `${output}.${randomUUID()}.tmp`
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    let previous: FeishuPackage | undefined
    try {
      if ((await stat(output)).size > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Previous package exceeds 20 MiB')
      previous = validatePackage(JSON.parse(await readFile(output, 'utf8')))
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    const { spaceId, documents } = await collectFeishuDocuments(
      options.wiki,
      read,
      undefined,
      options.includeLinkedDocuments
    )
    if (previous && previous.spaceId !== spaceId) throw new Error('Output belongs to another Feishu space')
    if (!documents.some(hasFeishuBody)) throw new Error('Package contains no document body')
    const body = { schemaVersion: 1 as const, spaceId, name: options.name, documents }
    const pack = validatePackage({
      ...body,
      packId: createHash('sha256').update(serializeFeishuPackage(body)).digest('hex')
    })
    const currentIds = new Set(documents.map((document) => document.id))
    const previousDocuments = new Map(previous?.documents.map((document) => [document.id, document]))
    const removed = [...previousDocuments.keys()].filter((id) => !currentIds.has(id))
    const emptied = documents.filter((document) => {
      const before = previousDocuments.get(document.id)
      return before && hasFeishuBody(before) && !hasFeishuBody(document)
    })
    if (
      previous &&
      (removed.length + emptied.length) / previous.documents.length > 0.2 &&
      options.acceptRemovalsFrom !== previous.packId
    ) {
      throw new Error(
        `Publication blocked: ${removed.length} removed, ${emptied.length} emptied. Review changes before using --accept-removals-from ${previous.packId}`
      )
    }
    const counts = {
      added: documents.filter((document) => !previousDocuments.has(document.id)).length,
      changed: documents.filter((document) => {
        const before = previousDocuments.get(document.id)
        return (
          before &&
          serializeFeishuPackage({ ...body, documents: [before] }) !==
            serializeFeishuPackage({ ...body, documents: [document] })
        )
      }).length,
      removed: removed.length,
      bodies: documents.filter(hasFeishuBody).length,
      empty: documents.filter((document) => !hasFeishuBody(document)).length,
      resources: documents.filter((document) => document.resources.length > 0).length
    }
    if (previous?.packId === pack.packId) return { packId: pack.packId, unchanged: true, ...counts }
    const json = JSON.stringify(pack, null, 2)
    if (Buffer.byteLength(json) > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Package exceeds 20 MiB')
    await writeFile(temporary, json, { flag: 'wx', mode: 0o600 })
    await rename(temporary, output)
    return { packId: pack.packId, unchanged: false, ...counts }
  } finally {
    await rm(temporary, { force: true })
    await lock.close()
    await rm(lockPath, { force: true })
  }
}
