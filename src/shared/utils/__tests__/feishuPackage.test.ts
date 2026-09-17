import type { FeishuDocument } from '@shared/types/feishuPackage'
import { describe, expect, it } from 'vitest'

import { hasFeishuBody, normalizeFeishuContent, serializeFeishuPackage } from '../feishuPackage'

const document: FeishuDocument = {
  id: 'doc1',
  title: '课程',
  path: ['课程'],
  sourceUrl: 'https://example.feishu.cn/wiki/node1',
  revision: 1,
  content: '# 课程',
  resources: []
}

describe('Feishu text package', () => {
  it('does not turn a title-only page into an indexed source', () => {
    expect(hasFeishuBody(document)).toBe(false)
    expect(hasFeishuBody({ ...document, content: '# 课程\n\n教学目标' })).toBe(true)
  })

  it('preserves callout text and normalizes Windows line endings', () => {
    expect(normalizeFeishuContent('<callout emoji="💡">\r\n正文\r\n</callout>')).toBe('正文')
  })

  it('keeps package identity stable when only API enumeration order changes', () => {
    const pack = {
      schemaVersion: 1 as const,
      spaceId: '1',
      name: '课程',
      documents: [document, { ...document, id: 'doc2' }]
    }
    expect(serializeFeishuPackage(pack)).toBe(
      serializeFeishuPackage({ ...pack, documents: [...pack.documents].reverse() })
    )
    expect(serializeFeishuPackage(pack)).not.toBe(serializeFeishuPackage({ ...pack, documents: [document] }))
  })
})
