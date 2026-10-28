import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import * as ts from 'typescript'
import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { GlobalCache, ProjectOptions } from './CommandLineOptions'
import {
  languageForFileName,
  prettyMilliseconds,
  ProjectIndexer,
} from './ProjectIndexer'
import { indexCommand } from './main'
import { scip } from './scip'

function minute(x: number): number {
  return x * 60 * 1000
}
function second(x: number): number {
  return x * 1000
}

test('prettyMilliseconds', () => {
  assert.is(prettyMilliseconds(0), '0ms')
  assert.is(prettyMilliseconds(1), '1ms')
  assert.is(prettyMilliseconds(second(1)), '1s 0ms')
  assert.is(prettyMilliseconds(second(1) + 300), '1s 300ms')
  assert.is(prettyMilliseconds(second(2)), '2s 0ms')
  assert.is(prettyMilliseconds(second(5)), '5s 0ms')
  assert.is(prettyMilliseconds(minute(1)), '1m 0s 0ms')
  assert.is(prettyMilliseconds(minute(2)), '2m 0s 0ms')
  assert.is(prettyMilliseconds(minute(5)), '5m 0s 0ms')
  assert.is(prettyMilliseconds(minute(60)), '60m 0s 0ms')
  assert.is(prettyMilliseconds(minute(5) + second(8) + 999), '5m 8s 999ms')
})

test('languageForFileName', () => {
  assert.is(languageForFileName('index.ts'), 'TypeScript')
  assert.is(languageForFileName('index.mts'), 'TypeScript')
  assert.is(languageForFileName('index.cts'), 'TypeScript')
  assert.is(languageForFileName('index.tsx'), 'TypeScriptReact')
  assert.is(languageForFileName('index.js'), 'JavaScript')
  assert.is(languageForFileName('index.mjs'), 'JavaScript')
  assert.is(languageForFileName('index.cjs'), 'JavaScript')
  assert.is(languageForFileName('index.jsx'), 'JavaScriptReact')
  assert.is(languageForFileName('package.json'), 'JSON')
  assert.is(languageForFileName('Component.svelte'), undefined)
})

test('TsrsProgram resolves declaration handles to source nodes', async () => {
  const { TsrsProgram } = await import('./TsrsProgram.mjs')
  const fileName = path.resolve('snapshots/input/syntax/src/function.ts')
  const program = new TsrsProgram({
    fileNames: [fileName],
    options: { noEmit: true },
  } as ts.ParsedCommandLine)

  try {
    const sourceFile = program.getSourceFile(fileName)
    assert.ok(sourceFile)
    const position = sourceFile.text.indexOf('newFunction')
    assert.ok(position >= 0)
    const node = sourceFile.statements[0] as ts.FunctionDeclaration
    assert.equal(node.name!.getStart(), position)
    const symbol = program.checker.getSymbolAtLocation(node.name!)
    assert.ok(symbol)
    const declaration = symbol.declarations?.[0]
    assert.ok(declaration)
    assert.equal(declaration.getSourceFile().fileName, fileName)
  } finally {
    program.dispose()
  }
})

test('only deduplicates documents after successful emission', () => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'scip-typescript-project-')
  )
  try {
    const fileName = path.join(projectRoot, 'index.ts')
    fs.writeFileSync(fileName, 'export const value = 1\n')
    const cache: GlobalCache = {
      sources: new Map(),
      parsedCommandLines: new Map(),
      indexedFiles: new Set(),
    }
    const options: ProjectOptions = {
      cwd: projectRoot,
      projectRoot,
      projectDisplayName: projectRoot,
      output: path.join(projectRoot, 'index.scip'),
      inferTsconfig: false,
      progressBar: false,
      yarnWorkspaces: false,
      yarnBerryWorkspaces: false,
      pnpmWorkspaces: false,
      globalCaches: false,
      indexedProjects: new Set(),
      writeIndex: () => {
        throw new Error('emission failed')
      },
    }
    const config: ts.ParsedCommandLine = {
      options: {},
      fileNames: [fileName],
      errors: [],
    }

    assert.throws(
      () => new ProjectIndexer(config, options, cache).index(),
      /emission failed/
    )
    assert.not.ok(cache.indexedFiles.has(fileName))
  } finally {
    fs.rmSync(projectRoot, { recursive: true })
  }
})

