import { generateKeyPairSync } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import * as z from 'zod'

import { createFeishuCliReader } from '../feishuCliReader'
import { checkPublisherAuth } from './auth'
import { isInside, PublisherConfigSchema, PublisherError, publishKnowledge } from './publisher'

const settingsSchema = z.strictObject({
  configPath: z.string().min(1),
  privateKeyPath: z.string().min(1),
  releaseDirectory: z.string().min(1),
  profile: z
    .string()
    .regex(/^[a-zA-Z0-9_-]*$/)
    .default('')
})

async function json(file: string) {
  if ((await stat(file)).size > 32 * 1024) throw new PublisherError('配置文件过大。')
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
}

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      action: { type: 'string', default: 'publish' },
      settings: { type: 'string' },
      config: { type: 'string' },
      profile: { type: 'string' }
    }
  })
  const localRoot = process.env.LOCALAPPDATA
  if (!localRoot || process.platform !== 'win32')
    throw new PublisherError('发布工具需要 Windows 和有效的本机用户目录。')
  const home = path.join(localRoot, 'BoyanKnowledgePublisher')
  await mkdir(home, { recursive: true })
  if (values.action === 'auth') {
    const profile = z
      .string()
      .regex(/^[a-zA-Z0-9_-]*$/)
      .parse(values.profile ?? '')
    output({ type: 'auth', ...(await checkPublisherAuth(profile || undefined)) })
    return
  }
  if (values.action === 'keygen') {
    if (!values.config) throw new PublisherError('请选择公司发布配置。')
    const config = PublisherConfigSchema.parse(await json(values.config))
    const keyPath = path.join(home, 'knowledge-release.pem')
    const configPath = path.join(home, 'publisher.json')
    if (
      await stat(configPath).then(
        () => true,
        () => false
      )
    )
      throw new PublisherError('公司发布配置已存在；请直接使用已有配置和密钥。')
    const keys = generateKeyPairSync('ed25519')
    await writeFile(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
    await writeFile(
      configPath,
      JSON.stringify({ ...config, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }, null, 2),
      { flag: 'wx' }
    )
    output({ type: 'keys', privateKeyPath: keyPath, configPath })
    return
  }
  if (values.action !== 'publish' || !values.settings) throw new PublisherError('缺少本机发布设置。')
  const settings = settingsSchema.parse(await json(values.settings))
  const config = PublisherConfigSchema.parse(await json(settings.configPath))
  const keyPath = await realpath(settings.privateKeyPath)
  const toolRoot = await realpath(path.dirname(process.argv[1]))
  if (isInside(toolRoot, keyPath)) throw new PublisherError('私钥必须放在工具目录之外，不得随工具分发。')
  const result = await publishKnowledge({
    config,
    privateKeyPath: keyPath,
    releaseDirectory: settings.releaseDirectory,
    workingDirectory: path.join(home, 'work'),
    read: createFeishuCliReader('lark-cli', settings.profile || undefined),
    progress: (message) => output({ type: 'progress', message })
  })
  output({ type: 'result', ...result })
}

main().catch((error: unknown) => {
  const message =
    error instanceof PublisherError
      ? error.message
      : error instanceof z.ZodError
        ? '发布配置格式无效，请检查配置字段。'
        : error instanceof Error && error.message.startsWith('Publication blocked:')
          ? '移除或清空的文档超过 20%，已停止发布；请联系维护者核对资料。'
          : '操作未完成。请检查飞书连接、配置和目录权限后重试。'
  output({ type: 'error', message })
  process.exitCode = 1
})
