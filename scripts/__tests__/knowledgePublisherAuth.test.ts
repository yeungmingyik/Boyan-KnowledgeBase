import { describe, expect, it } from 'vitest'

import { parsePublisherAuth } from '../knowledge-publisher/auth'

describe('publisher Feishu connection', () => {
  const user = { verified: true, available: true, scope: 'wiki:node:retrieve docx:document:readonly', userName: '同事' }

  it('returns only a display name for a verified user with reading scopes', () => {
    expect(parsePublisherAuth({ identities: { user: { ...user, accessToken: 'private' } } })).toEqual({ name: '同事' })
  })

  it('rejects bot-only, unverified and unavailable identities', () => {
    for (const state of [
      null,
      {},
      { identities: { bot: user } },
      { identities: { user: { ...user, verified: false } } },
      { identities: { user: { ...user, available: false } } }
    ]) {
      expect(() => parsePublisherAuth(state)).toThrow('请登录')
    }
  })

  it('requires both document and wiki read scopes', () => {
    expect(() => parsePublisherAuth({ identities: { user: { ...user, scope: 'docx:document:readonly' } } })).toThrow(
      '读取授权'
    )
  })
})
