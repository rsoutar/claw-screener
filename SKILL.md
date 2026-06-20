---
name: claw-screener
description: Stock screener combining Williams %R oversold signals with Warren Buffett-style fundamental analysis. Supports US (S&P 500) and Thai (SET) markets. Use when screening stocks, finding oversold quality picks, running Buffett formula analysis, Carlson compounder scans, or managing a stock watchlist.
homepage: https://github.com/rsoutar/claw-screener
version: 1.0.0
platforms: [macos, linux]
compatibility: Requires Node.js >=20, npm, and network access for SEC EDGAR and Yahoo Finance data.
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins: ["node"]
  clawdbot:
    emoji: "📊"
    requires:
      env: []
      files:
        - ~/.claw-screener-watchlist.json
        - sec_cache.db
        - price_cache.db
      runtime: node >=20
      config_paths: ~/.claw-screener-watchlist.json
  hermes:
    emoji: "📊"
    tags: [stocks, finance, screening, buffett, technical-analysis]
    category: finance
    requires_toolsets: [terminal]
    config:
      - key: repo_path
        description: Path to the claw-screener repository root (directory containing package.json)
        default: "~/.hermes/skills/finance/claw-screener"
        prompt: Where is the claw-screener repository cloned?
---

# Claw-Screener

A stock screener that combines technical analysis (Williams %R oversold signals) with Warren Buffett-style fundamental analysis using SEC data. Supports US (S&P 500) and Thai (SET) markets.

## When to Use

Use this skill when you need to:
- Find oversold stocks with strong fundamentals
- Screen for quality stocks using Buffett's 10 formulas
- Screen for long-term compounders using Carlson filters (ROIC, growth, buybacks)
- Analyze individual stocks for investment decisions
- Get daily stock screening results in text, JSON, or Telegram format

## Installation

This skill ships the full repository — scripts, dependencies, and caches live in the repo root. Run all commands from that directory.

### OpenClaw / Clawdbot

```bash
openclaw skills install git:rsoutar/claw-screener@main
cd {baseDir} && npm install
```

### Hermes Agent

Option A — clone into the Hermes skills directory (recommended):

```bash
git clone https://github.com/rsoutar/claw-screener.git ~/.hermes/skills/finance/claw-screener
cd ~/.hermes/skills/finance/claw-screener && npm install
```

Option B — point Hermes at an existing clone via `~/.hermes/config.yaml`:

```yaml
skills:
  external_dirs:
    - ~/Projects/claw-screener
```

Then run `npm install` in that directory. Invoke with `/claw-screener` or ask Hermes to screen stocks.

If the repo lives elsewhere, set `skills.config.claw-screener.repo_path` in `config.yaml` (or run `hermes skills config claw-screener`).

### Working Directory

Before running any command below, `cd` to the repository root:

- **OpenClaw:** `cd {baseDir}`
- **Hermes:** `cd` to `skills.config.claw-screener.repo_path` (default `~/.hermes/skills/finance/claw-screener`)

## Tools

This skill provides the following capabilities:

### 1. Combined Screening
Finds stocks that are both technically oversold (Williams %R < -80) and fundamentally strong (Buffett score >= threshold).

