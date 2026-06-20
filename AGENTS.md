# AGENTS.md

Guidance for AI agents working in this repository.

## Build & Verification Commands

Always run these before considering work complete:

```bash
npm run typecheck     # tsc --noEmit (type checking without emitting)
npm run lint          # eslint .
npm run format:check  # prettier --check .
npm test              # tsx --test test/**/*.test.ts
npm run build         # tsc (compile to dist/)
```

To auto-fix formatting and lint issues:

```bash
npm run format        # prettier --write .
npm run lint:fix      # eslint . --fix
```

## Architecture

- **Entry points**: `src/screening.ts`, `src/technicalOnly.ts`, `src/analyze.ts`, `src/compoundingMachine.ts`, `src/watchList.ts`
- **Shared types**: `src/types.ts` (`Market`, `OutputFormat`, `normalizeMarket`)
- **Fundamental analysis**: `src/formulas.ts` (Buffett 10), `src/secApi.ts` (SEC EDGAR client + `extractFinancialFacts`)
- **Technical indicators**: `src/technicalIndicators.ts` (Williams %R, EMA)
- **Caching**: `src/database.ts` (`SqliteCache<K,V>` generic class, `PriceDataManager`, `SECDataManager`)
- **Watchlist**: `src/watchList.ts`, `src/watchListUtils.ts`, `src/watchListTypes.ts`, `src/watchListPrices.ts`
- **Ticker universes**: `src/tickers.ts` (dispatcher), `src/sp500Tickers.ts`, `src/thaiTickers.ts`
- **Tests**: `test/*.test.ts` using `node:test` + `node:assert/strict`

## Conventions

- ESM (`"type": "module"`), strict TypeScript, Node >=20
- Use `.js` extensions in relative imports (NodeNext module resolution)
- No comments in code unless explicitly asked
- Tests use `node:test` (`describe`/`it`) and `node:assert/strict`
- Temp dirs for test isolation: `mkdtempSync(join(tmpdir(), "claw-..."))` with `afterEach` cleanup
- Cache DBs (`*.db`) are gitignored — never commit them
- Market type is `"us" | "th"`; CLI accepts `bk` as a backward-compat alias for `th` via `normalizeMarket()`
