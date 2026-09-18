import { createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  FEISHU_RELEASE_PREFIX,
  FeishuReleaseSchema,
  parseFeishuPackage,
  sha256,
  verifyFeishuEnvelope
} from '../src/main/utils/feishuRelease'
import { FEISHU_PACKAGE_MAX_BYTES } from '../src/shared/types/feishuPackage'

export async function signFeishuRelease(options: {
  packagePath: string
  directory: string
  privateKey: string
  keyId: string
  distributionId: string
  minAppVersion: string
}) {
  const directory = path.resolve(options.directory)
  await mkdir(directory, { recursive: true })
  const lockPath = path.join(directory, 'release.lock')
  const lock = await open(lockPath, 'wx', 0o600)
  const temporary = path.join(directory, `${randomUUID()}.tmp`)
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }))
    if ((await stat(options.packagePath)).size > FEISHU_PACKAGE_MAX_BYTES) throw new Error('Package exceeds 20 MiB')
    const bytes = await readFile(options.packagePath)
    const pack = parseFeishuPackage(bytes)
    const privateKey = createPrivateKey(options.privateKey)
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 private key')
    const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()
    const manifestPath = path.join(directory, 'latest.json')
    let previous: ReturnType<typeof verifyFeishuEnvelope> | undefined
    try {
      previous = verifyFeishuEnvelope(await readFile(manifestPath), { [options.keyId]: publicKey })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    if (
      previous &&
      (previous.release.distributionId !== options.distributionId || previous.release.spaceId !== pack.spaceId)
    )
      throw new Error('Publication identity mismatch')
    const digest = sha256(bytes)
    const assetPath = path.join(directory, `${digest}.json`)
    try {
      await writeFile(assetPath, bytes, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (sha256(await readFile(assetPath)) !== digest) throw new Error('Published package is corrupted')
    }
    if (previous?.release.sha256 === digest && previous.release.minAppVersion === options.minAppVersion)
      return { sequence: previous.release.sequence, packId: pack.packId, unchanged: true }
    const release = FeishuReleaseSchema.parse({
      schemaVersion: 1,
      distributionId: options.distributionId,
      spaceId: pack.spaceId,
      sequence: (previous?.release.sequence ?? 0) + 1,
      publishedAt: new Date().toISOString(),
      minAppVersion: options.minAppVersion,
      packId: pack.packId,
      sha256: digest,
      bytes: bytes.byteLength
    })
    const manifest = Buffer.from(JSON.stringify(release))
    const envelope = {
      keyId: options.keyId,
      manifest: manifest.toString('base64'),
      sha256: sha256(manifest),
      signature: sign(null, Buffer.concat([Buffer.from(FEISHU_RELEASE_PREFIX), manifest]), privateKey).toString(
        'base64'
      )
    }
    verifyFeishuEnvelope(Buffer.from(JSON.stringify(envelope)), { [options.keyId]: publicKey })
    await writeFile(temporary, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
    await rename(temporary, manifestPath)
    return { sequence: release.sequence, packId: pack.packId, unchanged: false }
  } finally {
    await rm(temporary, { force: true })
    await lock.close()
    await rm(lockPath, { force: true })
  }
}
