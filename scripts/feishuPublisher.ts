import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

import spawn from 'cross-spawn'

import { FEISHU_PACKAGE_MAX_BYTES } from '../src/shared/types/feishuPackage'
import { publishFeishuPackage } from './publishFeishuPackage'

async function lark<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn('lark-cli', [...args, '--as', 'user', '--format', 'json'], {
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => child.kill(), 90_000)
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
      if (stdout.length > FEISHU_PACKAGE_MAX_BYTES) child.kill()
    })
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8192)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timeout)
      try {
        const response = JSON.parse(code === 0 ? stdout : stderr)
        if (code !== 0 || response.ok !== true) {
          reject(
            new Error(
              `Feishu read failed: ${response.error?.type ?? 'unknown'}/${response.error?.subtype ?? 'unknown'}`
            )
          )
          return
        }
        resolve(response.data as T)
      } catch {
        reject(new Error(`Feishu CLI failed (${code ?? 'terminated'}). Check lark-cli auth status.`))
      }
    })
  })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      wiki: { type: 'string' },
      output: { type: 'string' },
      name: { type: 'string', default: '博研知识库' },
      watch: { type: 'boolean', default: false },
      interval: { type: 'string', default: '600' },
      'include-linked-documents': { type: 'boolean', default: false },
      'accept-removals-from': { type: 'string' }
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
        process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...result })}\n`)
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
