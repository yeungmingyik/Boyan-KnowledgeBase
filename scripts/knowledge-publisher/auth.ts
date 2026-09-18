import spawn from 'cross-spawn'

import { PublisherError } from './publisher'

export function parsePublisherAuth(value: unknown): { name: string } {
  const state = value as {
    identities?: { user?: { verified?: boolean; available?: boolean; scope?: string; userName?: string } }
  }
  const user = state?.identities?.user
  if (user?.verified !== true || user.available !== true) throw new PublisherError('飞书尚未连接。请登录后重新检查。')
  const scopes = new Set((user.scope ?? '').split(/\s+/))
  if (!['wiki:node:retrieve', 'docx:document:readonly'].every((scope) => scopes.has(scope)))
    throw new PublisherError('缺少资料读取授权。请重新登录飞书。')
  return { name: typeof user.userName === 'string' ? user.userName.slice(0, 80) : '飞书用户' }
}

export function checkPublisherAuth(profile?: string): Promise<{ name: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'lark-cli',
      [...(profile ? ['--profile', profile] : []), 'auth', 'status', '--json', '--verify'],
      {
        windowsHide: true,
        env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new PublisherError('连接超时，请检查网络后重试。'))
    }, 30_000)
    child.stdout?.on('data', (chunk) => {
      output += chunk
      if (output.length > 64 * 1024) {
        child.kill()
        reject(new PublisherError('飞书返回异常，请重新检查。'))
      }
    })
    child.on('error', () => {
      clearTimeout(timeout)
      reject(new PublisherError('无法启动飞书 CLI，请返回第一步检查环境。'))
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      try {
        if (code !== 0) throw new PublisherError('飞书连接失败。请检查应用配置、登录和网络。')
        resolve(parsePublisherAuth(JSON.parse(output)))
      } catch (error) {
        reject(error instanceof PublisherError ? error : new PublisherError('飞书返回异常，请重新检查。'))
      }
    })
  })
}
