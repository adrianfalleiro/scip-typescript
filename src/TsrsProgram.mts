import ts from 'typescript'
import path from 'node:path'
import { accessSync, constants } from 'node:fs'
import {
  API,
  type Program,
  type Checker,
  type Symbol as NativeSymbol,
  type Type as NativeType,
  type Signature as NativeSignature,
  type RawCompilerOptions,
  SymbolFlags,
  NodeBuilderFlags,
} from 'tsrs/sync'
import { type Node as NativeNode, SyntaxKind } from 'tsrs/ast'

/** Adapts tsrs semantics to the existing SCIP emitter's syntax-only TS AST. */
export class TsrsProgram {
  private readonly api: API
  private readonly program: Program
  private readonly nativeChecker: Checker
  private readonly files = new Map<string, ts.SourceFile>()
  private readonly nativeNodes = new Map<string, Map<string, NativeNode>>()
  private readonly locationSymbols = new WeakMap<
    ts.Node,
    NativeSymbol | undefined
  >()
  private readonly symbols = new Map<NativeSymbol, ts.Symbol>()
  private readonly nativeSymbols = new WeakMap<ts.Symbol, NativeSymbol>()
  private readonly types = new Map<NativeType, ts.Type>()
  private readonly nativeTypes = new WeakMap<ts.Type, NativeType>()
  private readonly signatures = new Map<NativeSignature, ts.Signature>()
  private readonly nativeSignatures = new WeakMap<
    ts.Signature,
    NativeSignature
  >()
  private readonly kinds = new Map<number, number>()
  private readonly rootFiles: Set<string>
  public readonly checker: ts.TypeChecker

