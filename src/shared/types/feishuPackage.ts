import * as z from 'zod'

export const FEISHU_PACKAGE_MAX_BYTES = 20 * 1024 * 1024

export const FeishuDocumentSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9]+$/),
  title: z.string().min(1).max(500),
  path: z.array(z.string().min(1).max(500)).max(30),
  sourceUrl: z.url().regex(/^https:\/\/[a-zA-Z0-9-]+\.feishu\.cn\/(?:wiki|docx)\/[a-zA-Z0-9]+$/),
  revision: z.number().int().nonnegative(),
  content: z.string().max(900_000),
  resources: z.array(z.string().max(100)).max(100)
})

export const FeishuPackageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  spaceId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(100),
  packId: z.string().regex(/^[a-f0-9]{64}$/),
  documents: z.array(FeishuDocumentSchema).min(1).max(2000)
})

export const FeishuImportResultSchema = z.strictObject({
  baseId: z.uuidv4(),
  packId: z.string(),
  importedCount: z.number().int().nonnegative(),
  emptyCount: z.number().int().nonnegative(),
  resourceCount: z.number().int().nonnegative(),
  unchanged: z.boolean()
})

export type FeishuDocument = z.infer<typeof FeishuDocumentSchema>
export type FeishuPackage = z.infer<typeof FeishuPackageSchema>
export type FeishuImportResult = z.infer<typeof FeishuImportResultSchema>
