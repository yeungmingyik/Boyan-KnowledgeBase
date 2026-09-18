import spawn from 'cross-spawn'

import { FEISHU_PACKAGE_MAX_BYTES } from '../src/shared/types/feishuPackage'
import type { FeishuReader } from './collectFeishuDocuments'

export function createFeishuCliReader(executable = 'lark-cli', profile?: string): FeishuReader {
  return async <T>(args: string[]): Promise<T> =>
    new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [...(profile ? ['--profile', profile] : []), ...args, '--as', 'user', '--format', 'json'],
        {
          env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
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
      child.on('error', () => {
        clearTimeout(timeout)
        reject(new Error('Feishu CLI unavailable'))
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        try {
          const response = JSON.parse(code === 0 ? stdout : stderr)
          if (code !== 0 || response.ok !== true) {
            reject(new Error('Feishu authorization or read failed'))
            return
          }
          resolve(response.data as T)
        } catch {
          reject(new Error('Feishu CLI response invalid'))
        }
      })
    })
}
