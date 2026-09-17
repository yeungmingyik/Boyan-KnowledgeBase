import { describe, expect, it } from 'vitest'

import { collectFeishuDocuments, type FeishuReader } from '../collectFeishuDocuments'

function fixtureReader(failChild = false): FeishuReader {
  const node = (token: string, child = false) => ({
    space_id: '123',
    node_token: token,
    obj_token: `doc${token}`,
    obj_type: 'docx',
    title: token,
    has_child: child
  })
  return async <T>(args: string[]): Promise<T> => {
    let data: unknown
    if (args[1] === '+node-get') data = node('manual')
    else if (args[1] === '+fetch') {
      if (failChild && args[3] === 'docchild') throw new Error('permission denied')
      data = {
        document: {
          document_id: args[3],
          revision_id: 1,
          content: `# ${args[3]}\n\n正文 [外部材料](https://example.feishu.cn/docx/external)`,
          reference_map: { comments: { c1: { data: 'Private review comment' } } }
        }
      }
    } else if (args.includes('--parent-node-token')) {
      data = { nodes: [node('child')], has_more: false, page_token: '' }
    } else if (args.includes('--page-token')) {
      data = { nodes: [node('section', true)], has_more: false, page_token: '' }
    } else {
      data = { nodes: [node('manual')], has_more: true, page_token: 'next' }
    }
    return data as T
  }
}

describe('Feishu space export', () => {
  it('includes paginated siblings and descendants even when the supplied document has no children', async () => {
    const result = await collectFeishuDocuments('https://example.feishu.cn/wiki/manual', fixtureReader())
    expect(result.documents.map((document) => document.id)).toEqual(['docmanual', 'docsection', 'docchild'])
    expect(result.documents[2].path).toEqual(['section', 'child'])
    expect(result.documents[2].sourceUrl).toBe('https://example.feishu.cn/wiki/child')
  })

  it('aborts the entire export if a descendant cannot be read', async () => {
    await expect(collectFeishuDocuments('https://example.feishu.cn/wiki/manual', fixtureReader(true))).rejects.toThrow(
      'permission denied'
    )
  })

  it('reports unexported linked documents without exporting review comments', async () => {
    const result = await collectFeishuDocuments('https://example.feishu.cn/wiki/manual', fixtureReader())
    expect(result.documents[0].resources).toEqual(['linked-document'])
    expect(JSON.stringify(result)).not.toContain('Private review comment')
  })

  it('imports direct same-site references once without following their links or other sites', async () => {
    const base = fixtureReader()
    const fetched: string[] = []
    const read: FeishuReader = async <T>(args: string[]): Promise<T> => {
      if (args[1] !== '+fetch') return base<T>(args)
      fetched.push(args[3])
      if (args[3] === 'external')
        return {
          document: {
            document_id: 'external',
            revision_id: 2,
            content: '# 外部材料\n\n[下一层](https://example.feishu.cn/docx/deeper)'
          }
        } as T
      const response = await base<{ document: { content: string } }>(args)
      response.document.content += '\n[跨站](https://other.feishu.cn/docx/foreign)'
      return response as T
    }
    const result = await collectFeishuDocuments('https://example.feishu.cn/wiki/manual', read, undefined, true)
    expect(fetched).toEqual(['docmanual', 'docsection', 'docchild', 'external'])
    expect(result.documents.find((document) => document.id === 'external')).toMatchObject({
      title: '外部材料',
      sourceUrl: 'https://example.feishu.cn/docx/external',
      resources: ['linked-document']
    })
    expect(result.documents[0].resources).toEqual(['linked-document'])
  })

  it('fails publication when an included direct reference cannot be read', async () => {
    const base = fixtureReader()
    const read: FeishuReader = async <T>(args: string[]): Promise<T> => {
      if (args[1] === '+fetch' && args[3] === 'external') throw new Error('Referenced document unavailable')
      return base<T>(args)
    }
    await expect(
      collectFeishuDocuments('https://example.feishu.cn/wiki/manual', read, undefined, true)
    ).rejects.toThrow('Referenced document unavailable')
  })
})
