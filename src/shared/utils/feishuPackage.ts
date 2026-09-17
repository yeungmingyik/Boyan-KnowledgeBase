import type { FeishuDocument, FeishuPackage } from '../types/feishuPackage'

export function normalizeFeishuContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/<\/?callout\b[^>]*>/gi, '')
    .trim()
}

export function hasFeishuBody(document: FeishuDocument): boolean {
  return (
    normalizeFeishuContent(document.content)
      .replace(/^\s*#{1,6}\s+[^\n]*(?:\n|$)/, '')
      .trim().length > 0
  )
}

export function serializeFeishuPackage(pack: Omit<FeishuPackage, 'packId'>): string {
  return JSON.stringify({
    schemaVersion: pack.schemaVersion,
    spaceId: pack.spaceId,
    name: pack.name,
    documents: [...pack.documents]
      .sort((a, b) => a.id.localeCompare(b.id, 'en'))
      .map((document) => ({
        id: document.id,
        title: document.title,
        path: document.path,
        sourceUrl: document.sourceUrl,
        revision: document.revision,
        content: document.content,
        resources: [...document.resources].sort()
      }))
  })
}

export function renderFeishuDocument(document: FeishuDocument): string {
  return `${normalizeFeishuContent(document.content)}\n\n---\n\n来源：[${document.title.replace(/[[\]\\]/g, '')}](${document.sourceUrl})\n\n目录：${document.path.join(' / ')}\n`
}