**Command:**
```
npm run screening [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market: `us` or `bk` | `us` |
| `--min-score` | Minimum Buffett score (0-10) | `5` |
| `--top-n` | Number of results to show | `10` |
| `--format` | Output: `text`, `json`, `telegram` | `text` |
| `--add-top` | Add top N screening picks to the watchlist | off |

**Examples:**
```
npm run screening
npm run screening -- --market us --min-score 7 --top-n 5
npm run screening -- --market bk
npm run screening -- --format json
npm run screening -- --format telegram
npm run screening -- --add-top 5
```

### 2. Technical Only Scan
Fast oversold scan using Williams %R indicator only. No SEC data required. Works for both US and Thai markets.

**Command:**
```
npm run technical [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market: `us` or `bk` | `us` |
| `--threshold` | Williams %R threshold | `-80` |
| `--top-n` | Number of results to show | `20` |
| `--format` | Output: `text`, `json`, `telegram` | `text` |

**Examples:**
```
npm run technical
npm run technical -- --threshold -70 --top-n 50
npm run technical -- --market bk
```

### 3. Analyze Stock
Deep analysis of a single stock using Buffett's 10 formulas.

**Command:**
```
npm run analyze -- <ticker> [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--format` | Output: `text`, `json`, `telegram` | `text` |

**Examples:**
```
npm run analyze -- AAPL
npm run analyze -- MSFT --format telegram
npm run analyze -- GOOGL --format json
npm run analyze -- PTT.BK
```

### 4. Compounding Machine
Screens for "compounders" using Carlson-style filters:
- Revenue and net income YoY trend strength
- ROIC threshold (default >15%)
- Share count reduction over 3 years (buyback signal)
- Operating margin threshold (default >20%)
- Includes current yield vs 5-year average and a simple 10-year DCF context

**Command:**
```
npm run compounder [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market universe: `us` or `bk` | `us` |
| `--tickers` | Comma-separated tickers (overrides market universe) | - |
| `--max-tickers` | Limit universe size | all |
| `--top-n` | Number of passing stocks to show | `25` |
| `--concurrency` | Parallel fetch workers | `4` |
| `--format` | Output: `text` or `json` | `text` |
| `--db-path` | SQLite cache path | `sec_cache.db` |
| `--ttl-days` | Cache TTL in days | `7` |
| `--min-roic` | ROIC threshold (%) | `15` |
| `--min-op-margin` | Operating margin threshold (%) | `20` |
| `--min-buyback` | Required 3Y share reduction (%) | `2` |
| `--show-rejected` | Include failed tickers with reasons in output | off |

**Examples:**
```
npm run compounder
npm run compounder -- --tickers AAPL,MSFT,NVDA --top-n 10
npm run compounder -- --format json --max-tickers 100
npm run compounder -- --tickers PLTR --show-rejected
```

**Runtime / Caching Notes:**
- First uncached run on full US universe can take ~20-30+ minutes.
- This is expected: each ticker requires multiple Yahoo fundamentals/quote requests and retry backoff for rate-limit resilience.
- Subsequent runs are much faster due to SQLite caching (`sec_cache.db`, TTL default 7 days).
- For quick checks, run smaller scans first (for example `--max-tickers 50` or specific `--tickers`).

**Agent Guidance for User Messaging:**
- If user runs full-universe Compounding Machine scan, explicitly warn that initial run may take ~20-30 minutes.
- Suggest quick-test alternatives while waiting:
  - `npm run compounder -- --max-tickers 50`
  - `npm run compounder -- --tickers AAPL,MSFT,NVDA`

### 5. Watchlist Management
Track stocks you're interested in, monitor live status, and get deduplicated alerts when they become oversold, overbought, or hit quality thresholds.

**Command:**
```
npm run watchlist:<command> -- [options]
```

**Commands:**

| Command | Description |
|---------|-------------|
| `add <ticker>` | Add one or more comma-separated stocks |
| `remove <ticker>` | Remove one or more comma-separated stocks |
| `update <ticker>` | Update notes, alert thresholds, or quality settings |
| `list` | Show all watched stocks |
| `status` | Fetch live price, Williams %R, combined score, and status |
| `check` | Check for oversold, quality, overbought, and custom-threshold alerts |

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market us\|th` | Market filter: `us` (US) or `th` (Thai) | all markets |
| `--notes '...'` | Optional notes | - |
| `--alert-threshold` | Williams %R threshold for alerts | - |
| `--min-buffett-score` | Buffett score threshold for quality alerts | - |
| `--fundamentals` | Include Buffett score in status (US stocks only, slower) | off |
| `--format text\|json\|telegram` | Output format (list, status, check) | `text` |
| `--repeat-alerts` | Re-emit alerts even if unchanged since last check | off |

**Exit codes (`check`):**
| Code | Meaning |
|------|---------|
| `0` | No new alerts |
| `1` | Fetch/check errors |
| `2` | New alerts fired |

**Examples:**
```
npm run watchlist:add -- AAPL,MSFT,NVDA
npm run watchlist:add -- AAPL --market us --notes 'Big tech' --min-buffett-score 6
npm run watchlist:add -- PTT.BK --market th
npm run watchlist:update -- AAPL --notes 'Core holding' --alert-threshold -85
npm run watchlist:remove -- AAPL
npm run watchlist:list
npm run watchlist:list -- --market us
npm run watchlist:status
npm run watchlist:status -- --fundamentals
npm run watchlist:status -- --market us --format telegram
npm run watchlist:check
npm run watchlist:check -- --min-buffett-score 5 --format telegram
npm run screening -- --add-top 5
```

**Scheduled monitoring example:**
```bash
npm run watchlist:check -- --format telegram
```

**Storage:** Watchlist is saved to `~/.claw-screener-watchlist.json`

## Buffett's 10 Formulas

The fundamental analysis evaluates stocks against Warren Buffett's criteria:

| # | Formula | Target | Description |
|---|---------|--------|-------------|
| 1 | Cash Test | > Total Debt | Cash covers all debt |
| 2 | Debt-to-Equity | < 0.5 | Low leverage |
| 3 | Return on Equity | > 15% | Efficient use of capital |
| 4 | Current Ratio | > 1.5 | Short-term liquidity |
| 5 | Operating Margin | > 12% | Operational efficiency |
| 6 | Asset Turnover | > 0.5 | Asset efficiency |
| 7 | Interest Coverage | > 3x | Ability to pay interest |
| 8 | Earnings Stability | Positive | Consistent profitability |
| 9 | Free Cash Flow | > 0 | Cash generation |
| 10 | Capital Allocation | > 15% ROE | Management effectiveness |

**Scoring:** Each passing formula earns 1 point. Maximum score: 10/10.

## Technical Indicator

**Williams %R (Williams Percent Range)**

- Range: -100 to 0
- Oversold: < -80 (potential buy signal)
- Overbought: > -20 (potential sell signal)

## Combined Score Formula

Combined score = (Technical Score × 0.3) + (Fundamental Score × 0.7)

- Technical Score: (Williams %R + 100) / 100
- Fundamental Score: (Buffett Score / 10) × 100

## Data Sources

- **US Stocks**: SEC EDGAR for fundamentals, Yahoo Finance for prices
- **Thai Stocks**: Yahoo Finance only (no SEC data available)

## Runtime Requirements

- **Node.js** (>=20) and **npm** — required to run TypeScript scripts via `tsx`

### Install Dependencies

From the repository root:

```bash
npm install
```

## File Persistence

This skill creates and manages the following files:

| File | Location | Purpose | TTL |
|------|----------|---------|-----|
| Watchlist | `~/.claw-screener-watchlist.json` | User's stock watchlist | Permanent |
| SEC Cache | `sec_cache.db` | Cached SEC EDGAR financial data | 7 days (default) |
| Price Cache | `price_cache.db` | Cached stock price data | 1 day (default) |

### Cache Management

- Cache files are automatically created on first run
- Use `--ttl-days` flag with compounding machine to adjust cache TTL
- Cache files can be deleted to force fresh data fetch
- Cache improves performance significantly on subsequent runs

### Notes
- First run on full US universe can take ~20-30+ minutes (expected behavior)
- Subsequent runs are much faster due to caching
- For quick tests, use `--max-tickers 50` or specific `--tickers`

## npm Scripts

```bash
npm run dev              # Run screening (alias for npm run screening)
npm run screening        # Run combined screening
npm run technical        # Run technical-only scan
npm run analyze          # Analyze a stock (requires ticker argument)
npm run compounder       # Run Compounding Machine screener
npm run watchlist:add    # Add stock(s) to watchlist
npm run watchlist:remove # Remove stock(s) from watchlist
npm run watchlist:update # Update watchlist settings
npm run watchlist:list   # List watched stocks
npm run watchlist:status # Live status for watched stocks
npm run watchlist:check  # Check watchlist alerts
npm run test             # Run unit tests
```

Pass CLI flags after `--`, for example: `npm run screening -- --market us --min-score 7`

## Output Format Examples

### Text (Default)
```
📊 Combined Quality Screening (US (S&P 500))
Technical: Oversold signals (Williams %R < -80)
Fundamental: Warren Buffett's 10 formulas on SEC data
Minimum Buffett Score: 5/10

Results:
  Total Scanned: 503
  Oversold Found: 42
  Quality Stocks: 8 (Buffett ≥5/10)

Top 10 Opportunities:

1. AAPL   — Combined: 85.2% | Buffett: 8/10 | WR: -82.3
2. MSFT   — Combined: 79.1% | Buffett: 7/10 | WR: -85.1
```

### Telegram
```
📊 Combined Quality Screening (US (S&P 500))
Scanned: 503 stocks
Oversold: 42
Quality (Buffett ≥5/10): 8

🌟 Top 10 Quality Opportunities:

1. **AAPL** — Combined: 85% | Buffett: 8/10 | WR: -82.3
2. **MSFT** — Combined: 79% | Buffett: 7/10 | WR: -85.1
```

## Pitfalls

- Full US universe compounding scans take ~20–30 minutes on first uncached run; use `--max-tickers` or `--tickers` for quick tests.
- Thai market (`bk`) uses Yahoo Finance only — no SEC fundamental data.
- Commands fail if run outside the repo root or before `npm install`.
- Yahoo rate limits can slow bulk scans; SQLite caches (`sec_cache.db`, `price_cache.db`) speed up repeat runs.

## Verification

From the repository root:

```bash
npm run analyze -- AAPL --format json
npm run technical -- --market us --top-n 3
```

A successful run prints JSON analysis or a short list of oversold tickers.
