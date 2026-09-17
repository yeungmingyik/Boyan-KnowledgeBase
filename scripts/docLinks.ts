import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { fromMarkdown } from 'mdast-util-from-markdown'
import { visit } from 'unist-util-visit'

export interface DocLink {
  line: number
  url: string
}

export interface BrokenDocLink {
  file: string
  line: number
  link: string
  resolvedPath: string
}

export function markdownLinks(content: string): DocLink[] {
  const links: DocLink[] = []
  visit(fromMarkdown(content), (node) => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition')
      links.push({ line: node.position?.start.line ?? 1, url: node.url })
  })
  return links
}

export function checkDocLinks(
  root: string,
  filePath: string,
  resolveReference?: (file: string, link: string) => string | undefined
): BrokenDocLink[] {
  const file = path.relative(root, filePath).split(path.sep).join('/')
  const broken: BrokenDocLink[] = []
  for (const { line, url } of markdownLinks(readFileSync(filePath, 'utf8'))) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) continue
    const linkPath = url.split('#')[0].split('?')[0]
    if (!linkPath) continue
    let decoded: string
    try {
      decoded = decodeURIComponent(linkPath)
    } catch {
      broken.push({ file, line, link: url, resolvedPath: linkPath })
      continue
    }
    const resolved = path.resolve(path.dirname(filePath), decoded)
    if (!existsSync(resolved) && !resolveReference?.(file, url))
      broken.push({ file, line, link: url, resolvedPath: path.relative(root, resolved) })
  }
  return broken
}
