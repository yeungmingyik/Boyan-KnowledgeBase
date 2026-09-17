import * as fs from 'fs'
import * as path from 'path'

import { type BrokenDocLink, checkDocLinks } from './docLinks'
import { loadSkillDocLinks } from './skillDocLinks'

const ROOT = path.resolve(__dirname, '..')

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, .git, out, dist
      if (['node_modules', '.git', 'out', 'dist'].includes(entry.name)) continue
      results.push(...findMarkdownFiles(fullPath))
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results
}

async function main() {
  const scanDirs = ['docs', 'src', 'packages', '.agents'].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d))

  let allFiles: string[] = []
  for (const dir of scanDirs) {
    allFiles.push(...findMarkdownFiles(dir))
  }

  // Also check root-level markdown files
  const rootMdFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.md') && fs.statSync(path.join(ROOT, f)).isFile())
  allFiles.push(...rootMdFiles.map((f) => path.join(ROOT, f)))

  // Deduplicate
  allFiles = [...new Set(allFiles)]

  console.log(`Checking ${allFiles.length} markdown files for broken links...`)

  const references = loadSkillDocLinks(ROOT)
  if (process.argv.includes('--verify-upstream')) await references.verifyUpstream()
  const allBroken: BrokenDocLink[] = []
  for (const file of allFiles) {
    allBroken.push(...checkDocLinks(ROOT, file, references.resolve))
  }
  const referenceCount = references.finish()

  if (allBroken.length === 0) {
    process.stdout.write(
      `Local links are valid; ${referenceCount} optional skill links resolve to pinned upstream sources.\n`
    )
    process.exit(0)
  }

  console.error(`\nFound ${allBroken.length} broken link(s):\n`)
  for (const b of allBroken) {
    console.error(`  ${b.file}:${b.line}`)
    console.error(`    Link: ${b.link}`)
    console.error(`    Resolved to: ${b.resolvedPath}\n`)
  }

  process.exit(1)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Document link check failed'}\n`)
  process.exitCode = 1
})