test('native CLI preserves JSDoc URLs, qualified heritage and UTF-16 references', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'scip-tsrs-cli-'))
  try {
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ files: ['index.ts'] })
    )
    const callLine =
      "const emoji = '😀'; export const result = closure(emoji)()"
    fs.writeFileSync(
      path.join(cwd, 'index.ts'),
      [
        '/**',
        ' * Return a closure.',
        ' * @see https://example.com/reference#details',
        ' */',
        'export function closure(value: string): () => number {',
        '  return () => value.length',
        '}',
        callLine,
        'export namespace shapes { export interface Base<T> { value: T } }',
        'export interface Derived extends shapes.Base<string> {}',
        "export class Implementation implements Derived { value = '' }",
      ].join('\n')
    )
    const output = path.join(cwd, 'index.scip')
    await indexCommand([], {
      cwd,
      output,
      inferTsconfig: false,
      progressBar: false,
      yarnWorkspaces: false,
      yarnBerryWorkspaces: false,
      pnpmWorkspaces: false,
      globalCaches: true,
      indexedProjects: new Set(),
    })
    const index = scip.Index.deserializeBinary(fs.readFileSync(output))
    assert.equal(index.documents.length, 1)
    assert.equal(index.metadata?.tool_info?.arguments, ['--backend', 'tsrs'])
    const document = index.documents[0]
    const closure = document.symbols.find(symbol =>
      symbol.symbol.endsWith('/closure().')
    )
    assert.ok(closure)
    assert.equal(closure.documentation, [
      '```ts\nfunction closure(value: string): () => number\n```',
      'Return a closure.',
    ])
    const position = callLine.indexOf('closure')
    assert.equal(
      document.occurrences
        .filter(
          occurrence =>
            occurrence.symbol === closure.symbol &&
            occurrence.symbol_roles === 0
        )
        .map(occurrence => occurrence.range),
      [[7, position, position + 'closure'.length]]
    )
    const implementation = document.symbols.find(symbol =>
      symbol.symbol.endsWith('/Implementation#')
    )
    assert.ok(implementation)
    assert.equal(
      implementation.relationships.map(relationship => relationship.symbol),
      [
        'scip-typescript npm . . `index.ts`/Derived#',
        'scip-typescript npm . . `index.ts`/shapes/Base#',
      ]
    )
  } finally {
    fs.rmSync(cwd, { recursive: true })
  }
})

test('failed native compiler startup removes a partially written index', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'scip-tsrs-failure-'))
  const previousExitCode = process.exitCode
  try {
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ files: ['index.ts'] })
    )
    fs.writeFileSync(path.join(cwd, 'index.ts'), 'export const value = 1')
    const output = path.join(cwd, 'index.scip')
    let failure: unknown
    try {
      await indexCommand([], {
        cwd,
        output,
        tsrsPath: path.join(cwd, 'missing-native-compiler'),
        inferTsconfig: false,
        progressBar: false,
        yarnWorkspaces: false,
        yarnBerryWorkspaces: false,
        pnpmWorkspaces: false,
        globalCaches: true,
        indexedProjects: new Set(),
      })
    } catch (error) {
      failure = error
    }
    assert.instance(failure, Error)
    assert.match((failure as Error).message, /ENOENT|spawn|executable/i)
    assert.equal(fs.existsSync(output), false)
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = previousExitCode
    fs.rmSync(cwd, { recursive: true })
  }
})

test('failure in a later project removes documents emitted by earlier projects', async () => {
  const cwd = fs.mkdtempSync(
    path.join(os.tmpdir(), 'scip-tsrs-project-failure-')
  )
  const previousExitCode = process.exitCode
  try {
    const first = path.join(cwd, 'first')
    const second = path.join(cwd, 'second')
    fs.mkdirSync(first)
    fs.mkdirSync(second)
    fs.writeFileSync(
      path.join(first, 'tsconfig.json'),
      JSON.stringify({ files: ['index.ts'] })
    )
    fs.writeFileSync(path.join(first, 'index.ts'), 'export const value = 1')
    fs.writeFileSync(path.join(second, 'tsconfig.json'), '{')
    const output = path.join(cwd, 'index.scip')
    let failure: unknown
    try {
      await indexCommand([first, second], {
        cwd,
        output,
        inferTsconfig: false,
        progressBar: false,
        yarnWorkspaces: false,
        yarnBerryWorkspaces: false,
        pnpmWorkspaces: false,
        globalCaches: true,
        indexedProjects: new Set(),
      })
    } catch (error) {
      failure = error
    }
    assert.instance(failure, Error)
    assert.match((failure as Error).message, /second[/\\]tsconfig\.json/)
    assert.equal(fs.existsSync(output), false)
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = previousExitCode
    fs.rmSync(cwd, { recursive: true })
  }
})

test.run()
