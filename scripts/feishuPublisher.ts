import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

import { createFeishuCliReader } from './feishuCliReader'
import { publishFeishuPackage } from './publishFeishuPackage'
import { signFeishuRelease } from './signFeishuRelease'

const lark = createFeishuCliReader()

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      wiki: { type: 'string' },
      output: { type: 'string' },
      name: { type: 'string', default: '博研知识库' },
      watch: { type: 'boolean', default: false },
      interval: { type: 'string', default: '600' },
      'include-linked-documents': { type: 'boolean', default: false },
      'accept-removals-from': { type: 'string' },
      'release-directory': { type: 'string' },
      'signing-key': { type: 'string' },
      'key-id': { type: 'string' },
      'distribution-id': { type: 'string', default: 'boyan-partner' },
      'min-app-version': { type: 'string', default: '2.0.14' }
    }
  })
  if (!values.wiki || !values.output)
    throw new Error('Usage: pnpm knowledge:export --wiki <Feishu Wiki URL> --output <package.json>')
  const interval = Number(values.interval)
  if (!Number.isInteger(interval) || interval < 60 || interval > 86400)
    throw new Error('--interval must be an integer between 60 and 86400 seconds')
  if (values.watch && values['accept-removals-from'])
    throw new Error('--accept-removals-from is only allowed for a single export')
  const stop = new AbortController()
  if (values['release-directory'] && (!values['signing-key'] || !values['key-id']))
    throw new Error('Signed publication requires --signing-key and --key-id')
  if ((values['signing-key'] || values['key-id']) && !values['release-directory'])
    throw new Error('Signing requires --release-directory')
  if (values['signing-key']) {
    if (!path.isAbsolute(values['signing-key'])) throw new Error('Signing key requires an absolute path')
    for (const root of [process.cwd(), path.resolve(values['release-directory']!)]) {
      const relative = path.relative(root, values['signing-key'])
      if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)))
        throw new Error('Signing key must be outside the repository and release directory')
    }
  }
  const stopWatching = () => stop.abort()
  process.on('SIGINT', stopWatching)
  process.on('SIGTERM', stopWatching)
  try {
    do {
      try {
        const result = await publishFeishuPackage(
          {
            wiki: values.wiki,
            output: values.output,
            name: values.name,
            includeLinkedDocuments: values['include-linked-documents'],
            acceptRemovalsFrom: values['accept-removals-from']
          },
          lark
        )
        const release = values['release-directory']
          ? await signFeishuRelease({
              packagePath: values.output,
              directory: values['release-directory'],
              privateKey: await readFile(values['signing-key']!, 'utf8'),
              keyId: values['key-id']!,
              distributionId: values['distribution-id'],
              minAppVersion: values['min-app-version']
            })
          : undefined
        process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...result, release })}\n`)
      } catch (error) {
        if (!values.watch) throw error
        process.stderr.write(
          `${new Date().toISOString()} ${error instanceof Error ? error.message : 'Export failed'}\n`
        )
      }
      if (values.watch && !stop.signal.aborted)
        await delay(interval * 1000, undefined, { signal: stop.signal }).catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) throw error
        })
    } while (values.watch && !stop.signal.aborted)
  } finally {
    process.off('SIGINT', stopWatching)
    process.off('SIGTERM', stopWatching)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Export failed'}\n`)
  process.exitCode = 1
})