  constructor(config: ts.ParsedCommandLine, compilerPath?: string) {
    this.rootFiles = new Set(config.fileNames)
    if (compilerPath) accessSync(compilerPath, constants.X_OK)
    this.api = new API({ tsserverPath: compilerPath })
    // Enum values differ between TypeScript 6 and tsrs's TypeScript 7 pin.
    for (const name of Object.keys(ts.SyntaxKind)) {
      const nativeKind = SyntaxKind[name as keyof typeof SyntaxKind]
      const syntaxKind = ts.SyntaxKind[name as keyof typeof ts.SyntaxKind]
      if (typeof nativeKind === 'number' && typeof syntaxKind === 'number') {
        this.kinds.set(nativeKind, syntaxKind)
      }
    }
    // Compiler option enum values are shared by these pinned compiler versions.
    // Use the same standard library as the baseline. tsrs otherwise loads libs
    // from a platform-specific package, producing platform-specific SCIP symbols.
    const libraries: string[] = []
    const seenLibraries = new Set<string>()
    const libraryDirectory = path.dirname(
      ts.getDefaultLibFilePath(config.options)
    )
    const addLibrary = (fileName: string): void => {
      if (seenLibraries.has(fileName)) return
      seenLibraries.add(fileName)
      const text = ts.sys.readFile(fileName)
      if (text === undefined)
        throw new Error(`Missing TypeScript library '${fileName}'`)
      for (const reference of ts.preProcessFile(text).libReferenceDirectives) {
        addLibrary(libraryPath(reference.fileName))
      }
      libraries.push(fileName)
    }
    const libraryPath = (name: string): string =>
      path.join(
        libraryDirectory,
        (ts as unknown as { libMap: Map<string, string> }).libMap.get(name) ??
          `lib.${name}.d.ts`
      )
    if (!config.options.noLib) {
      for (const fileName of config.options.lib ?? [
        path.basename(ts.getDefaultLibFilePath(config.options)),
      ]) {
        addLibrary(path.join(libraryDirectory, fileName))
      }
    }
    const raw = {
      ...config.options,
      configFile: undefined,
      noLib: true,
      lib: undefined,
    }
    try {
      let program = this.api.createProgram(
        [...libraries, ...config.fileNames],
        raw as unknown as RawCompilerOptions
      )
      // Dependencies (not just the root tsconfig) can request additional libs,
      // e.g. @types/node's es2020 references. Include those from the same package.
      if (!config.options.noLib) {
        for (;;) {
          const count = libraries.length
          for (const fileName of program.getSourceFileNames()) {
            const text = ts.sys.readFile(fileName)
            if (text === undefined) continue
            for (const reference of ts.preProcessFile(text)
              .libReferenceDirectives) {
              addLibrary(libraryPath(reference.fileName))
            }
          }
          if (count === libraries.length) break
          program.dispose()
          program = this.api.createProgram(
            [...libraries, ...config.fileNames],
            raw as unknown as RawCompilerOptions
          )
        }
      }
      this.program = program
      this.nativeChecker = this.program.getProject().checker
    } catch (error) {
      this.api.close()
      throw error
    }
    const checker: Partial<ts.TypeChecker> = {
      getSymbolAtLocation: node => {
        if (!node) return undefined
        let symbol = this.locationSymbols.has(node)
          ? this.locationSymbols.get(node)
          : node.kind === ts.SyntaxKind.ConstructorKeyword
            ? this.nativeChecker.getSymbolAtPosition(
                node.getSourceFile().fileName,
                node.getStart()
              )
            : this.nativeChecker.getSymbolAtLocation(this.nativeNode(node))
        if (
          !symbol &&
          ts.isStringLiteralLike(node) &&
          ts.isComputedPropertyName(node.parent) &&
          ts.isPropertyAssignment(node.parent.parent)
        ) {
          symbol = this.nativeChecker.getSymbolOfDeclaration(
            this.nativeNode(node.parent.parent) as Parameters<
              Checker['getSymbolOfDeclaration']
            >[0]
          )
        }
        return this.symbol(symbol)
      },
      getAliasedSymbol: symbol =>
        this.symbol(
          this.nativeChecker.getAliasedSymbol(this.unwrapSymbol(symbol))
        )!,
      getTypeAtLocation: node =>
        this.type(this.nativeChecker.getTypeAtLocation(this.nativeNode(node))),
      getDeclaredTypeOfSymbol: symbol =>
        this.type(
          this.nativeChecker.getDeclaredTypeOfSymbol(this.unwrapSymbol(symbol))
        ),
      getTypeOfSymbolAtLocation: (symbol, node) =>
        this.type(
          this.nativeChecker.getTypeOfSymbolAtLocation(
            this.unwrapSymbol(symbol),
            this.nativeNode(node)
          )
        ),
      getContextualType: node => {
        const result = this.nativeChecker.getContextualType(
          this.nativeNode(node) as Parameters<Checker['getContextualType']>[0]
        )
        return result && this.type(result)
      },
      getShorthandAssignmentValueSymbol: node =>
        node &&
        this.symbol(
          this.nativeChecker.getShorthandAssignmentValueSymbol(
            this.nativeNode(node)
          )
        ),
      resolveName: (name, location, meaning, excludeGlobals) =>
        this.symbol(
          this.nativeChecker.resolveName(
            name,
            meaning as unknown as SymbolFlags,
            location && this.nativeNode(location),
            excludeGlobals
          )
        ),
      getConstantValue: node =>
        this.nativeChecker.getConstantValue(this.nativeNode(node)),
      getSignatureFromDeclaration: node =>
        this.signature(
          this.nativeChecker.getSignatureFromDeclaration(this.nativeNode(node))
        ),
      getResolvedSignature: node =>
        this.signature(
          this.nativeChecker.getResolvedSignature(this.nativeNode(node))
        ),
      typeToString: type =>
        this.nativeChecker.typeToString(this.unwrapType(type)),
      signatureToString: signature => {
        const native = this.nativeSignatures.get(signature)!
        const declaration = this.nativeChecker.signatureToSignatureDeclaration(
          native,
          SyntaxKind.CallSignature,
          undefined,
          // Match the reference compiler's signatureToString formatting flags.
          NodeBuilderFlags.IgnoreErrors |
            NodeBuilderFlags.WriteTypeParametersInQualifiedName
        )
        if (!declaration) throw new Error('tsrs could not print a signature')
        const printed = this.api.printer.printNode(declaration)
        return printed.replace(/;$/, '')
      },
    }
    // FileIndexer uses only the methods above; no TypeScript Program or checker
    // is created. Keep the compatibility boundary here rather than in the emitter.
    this.checker = checker as ts.TypeChecker
  }

