import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import * as z from 'zod'

const RelativePathSchema = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+$/)
const SourceSchema = z.object({
  repository: z.url().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
  revision: z.string().regex(/^[a-f0-9]{40}$/)
})
const ReferenceManifestSchema = SourceSchema.extend({
  schemaVersion: z.literal(1),
  targets: z.array(z.strictObject({ path: RelativePathSchema, blob: z.string().regex(/^[a-f0-9]{40}$/) })),
  references: z.array(z.strictObject({ file: RelativePathSchema, link: z.string().min(1), target: RelativePathSchema }))
})
const SkillsLockSchema = z.object({
  skills: z.array(
    SourceSchema.extend({
      installed_path: RelativePathSchema,
      source_path: RelativePathSchema,
      files: z.array(z.object({ path: RelativePathSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
    })
  )
})

export function loadSkillDocLinks(root: string) {
  const manifest = ReferenceManifestSchema.parse(
    JSON.parse(readFileSync(path.join(root, '.agents/skill-doc-links.json'), 'utf8'))
  )
  const lock = SkillsLockSchema.parse(JSON.parse(readFileSync(path.join(root, '.agents/skills.lock.json'), 'utf8')))
  const targets = new Map(manifest.targets.map((target) => [target.path, target.blob]))
  if (targets.size !== manifest.targets.length) throw new Error('Duplicate skill reference targets')
  const references = new Map<string, { url: string; used: boolean }>()
  const usedTargets = new Set<string>()
  for (const reference of manifest.references) {
    const skill = lock.skills.find((entry) => reference.file.startsWith(`${entry.installed_path}/`))
    if (!skill || skill.repository !== manifest.repository || skill.revision !== manifest.revision)
      throw new Error(`Skill reference source is not pinned: ${reference.file}`)
    const relative = path.posix.relative(skill.installed_path, reference.file)
    const sourceFile = skill.files.find((file) => file.path === relative)
    const content = readFileSync(path.join(root, reference.file), 'utf8').replace(/\r\n/g, '\n')
    if (!sourceFile || createHash('sha256').update(content).digest('hex') !== sourceFile.sha256)
      throw new Error(`Skill reference source changed: ${reference.file}`)
    const target = path.posix.normalize(
      path.posix.join(skill.source_path, path.posix.dirname(relative), reference.link)
    )
    if (target !== reference.target || !targets.has(target))
      throw new Error(`Unregistered skill reference target: ${reference.file} -> ${reference.link}`)
    const key = `${reference.file}\0${reference.link}`
    if (references.has(key)) throw new Error(`Duplicate skill reference: ${reference.file} -> ${reference.link}`)
    references.set(key, { url: `${manifest.repository}/blob/${manifest.revision}/${target}`, used: false })
    usedTargets.add(target)
  }
  if (usedTargets.size !== targets.size) throw new Error('Unused skill reference targets')
  let resolvedCount = 0
  return {
    resolve(file: string, link: string): string | undefined {
      const reference = references.get(`${file}\0${link}`)
      if (!reference) return undefined
      reference.used = true
      resolvedCount++
      return reference.url
    },
    finish(): number {
      if ([...references.values()].some((reference) => !reference.used))
        throw new Error('Unused skill references; update .agents/skill-doc-links.json')
      return resolvedCount
    },
    async verifyUpstream(): Promise<void> {
      const repository = new URL(manifest.repository).pathname.slice(1)
      const response = await fetch(
        `https://api.github.com/repos/${repository}/git/trees/${manifest.revision}?recursive=1`,
        {
          signal: AbortSignal.timeout(30_000)
        }
      )
      if (!response.ok) throw new Error(`Upstream reference verification failed: HTTP ${response.status}`)
      const tree = z
        .object({
          truncated: z.literal(false),
          tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() }))
        })
        .parse(await response.json())
      for (const [target, blob] of targets) {
        if (!tree.tree.some((entry) => entry.path === target && entry.type === 'blob' && entry.sha === blob))
          throw new Error(`Upstream skill reference does not match: ${target}`)
      }
    }
  }
}
