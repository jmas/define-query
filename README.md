# define-query monorepo

npm workspaces for [**define-query**](packages/define-query/) — a thin helper for TanStack Query — and a live demo app.

> Library docs: [English](packages/define-query/README.md) · [Українська](packages/define-query/README.uk.md)

## Packages

| Package | Description |
|---------|-------------|
| [`define-query`](packages/define-query/) | Publishable library. Factories for native `queryOptions` / `mutationOptions`, optimistic updates, sync, row state. |
| [`define-query-demo`](packages/define-query-demo/) | Private Vite + React app showcasing timeline, posts, and comments. |

## Commands

From the repo root:

```bash
npm install
npm test          # library tests
npm run build     # build define-query → packages/define-query/dist/
npm run dev       # start the demo (HMR, aliases lib source)
npm run build:demo # build lib + demo
npm run lint
```

Run a workspace script directly:

```bash
npm run dev -w define-query-demo
npm run build -w define-query
```

## Layout

```
packages/
├── define-query/       # library source, tests, tsup build
└── define-query-demo/  # demo app (depends on define-query)
```

The root `package.json` is private — it orchestrates workspaces only. Consumers install **`define-query`** from npm, not this repo name.
