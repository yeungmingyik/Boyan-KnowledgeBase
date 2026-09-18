import { createHash, createPublicKey, verify } from 'node:crypto'

import semver from 'semver'
import * as z from 'zod'

import { FEISHU_PACKAGE_MAX_BYTES, FeishuPackageSchema } from '../../shared/types/feishuPackage'
import { hasFeishuBody, serializeFeishuPackage } from '../../shared/utils/feishuPackage'

export const FEISHU_RELEASE_PREFIX = 'boyan-feishu-release-v1\n'
export const FEISHU_ENVELOPE_MAX_BYTES = 32 * 1024
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const FeishuReleaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  distributionId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  spaceId: z.string().regex(/^\d+$/),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  publishedAt: z.iso.datetime(),
  minAppVersion: z.string().refine((value) => semver.valid(value) !== null),
  packId: hashSchema,
  sha256: hashSchema,
  bytes: z.number().int().positive().max(FEISHU_PACKAGE_MAX_BYTES)
})

export const FeishuEnvelopeSchema = z.strictObject({
  keyId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  manifest: z
    .string()
    .min(1)
    .max(16 * 1024),
  sha256: hashSchema,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
})

export const FeishuUpdateConfigSchema = z.strictObject({
  distributionId: FeishuReleaseSchema.shape.distributionId,
  spaceId: FeishuReleaseSchema.shape.spaceId,
  manifestUrl: z.url(),
  keys: z.record(FeishuEnvelopeSchema.shape.keyId, z.string().max(2000)).refine((keys) => Object.keys(keys).length > 0)
})

export type FeishuRelease = z.infer<typeof FeishuReleaseSchema>
export type FeishuUpdateConfig = z.infer<typeof FeishuUpdateConfigSchema>

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function parseFeishuPackage(bytes: Uint8Array) {
  if (bytes.byteLength > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Package exceeds 20 MiB')
  const pack = FeishuPackageSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')))
  if (new Set(pack.documents.map((document) => document.id)).size !== pack.documents.length)
    throw new Error('Duplicate document IDs')
  if (sha256(serializeFeishuPackage(pack)) !== pack.packId) throw new Error('Package checksum mismatch')
  if (!pack.documents.some(hasFeishuBody)) throw new Error('Package contains no document body')
  return pack
}

export function verifyFeishuEnvelope(bytes: Uint8Array, keys: Record<string, string>) {
  if (bytes.byteLength > FEISHU_ENVELOPE_MAX_BYTES) throw new Error('Release envelope too large')
  const envelope = FeishuEnvelopeSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')))
  const pem = Object.hasOwn(keys, envelope.keyId) ? keys[envelope.keyId] : undefined
  if (!pem) throw new Error('Untrusted signing key')
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 public key')
  const manifest = Buffer.from(envelope.manifest, 'base64')
  if (manifest.toString('base64') !== envelope.manifest || sha256(manifest) !== envelope.sha256)
    throw new Error('Manifest checksum mismatch')
  if (
    !verify(
      null,
      Buffer.concat([Buffer.from(FEISHU_RELEASE_PREFIX), manifest]),
      key,
      Buffer.from(envelope.signature, 'base64')
    )
  )
    throw new Error('Invalid release signature')
  return { release: FeishuReleaseSchema.parse(JSON.parse(manifest.toString('utf8'))), manifestHash: envelope.sha256 }
}

export function validateFeishuUpdateUrl(value: string, development = false): URL {
  const url = new URL(value)
  const local = development && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.hash || url.search)
    throw new Error('Invalid update URL')
  return url
}
