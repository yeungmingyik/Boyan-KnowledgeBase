import type { FeishuDocument } from '../src/shared/types/feishuPackage'
import { normalizeFeishuContent } from '../src/shared/utils/feishuPackage'

interface WikiNode {
  space_id: string
  node_token: string
  obj_token: string
  obj_type: string
  title: string
  has_child: boolean
}

export type FeishuReader = <T>(args: string[]) => Promise<T>

interface FetchedDocument {
  document_id: string
  revision_id: number
  content: string
  reference_map?: Record<string, unknown>
}

function documentLinks(content: string): URL[] {
  return [...content.matchAll(/https:\/\/[^\s)>"']+/g)]
    .filter((match) => URL.canParse(match[0]))
    .map((match) => new URL(match[0]))
}

async function fetchDocument(read: FeishuReader, id: string): Promise<FetchedDocument> {
  try {
    const { document } = await read<{ document: FetchedDocument }>([
      'docs',
      '+fetch',
      '--doc',
      id,
      '--doc-format',
      'markdown'
    ])
    if (document.document_id !== id) throw new Error('Document identity mismatch')
    return document
  } catch (error) {
    throw new Error(`Document ${id}: ${error instanceof Error ? error.message : 'Read failed'}`)
  }
}

export async function collectFeishuDocuments(
  wiki: string,
  read: FeishuReader,
  onDocument?: (title: string) => void,
  includeLinkedDocuments = false
) {
  const url = new URL(wiki)
  if (
    url.protocol !== 'https:' ||
    !/^[a-zA-Z0-9-]+\.feishu\.cn$/.test(url.hostname) ||
    !/^\/wiki\/[a-zA-Z0-9]+$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('A Feishu Wiki URL is required')
  }
  const root = await read<WikiNode>(['wiki', '+node-get', '--node-token', wiki])
  const queue: { token?: string; path: string[] }[] = [{ path: [] }]
  const visited = new Set<string>()
  const documents: FeishuDocument[] = []
  const documentIds = new Set<string>()
  const linkedNodes = new Set<string>()
  while (queue.length) {
    const parent = queue.shift()!
    const args = ['wiki', '+node-list', '--space-id', root.space_id, '--page-all']
    if (parent.token) args.push('--parent-node-token', parent.token)
    let cursor: string | undefined
    do {
      const page = await read<{ nodes: WikiNode[]; has_more: boolean; page_token: string }>(
        cursor ? [...args, '--page-token', cursor] : args
      )
      for (const node of page.nodes) {
        if (visited.has(node.node_token)) throw new Error('Repeated Wiki node; export aborted')
        visited.add(node.node_token)
        if (visited.size > 2000) throw new Error('Wiki exceeds the 2000 document limit')
        if (node.space_id !== root.space_id || node.obj_type !== 'docx')
          throw new Error(`Unsupported Wiki resource: ${node.obj_type}`)
        const nodePath = [...parent.path, node.title]
        if (nodePath.length > 30) throw new Error('Wiki exceeds the 30 level limit')
        if (node.has_child) queue.push({ token: node.node_token, path: nodePath })
        if (documentIds.has(node.obj_token)) continue
        const document = await fetchDocument(read, node.obj_token)
        documentIds.add(node.obj_token)
        documents.push({
          id: node.obj_token,
          title: node.title,
          path: nodePath,
          sourceUrl: `${url.origin}/wiki/${node.node_token}`,
          revision: document.revision_id,
          content: normalizeFeishuContent(document.content),
          resources: Object.keys(document.reference_map ?? {})
            .filter((key) => key !== 'comments')
            .sort()
        })
        onDocument?.(node.title)
      }
      if (page.has_more && (!page.page_token || page.page_token === cursor))
        throw new Error('Invalid pagination cursor')
      cursor = page.has_more ? page.page_token : undefined
    } while (cursor)
  }
  if (!visited.has(root.node_token)) throw new Error('Entry node missing from space listing')
  if (includeLinkedDocuments) {
    const links = documents.flatMap((document) => documentLinks(document.content))
    for (const link of links) {
      const match = link.pathname.match(/^\/(docx|wiki)\/([a-zA-Z0-9]+)$/)
      if (!match || link.origin !== url.origin || link.username || link.password) continue
      const [, kind, token] = match
      if (visited.has(token) || linkedNodes.has(token) || documentIds.has(token)) continue
      let id = token
      let title: string | undefined
      if (kind === 'wiki') {
        const node = await read<WikiNode>(['wiki', '+node-get', '--node-token', `${link.origin}${link.pathname}`])
        if (node.obj_type !== 'docx') continue
        id = node.obj_token
        title = node.title
        linkedNodes.add(token)
        if (documentIds.has(id)) continue
      }
      if (documents.length >= 2000) throw new Error('Wiki exceeds the 2000 document limit')
      const document = await fetchDocument(read, id)
      title ??=
        document.content.match(/^#\s+([^\r\n]+)/)?.[1] ?? document.content.match(/<title>([^<]+)<\/title>/)?.[1] ?? id
      documentIds.add(id)
      documents.push({
        id,
        title,
        path: ['引用文档', title],
        sourceUrl: `${link.origin}${link.pathname}`,
        revision: document.revision_id,
        content: normalizeFeishuContent(document.content),
        resources: Object.keys(document.reference_map ?? {})
          .filter((key) => key !== 'comments')
          .sort()
      })
      onDocument?.(title)
    }
  }
  for (const document of documents) {
    const resources = new Set(document.resources)
    for (const link of documentLinks(document.content)) {
      const linkedToken = link.pathname.match(/^\/(?:docx|wiki|sheets|base|slides)\/([a-zA-Z0-9]+)/)?.[1]
      if (
        link.hostname.endsWith('.feishu.cn') &&
        linkedToken &&
        !visited.has(linkedToken) &&
        !linkedNodes.has(linkedToken) &&
        !documentIds.has(linkedToken)
      ) {
        resources.add('linked-document')
      }
    }
    if (/!\[[^\]]*\]\(|<(?:img|file|whiteboard|sheet|bitable)\b/i.test(document.content))
      resources.add('embedded-resource')
    document.resources = [...resources].sort()
  }
  return { spaceId: root.space_id, documents }
}
