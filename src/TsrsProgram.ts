import type * as ts from 'typescript'

export interface TsrsSourceFile {
  fileName: string
  text: string
}

interface TsrsDeclaration {
  getSourceFile(): TsrsSourceFile
}

interface TsrsSymbol {
  declarations: readonly {
    resolve(): TsrsDeclaration | undefined
  }[]
}

interface TsrsChecker {
  getSymbolAtPosition(
    fileName: string,
    position: number
  ): TsrsSymbol | undefined
}

interface TsrsCompilerProgram {
  getProject(): { checker: TsrsChecker }
  getSourceFile(fileName: string): TsrsSourceFile | undefined
  dispose(): void
}

interface TsrsApi {
  createProgram(
    fileNames: readonly string[],
    options: Record<string, unknown>
  ): TsrsCompilerProgram
}

interface TsrsModule {
  API: new () => TsrsApi
}

/**
 * Owns the tsrs program and exposes the semantic data needed by a SCIP
 * backend. tsrs symbols refer to declarations through lazy NodeHandles, so
 * callers must resolve those handles before reading AST ranges.
 */
export class TsrsProgram {
  private constructor(
    private readonly program: TsrsCompilerProgram,
    public readonly checker: TsrsChecker
  ) {}

  public static async create(
    config: ts.ParsedCommandLine
  ): Promise<TsrsProgram> {
    const { API } = (await import('tsrs/sync')) as unknown as TsrsModule
    const program = new API().createProgram(
      config.fileNames,
      config.options as Record<string, unknown>
    )
    return new TsrsProgram(program, program.getProject().checker)
  }

  public getSourceFile(fileName: string): TsrsSourceFile {
    const sourceFile = this.program.getSourceFile(fileName)
    if (!sourceFile) {
      throw new Error(`tsrs did not load source file '${fileName}'`)
    }
    return sourceFile
  }

  public dispose(): void {
    this.program.dispose()
  }
}
