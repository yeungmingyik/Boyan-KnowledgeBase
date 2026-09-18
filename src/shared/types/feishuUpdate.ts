import * as z from 'zod'

export const FeishuUpdateStatusSchema = z.strictObject({
  phase: z.enum(['disabled', 'idle', 'checking', 'available', 'downloading', 'indexing', 'current', 'error']),
  error: z.enum(['config', 'network', 'integrity', 'incompatible', 'rollback', 'import_failed']).optional(),
  lastCheckedAt: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
  sequence: z.number().int().nonnegative().optional(),
  availableSequence: z.number().int().positive().optional(),
  baseId: z.string().optional(),
  previousBaseId: z.string().optional(),
  nextCheckAt: z.string().optional()
})

export type FeishuUpdateStatus = z.infer<typeof FeishuUpdateStatusSchema>
