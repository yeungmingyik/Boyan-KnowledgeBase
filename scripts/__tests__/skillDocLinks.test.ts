import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkDocLinks } from '../docLinks'
import { loadSkillDocLinks } from '../skillDocLinks'

describe('Pinned optional skill references', () => {
  let root: string
  const file = '.agents/skills/source/SKILL.md'
  const content = '[Optional](../optional/SKILL.md)\n'
  const repository = 'https://github.com/example/skills'
  const revision = 'a'.repeat(40)
  const blob = 'b'.repeat(40)

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'skill-doc-links-'))
    mkdirSync(path.join(root, '.agents/skills/source'), { recursive: true })
    writeFileSync(path.join(root, file), content)
    writeFileSync(
      path.join(root, '.agents/skills.lock.json'),
      JSON.stringify({
        skills: [
          {
            repository,
            revision,
            installed_path: '.agents/skills/source',
            source_path: 'skills/source',
            files: [{ path: 'SKILL.md', sha256: createHash('sha256').update(content).digest('hex') }]
          }
        ]
      })
    )
    writeFileSync(
      path.join(root, '.agents/skill-doc-links.json'),
      JSON.stringify({
        schemaVersion: 1,
        repository,
        revision,
        targets: [{ path: 'skills/optional/SKILL.md', blob }],
        references: [{ file, link: '../optional/SKILL.md', target: 'skills/optional/SKILL.md' }]
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves only the registered source-link pair without installing the optional skill', () => {
    const references = loadSkillDocLinks(root)
    expect(checkDocLinks(root, path.join(root, file), references.resolve)).toEqual([])
    expect(references.resolve(file, '../optional/SKILL.md')).toBe(
      `${repository}/blob/${revision}/skills/optional/SKILL.md`
    )
    expect(references.resolve('README.md', '../optional/SKILL.md')).toBeUndefined()
    expect(references.resolve(file, '../typo/SKILL.md')).toBeUndefined()
    writeFileSync(path.join(root, 'README.md'), '[broken](.agents/skills/optional/SKILL.md)')
    expect(checkDocLinks(root, path.join(root, 'README.md'), references.resolve)).toHaveLength(1)
    expect(references.finish()).toBe(2)
  })

  it('rejects a modified source while accepting checkout line-ending conversion', () => {
    writeFileSync(path.join(root, file), content.replace(/\n/g, '\r\n'))
    expect(() => loadSkillDocLinks(root)).not.toThrow()
    writeFileSync(path.join(root, file), `${content}[New link](../other/SKILL.md)`)
    expect(() => loadSkillDocLinks(root)).toThrow('source changed')
  })

  it('rejects version drift, misdirected mappings and stale entries', () => {
    const manifestPath = path.join(root, '.agents/skill-doc-links.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, revision: 'c'.repeat(40) }))
    expect(() => loadSkillDocLinks(root)).toThrow('not pinned')
    manifest.references[0].target = 'skills/different/SKILL.md'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(() => loadSkillDocLinks(root)).toThrow('Unregistered')
    manifest.references[0].target = 'skills/optional/SKILL.md'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(() => loadSkillDocLinks(root).finish()).toThrow('Unused skill references')
  })

  it('checks the remote path and Git blob and fails on missing or changed targets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          truncated: false,
          tree: [{ path: 'skills/optional/SKILL.md', type: 'blob', sha: blob }]
        })
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadSkillDocLinks(root).verifyUpstream()).resolves.toBeUndefined()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          truncated: false,
          tree: [{ path: 'skills/optional/SKILL.md', type: 'blob', sha: 'd'.repeat(40) }]
        })
      )
    )
    await expect(loadSkillDocLinks(root).verifyUpstream()).rejects.toThrow('does not match')
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(loadSkillDocLinks(root).verifyUpstream()).rejects.toThrow('HTTP 404')
  })
})
