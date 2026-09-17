import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkDocLinks, markdownLinks } from '../docLinks'

describe('Markdown link validation', () => {
  let root: string
  let file: string

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'doc-links-'))
    file = path.join(root, 'README.md')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('ignores inline, fenced and indented code while reporting real broken links on the correct lines', () => {
    writeFileSync(
      file,
      [
        '`![alt](@./images/photo.png)`',
        '````markdown',
        '[example](fenced.md)',
        '```',
        '````',
        '',
        '    [example](indented.md)',
        '',
        '[broken](missing.md)',
        '![image](missing.png)'
      ].join('\n')
    )
    expect(checkDocLinks(root, file)).toEqual([
      { file: 'README.md', line: 9, link: 'missing.md', resolvedPath: 'missing.md' },
      { file: 'README.md', line: 10, link: 'missing.png', resolvedPath: 'missing.png' }
    ])
  })

  it('checks reference definitions, angle-bracket destinations and paths containing parentheses', () => {
    writeFileSync(
      file,
      '[guide][ref]\n\n[ref]: missing.md "Guide"\n\n[space](<missing file.md>)\n[paren](missing(v2).md)'
    )
    expect(checkDocLinks(root, file).map(({ line, link }) => ({ line, link }))).toEqual([
      { line: 3, link: 'missing.md' },
      { line: 5, link: 'missing file.md' },
      { line: 6, link: 'missing(v2).md' }
    ])
  })

  it('resolves escaped spaces and fragments and skips external destinations', () => {
    writeFileSync(path.join(root, 'existing file.md'), '# Existing')
    writeFileSync(
      file,
      [
        '[one](existing%20file.md#section)',
        '[two](<existing file.md>)',
        '[web](https://example.com/page)',
        '[mail](mailto:team@example.com)',
        '[anchor](#section)'
      ].join('\n')
    )
    expect(checkDocLinks(root, file)).toEqual([])
  })

  it('does not suppress malformed percent escapes or real links next to code examples', () => {
    writeFileSync(file, '`[sample](sample.md)` [real](bad%ZZ.md)')
    expect(checkDocLinks(root, file)).toEqual([
      { file: 'README.md', line: 1, link: 'bad%ZZ.md', resolvedPath: 'bad%ZZ.md' }
    ])
    expect(markdownLinks('\\`[real](real.md)\\`')).toEqual([{ line: 1, url: 'real.md' }])
  })
})
