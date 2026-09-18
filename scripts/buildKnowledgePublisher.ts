import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { build } from 'vite'

async function main() {
  const directory = path.resolve('.context/distribution/knowledge-publisher')
  await mkdir(directory, { recursive: true })
  const result = await build({
    configFile: false,
    resolve: { conditions: ['node'] },
    build: {
      target: 'node24',
      outDir: directory,
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: path.resolve('scripts/knowledge-publisher/cli.ts'),
        formats: ['cjs'],
        fileName: () => 'publisher.cjs'
      },
      rollupOptions: { external: (id) => id.startsWith('node:') || ['fs', 'path', 'child_process'].includes(id) }
    }
  })
  for (const file of ['Publisher.ps1', 'FeishuLogin.ps1', 'launch.cmd', 'publisher.example.json', 'README.md']) {
    await copyFile(path.join('scripts/knowledge-publisher', file), path.join(directory, file))
  }
  await copyFile('LICENSE', path.join(directory, 'LICENSE'))
  const packages = new Set<string>()
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) continue
    for (const chunk of output.output) {
      if (chunk.type !== 'chunk') continue
      for (const id of Object.keys(chunk.modules)) {
        if (!id.includes('node_modules') || id.startsWith('\0')) continue
        let root = path.dirname(id)
        while (root.includes('node_modules')) {
          if (
            await stat(path.join(root, 'package.json')).then(
              async () => Boolean(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).name),
              () => false
            )
          ) {
            packages.add(root)
            break
          }
          root = path.dirname(root)
        }
      }
    }
  }
  const licenses: string[] = []
  for (const root of [...packages].sort()) {
    const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
    const names = (await readdir(root)).filter((name) => /^(licen[sc]e|copying)(\.|$)/i.test(name))
    if (!names.length) throw new Error(`Dependency license missing: ${metadata.name}`)
    licenses.push(
      `${metadata.name} ${metadata.version}\n${(await Promise.all(names.map((name) => readFile(path.join(root, name), 'utf8')))).join('\n')}`
    )
  }
  await writeFile(path.join(directory, 'THIRD-PARTY-LICENSES.txt'), licenses.join('\n\n'))
  const files = [
    'LICENSE',
    'scripts/buildKnowledgePublisher.ts',
    'scripts/feishuCliReader.ts',
    'scripts/collectFeishuDocuments.ts',
    'scripts/publishFeishuPackage.ts',
    'scripts/signFeishuRelease.ts',
    'src/main/utils/feishuRelease.ts',
    'src/shared/types/feishuPackage.ts',
    'src/shared/utils/feishuPackage.ts',
    ...(await readdir('scripts/knowledge-publisher')).map((name) => `scripts/knowledge-publisher/${name}`)
  ]
  for (const file of files) {
    const destination = path.join(directory, 'source', file)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(file, destination)
  }
  const manifest = JSON.parse(await readFile('package.json', 'utf8'))
  const dependencies = Object.fromEntries(
    ['cross-spawn', 'semver', 'zod', 'tsx', 'vite'].map((name) => [
      name,
      manifest.dependencies[name] ?? manifest.devDependencies[name]
    ])
  )
  await writeFile(
    path.join(directory, 'source/package.json'),
    JSON.stringify(
      {
        name: 'boyan-knowledge-publisher',
        version: manifest.version,
        private: true,
        scripts: { build: 'tsx scripts/buildKnowledgePublisher.ts' },
        dependencies
      },
      null,
      2
    )
  )
  process.stdout.write(`${directory}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Publisher build failed'}\n`)
  process.exitCode = 1
})
