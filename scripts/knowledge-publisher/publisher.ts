import { createPrivateKey, createPublicKey, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import * as z from 'zod'

import {
  FEISHU_ENVELOPE_MAX_BYTES,
  parseFeishuPackage,
  sha256,
  validateFeishuUpdateUrl,
  verifyFeishuEnvelope
} from '../../src/main/utils/feishuRelease'
import { FEISHU_PACKAGE_MAX_BYTES } from '../../src/shared/types/feishuPackage'
import type { FeishuReader } from '../collectFeishuDocuments'
import { publishFeishuPackage } from '../publishFeishuPackage'
import { signFeishuRelease } from '../signFeishuRelease'

export const PublisherConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  wiki: z.url().regex(/^https:\/\/[a-zA-Z0-9-]+\.feishu\.cn\/wiki\/[a-zA-Z0-9]+$/),
  name: z.string().min(1).max(100),
  spaceId: z.string().regex(/^\d+$/),
  includeLinkedDocuments: z.boolean(),
  distributionId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  keyId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  publicKey: z.string().max(2000),
  minAppVersion: z.string(),
  manifestUrl: z.string()
})
export type PublisherConfig = z.infer<typeof PublisherConfigSchema>

export class PublisherError extends Error {}

export function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function boundedFile(file: string, limit: number): Promise<Buffer> {
  if ((await stat(file)).size > limit) throw new PublisherError('文件超过大小限制，发布已停止。')
  const bytes = await readFile(file)
  if (bytes.length > limit) throw new PublisherError('文件超过大小限制，发布已停止。')
  return bytes
}