  public getSourceFileNames(): readonly string[] {
    return this.program
      .getSourceFileNames()
      .filter(name => this.rootFiles.has(name))
  }

  public getSourceFile(fileName: string): ts.SourceFile {
    const native = this.program.getSourceFile(fileName)
    if (!native) throw new Error(`tsrs did not load source file '${fileName}'`)
    const cached = this.files.get(native.fileName)
    if (cached) return cached
    const source = ts.createSourceFile(
      native.fileName,
      native.text,
      ts.ScriptTarget.Latest,
      true
    )
    this.files.set(native.fileName, source)
    if (this.rootFiles.has(native.fileName)) {
      // Match FileIndexer's traversal: getChildren() also includes JSDoc tokens
      // (including URLs), whose shapes differ between the two compiler ASTs.
      const locations: ts.Node[] = []
      const visit = (node: ts.Node): void => {
        if (
          ts.isIdentifier(node) ||
          ts.isPrivateIdentifier(node) ||
          ts.isStringLiteralLike(node)
        )
          locations.push(node)
        ts.forEachChild(node, visit)
      }
      visit(source)
      // One native request per file instead of one IPC round trip per identifier.
      const symbols = this.nativeChecker.getSymbolAtLocation(
        locations.map(node => this.nativeNode(node))
      )
      locations.forEach((node, index) =>
        this.locationSymbols.set(node, symbols[index])
      )
    }
    return source
  }

  public releaseFile(): void {
    // Nodes keep their identity for cross-file symbols, but native lookup maps
    // are only needed while visiting a document and can be rebuilt on demand.
    this.nativeNodes.clear()
  }

  private syntaxKind(node: NativeNode): number {
    let container = node
    while (container.kind === SyntaxKind.QualifiedName)
      container = container.parent
    // TypeScript 7 uses TypeReference/QualifiedName for interface heritage and
    // implements clauses; TypeScript 6 uses expression-shaped nodes there.
    if (
      container.kind === SyntaxKind.TypeReference &&
      container.parent?.kind === SyntaxKind.HeritageClause
    ) {
      if (node.kind === SyntaxKind.TypeReference)
        return ts.SyntaxKind.ExpressionWithTypeArguments
      if (node.kind === SyntaxKind.QualifiedName)
        return ts.SyntaxKind.PropertyAccessExpression
    }
    return this.kinds.get(node.kind) ?? -1
  }

  private static collect<
    N extends { getStart(): number; end: number; getChildren(): readonly N[] },
  >(root: N, kind: (node: N) => number): Map<string, N> {
    const nodes = new Map<string, N>()
    const visit = (node: N): void => {
      nodes.set(`${node.getStart()}:${node.end}:${kind(node)}`, node)
      for (const child of node.getChildren()) visit(child)
    }
    visit(root)
    return nodes
  }

  private nativeNode(node: ts.Node): NativeNode {
    const fileName = node.getSourceFile().fileName
    this.getSourceFile(fileName)
    let nodes = this.nativeNodes.get(fileName)
    if (!nodes) {
      nodes = TsrsProgram.collect<NativeNode>(
        this.program.getSourceFile(fileName)!,
        node => this.syntaxKind(node)
      )
      this.nativeNodes.set(fileName, nodes)
    }
    const result = nodes.get(`${node.getStart()}:${node.end}:${node.kind}`)
    if (!result)
      throw new Error(
        `tsrs AST mismatch at ${fileName}:${node.getStart()} (${ts.SyntaxKind[node.kind]})`
      )
    return result
  }

