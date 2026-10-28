# scip-typescript — tsrs fork

[SCIP](https://github.com/sourcegraph/scip) indexer for TypeScript and JavaScript.

This fork uses [`tsrs`](https://github.com/oxc-project/tsrs), a Rust port of the
TypeScript 7 compiler, for symbol and type resolution by default. It reuses the
upstream SCIP emitter through a compiler API adapter. TypeScript is retained for
tsconfig parsing, syntax nodes, and standard-library declarations; the tsrs
backend never creates a TypeScript checker or falls back to one.

The pinned compiler is `tsrs@0.20.1-ts7.1.0-beta`. Its TypeScript 7 semantics
include intentional changes from TypeScript 6: legacy constructor-function and
prototype-member inference is no longer supported. See Microsoft's
[JavaScript compatibility notes](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md).
Such code can have fewer references than the upstream TypeScript 6 indexer.
Lone-surrogate string types also have escaped hover text. The snapshot suite
tests both backends, sharing expected output except for these documented
differences. Native expectations were verified with the pinned Go reference
compiler (`3e9236361fa97a9e6c685f4833ac457ae2d8c50a`).

Use `--backend typescript` only when explicitly comparing with the original
indexer. `--tsrs-path /path/to/tsrs` selects a custom native compiler build.
No performance improvement is claimed: the adapter makes synchronous semantic
queries and still parses syntax in JavaScript.

## Quick start

### Installation

```sh
git clone --branch codex/tsrs-migration https://github.com/adrianfalleiro/scip-typescript.git
cd scip-typescript
yarn install --frozen-lockfile
yarn build
yarn link
```

Currently, Node v22 and Node v24 are supported. <!-- Source of truth: .github/workflows/ci.yml -->

### Indexing a TypeScript project

Navigate to the project root, containing `tsconfig.json`.

```sh
npm install # or yarn install
scip-typescript index
```

### Indexing a JavaScript project

Navigate to the project root, containing `package.json`.

```sh
npm install # or yarn install
scip-typescript index --infer-tsconfig
```

To improve the quality of indexing results for JavaScript,
consider adding `@types/*` packages as `devDependencies` in `package.json`.

### Index a TypeScript project using Yarn workspaces

Navigate to the project root, containing `package.json`.

```sh
yarn install

scip-typescript index --yarn-workspaces
```

### Index a TypeScript project using pnpm workspaces

Navigate to the project root, containing `package.json`.

```sh
pnpm install

scip-typescript index --pnpm-workspaces
```

### Indexing in CI

Add the following run steps to your CI pipeline:

```sh
# Build/link this fork as above, then install the uploader:
npm install -g @sourcegraph/src
npm install # or yarn install
scip-typescript index
# Upload index with any necessary tokens (shown here using GitHub workflow syntax)
src code-intel upload -github-token='${{ secrets.GITHUB_TOKEN }}' -no-progress
```

For more examples, see the
[Sourcegraph docs](https://docs.sourcegraph.com/code_intelligence/how-to/index_a_typescript_and_javascript_repository).

### Troubleshooting stalled progress

If `scip-typescript index` is not showing progress, try running it again with
the `--progress-bar` flag. The progress bar prints out the current file being
indexed that could reveal details why progress is stalling. The progress bar
is disabled by default because it prints out a lot of noise in CI logs, and
the most common environment to run scip-typescript is in CI.

### Dealing with out of memory issues (OOM)

You may experience OOM issues when indexing large codebases

```
<--- JS stacktrace --->

FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
 1: 0xb7b150 node::Abort() [node]
 2: 0xa8c89a  [node]
 3: 0xd62ea0 v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, bool) [node]
 4: 0xd63247 v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, bool) [node]
 5: 0xf40945  [node]
 6: 0xf52e2d v8::internal::Heap::CollectGarbage(v8::internal::AllocationSpace, v8::internal::GarbageCollectionReason, v8::GCCallbackFlags) [node]
 ...
```

To fix this problem, try one of the following steps:

- Add `--no-global-caches` to the index command like this `scip-typescript
index --no-global-caches REST_OF_THE_COMMAND`. By default, scip-typescript
  caches symbol indexing across TypeScript projects to speed up indexing. This
  cache increases the memory footprint, which can cause OOM. Disabling this cache
  slows down indexing but reduces the memory footprint.
- Increase memory to the Node.js process by running scip-typescript like this
  `node --max-old-space-size=16000 "$(which scip-typescript)" index REST_OF_COMMAND`.
  Replace 16000 with an even larger number if your computer has bigger RAM.

## Migrating from lsif-node

Before creating scip-typescript, we used another TypeScript indexer called
[lsif-node](https://github.com/sourcegraph/lsif-node). We recommend migrating
to scip-typescript if you are using lsif-node.

Follow the steps below to migrate from lsif-node to scip-typescript:

- Replace usages of the `lsif-tsc -p ARGUMENTS` command with `scip-typescript index ARGUMENTS`.
- Upgrade to the latest version of the `src` command-line interface, which you
  can install via `yarn global add @sourcegraph/src`. It’s okay if the version
  of your `src` command-line interface does not match the version of your
  Sourcegraph instance.

## Contributing

See [Development.md](./Development.md) for docs on how to work on this project.

Contributors should follow the [Sourcegraph Community Code of Conduct](https://sourcegraph.notion.site/Sourcegraph-Community-Code-of-Conduct-c7cef6b270c84fb2882808d4d82995dd).