async function verifyDownload(url: string, expected: Buffer, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(url, {
    redirect: 'error',
    cache: 'no-cache',
    credentials: 'omit',
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok || !response.body) throw new PublisherError('下载地址不可访问；请核对网站目录与 HTTPS 地址。')
  const reader = response.body.getReader()
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > expected.length) throw new PublisherError('下载内容不匹配；请核对发布目录与缓存设置。')
      chunks.push(value)
    }
    if (!Buffer.concat(chunks).equals(expected)) throw new PublisherError('下载内容不匹配；请核对发布目录与缓存设置。')
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export async function publishKnowledge(options: {
  config: PublisherConfig
  privateKeyPath: string
  releaseDirectory: string
  workingDirectory: string
  read: FeishuReader
  fetch?: typeof fetch
  progress?: (message: string) => void
}) {
  const config = PublisherConfigSchema.parse(options.config)
  if (config.manifestUrl) validateFeishuUpdateUrl(config.manifestUrl)
  if (
    !path.isAbsolute(options.privateKeyPath) ||
    !path.isAbsolute(options.releaseDirectory) ||
    !path.isAbsolute(options.workingDirectory)
  )
    throw new PublisherError('请选择完整的本机路径或共享目录。')
  await mkdir(options.releaseDirectory, { recursive: true })
  await mkdir(options.workingDirectory, { recursive: true })
  const directory = await realpath(options.releaseDirectory)
  const workingRoot = await realpath(options.workingDirectory)
  const keyPath = await realpath(options.privateKeyPath)
  if (isInside(directory, keyPath) || isInside(directory, workingRoot))
    throw new PublisherError('私钥和工作目录必须位于发布目录之外。')
  const privateKey = (await boundedFile(keyPath, 16 * 1024)).toString('utf8')
  let publicKey: string
  try {
    publicKey = createPublicKey(createPrivateKey(privateKey)).export({ type: 'spki', format: 'pem' }).toString()
  } catch {
    throw new PublisherError('发布密钥无效，请重新选择公司提供的 .pem 文件。')
  }
  if (publicKey !== config.publicKey) throw new PublisherError('私钥与公司的发布配置不匹配，请使用指定的发布私钥。')
  const lockPath = path.join(directory, 'release.lock')
  const lock = await open(lockPath, 'wx', 0o600).catch(() => {
    throw new PublisherError('发布目录不可写或另一个发布任务正在运行。')
  })
  let stage: string | undefined
  const temporary = path.join(directory, `${randomUUID()}.tmp`)
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, host: process.env.COMPUTERNAME ?? '', startedAt: new Date().toISOString() })
    )
    stage = await mkdtemp(path.join(workingRoot, 'release-'))
    const packagePath = path.join(stage, 'knowledge.json')
    const targetManifest = path.join(directory, 'latest.json')
    try {
      const bytes = await boundedFile(targetManifest, FEISHU_ENVELOPE_MAX_BYTES)
      const previous = verifyFeishuEnvelope(bytes, { [config.keyId]: config.publicKey }).release
      if (previous.distributionId !== config.distributionId || previous.spaceId !== config.spaceId)
        throw new PublisherError('发布目录属于其他发行配置。')
      const packageBytes = await boundedFile(path.join(directory, `${previous.sha256}.json`), FEISHU_PACKAGE_MAX_BYTES)
      const pack = parseFeishuPackage(packageBytes)
      if (sha256(packageBytes) !== previous.sha256 || pack.packId !== previous.packId)
        throw new PublisherError('已有发布文件损坏，发布已停止。')
      await writeFile(packagePath, packageBytes)
      await writeFile(path.join(stage, 'latest.json'), bytes)
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT' &&
          !(await stat(targetManifest).then(
            () => true,
            () => false
          ))
        )
      )
        throw error
    }
    options.progress?.('正在读取飞书资料…')
    const counts = await publishFeishuPackage(
      {
        wiki: config.wiki,
        output: packagePath,
        name: config.name,
        includeLinkedDocuments: config.includeLinkedDocuments
      },
      options.read
    )
    const pack = parseFeishuPackage(await boundedFile(packagePath, FEISHU_PACKAGE_MAX_BYTES))
    if (pack.spaceId !== config.spaceId) throw new PublisherError('飞书知识空间与发布配置不匹配。')
    options.progress?.('正在签名并保存发布文件…')
    const signed = await signFeishuRelease({
      packagePath,
      directory: stage,
      privateKey,
      keyId: config.keyId,
      distributionId: config.distributionId,
      minAppVersion: config.minAppVersion
    })
    const envelope = await boundedFile(path.join(stage, 'latest.json'), FEISHU_ENVELOPE_MAX_BYTES)
    const { release } = verifyFeishuEnvelope(envelope, { [config.keyId]: config.publicKey })
    const asset = await boundedFile(path.join(stage, `${release.sha256}.json`), FEISHU_PACKAGE_MAX_BYTES)
    const assetPath = path.join(directory, `${release.sha256}.json`)
    try {
      await writeFile(assetPath, asset, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (sha256(await boundedFile(assetPath, FEISHU_PACKAGE_MAX_BYTES)) !== release.sha256)
        throw new PublisherError('已有发布文件损坏，发布已停止。')
    }
    if (config.manifestUrl) {
      options.progress?.('正在验证下载地址…')
      await verifyDownload(new URL(`${release.sha256}.json`, config.manifestUrl).href, asset, options.fetch ?? fetch)
    }
    await copyFile(path.join(stage, 'latest.json'), temporary)
    await rename(temporary, targetManifest)
    if (config.manifestUrl) {
      try {
        await verifyDownload(config.manifestUrl, envelope, options.fetch ?? fetch)
      } catch {
        throw new PublisherError('发布清单已写入，但下载地址尚未返回新版；请检查缓存或稍后重试。')
      }
    }
    return { ...counts, sequence: signed.sequence, mode: config.manifestUrl ? 'published' : 'generated', directory }
  } finally {
    await rm(temporary, { force: true })
    await lock.close()
    await rm(lockPath, { force: true })
    if (stage && path.dirname(path.resolve(stage)) === workingRoot) await rm(stage, { recursive: true, force: true })
  }
}