  private syntaxNode(node: NativeNode): ts.Declaration {
    const fileName = node.getSourceFile().fileName
    const source = this.getSourceFile(fileName)
    const start = node.getStart()
    const kind = this.syntaxKind(node)
    // Resolve a declaration through its first token's ancestors instead of
    // building whole-file maps for every dependency referenced by a document.
    let result: ts.Node | undefined = (
      ts as unknown as {
        getTokenAtPosition(source: ts.SourceFile, position: number): ts.Node
      }
    ).getTokenAtPosition(source, start)
    while (result) {
      if (
        result.getStart() === start &&
        result.end === node.end &&
        Number(result.kind) === kind
      )
        return result as ts.Declaration
      result = result.parent
    }
    throw new Error(
      `TypeScript AST mismatch at ${fileName}:${start} (${SyntaxKind[node.kind]})`
    )
  }

  private symbol(native: NativeSymbol | undefined): ts.Symbol | undefined {
    if (!native) return undefined
    const cached = this.symbols.get(native)
    if (cached) return cached
    const syntaxNode = (node: NativeNode): ts.Declaration =>
      this.syntaxNode(node)
    const result = {
      name: native.name,
      escapedName: native.escapedName as unknown as ts.__String,
      flags: native.flags as unknown as ts.SymbolFlags,
      get declarations() {
        return native.declarations.map(handle => syntaxNode(handle.resolve()!))
      },
      get valueDeclaration() {
        return (
          native.valueDeclaration &&
          syntaxNode(native.valueDeclaration.resolve()!)
        )
      },
      getFlags: () => native.flags as unknown as ts.SymbolFlags,
      getName: () => native.name,
      getEscapedName: () => native.escapedName as unknown as ts.__String,
      getDeclarations() {
        return this.declarations
      },
      getDocumentationComment: () => {
        const text = native
          .getDocumentationComment(this.nativeChecker)
          .replace(/(\{@link(?:code|plain)?\s+[^{}\s]+)}/g, '$1 }')
        return text ? [{ text, kind: 'text' }] : []
      },
      getJsDocTags: () =>
        native.getJsDocTags(this.nativeChecker).map(tag => ({
          ...tag,
          text:
            typeof tag.text === 'string'
              ? [
                  {
                    text: tag.text.replace(
                      /(\{@link(?:code|plain)?\s+[^{}\s]+)}/g,
                      '$1 }'
                    ),
                    kind: 'text',
                  },
                ]
              : tag.text,
        })),
    } as ts.Symbol
    this.symbols.set(native, result)
    this.nativeSymbols.set(result, native)
    return result
  }

  private unwrapSymbol(symbol: ts.Symbol): NativeSymbol {
    const native = this.nativeSymbols.get(symbol)
    if (!native) throw new Error('Expected a tsrs symbol')
    return native
  }

  private type(native: NativeType): ts.Type {
    const cached = this.types.get(native)
    if (cached) return cached
    const symbol = (): ts.Symbol | undefined => this.symbol(native.getSymbol())
    const result = {
      flags: native.flags as unknown as ts.TypeFlags,
      get symbol() {
        return symbol()
      },
      getSymbol: () => this.symbol(native.getSymbol()),
      getProperty: (name: string) => this.symbol(native.getProperty(name)),
      getNonNullableType: () => this.type(native.getNonNullableType()),
    } as ts.Type
    this.types.set(native, result)
    this.nativeTypes.set(result, native)
    return result
  }

  private unwrapType(type: ts.Type): NativeType {
    const native = this.nativeTypes.get(type)
    if (!native) throw new Error('Expected a tsrs type')
    return native
  }

  private signature(native: NativeSignature): ts.Signature {
    const cached = this.signatures.get(native)
    if (cached) return cached
    const result = {
      getParameters: () =>
        native.getParameters().map(symbol => this.symbol(symbol)!),
    } as ts.Signature
    this.signatures.set(native, result)
    this.nativeSignatures.set(result, native)
    return result
  }

  public dispose(): void {
    try {
      this.program.dispose()
    } finally {
      this.api.close()
    }
  }
}
