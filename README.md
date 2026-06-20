# Claw-Screener

Stock screener combining technical analysis (Williams %R oversold signals) with Warren Buffett-style fundamental analysis using SEC data. Supports US (S&P 500) and Thai (SET) markets.

## Installation

```bash
npm install
```

## Agent Skills

This repo includes a [Agent Skills](https://agentskills.io/specification)-compatible `SKILL.md` for AI agents.

### OpenClaw / Clawdbot

```bash
openclaw skills install git:rsoutar/claw-screener@main
cd <skill-dir> && npm install
```

### Hermes Agent

Clone the full repo (the skill needs the TypeScript sources, not just `SKILL.md`):

```bash
git clone https://github.com/rsoutar/claw-screener.git ~/.hermes/skills/finance/claw-screener
cd ~/.hermes/skills/finance/claw-screener && npm install
```

Or add an existing clone to `~/.hermes/config.yaml`:

```yaml
skills:
  external_dirs:
    - ~/Projects/claw-screener
```

Then use `/claw-screener` in chat, or ask Hermes to screen or analyze stocks. See `SKILL.md` for full command reference.

## Scripts

### 1. Combined Screening (`screening.ts`)

Runs both technical and fundamental analysis to find quality oversold stocks.

```bash
npm run screening [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market: `us` or `bk` | `us` |
| `--min-score` | Minimum Buffett score (0-10) | `5` |
| `--top-n` | Number of results to show | `10` |
| `--format` | Output: `text`, `json`, `telegram` | `text` |

**Examples:**

```bash
# US market, default settings
npm run screening

# US market, stricter fundamental requirements
npm run screening -- --market us --min-score 7 --top-n 5

# Thai market (technical only, no SEC data)
npm run screening -- --market bk

# JSON output for automation
npm run screening -- --format json

# Telegram format for messaging apps
npm run screening -- --format telegram
```

### 2. Technical Only (`technicalOnly.ts`)

Fast oversold scan using Williams %R indicator only. No SEC data required.

```bash
npm run technical [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market: `us` or `bk` | `us` |
| `--threshold` | Williams %R threshold (e.g., -80) | `-80` |
| `--top-n` | Number of results to show | `20` |
| `--format` | Output: `text`, `json`, `telegram` | `text` |

**Examples:**

```bash
# Default scan
npm run technical

# More oversold stocks
npm run technical -- --threshold -70 --top-n 50

# Thai market
npm run technical -- --market bk
```

### 3. Analyze Stock (`analyze.ts`)

Deep analysis of a single stock using Buffett's 10 formulas.

```bash
npm run analyze -- <ticker> [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--format` | Output: `text`, `json`, `telegram` | `text` |

**Examples:**

```bash
# Analyze a US stock
npm run analyze -- AAPL

# Analyze with Telegram format
npm run analyze -- MSFT --format telegram

# JSON for programmatic use
npm run analyze -- GOOGL --format json

# Analyze a Thai stock (uses Yahoo Finance)
npm run analyze -- PTT.BK
```

### 4. Compounding Machine (`compoundingMachine.ts`)

Screens for high-quality compounders using Carlson filters:

- Revenue and net income YoY growth trend
- ROIC > 15%
- Shares outstanding shrinking over 3 years (buybacks)
- Operating margin > 20%
- Includes yield-vs-5y and simple 10-year DCF valuation context

```bash
npm run compounder [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--market` | Market universe: `us` or `bk` | `us` |
| `--tickers` | Comma-separated tickers (overrides market universe) | - |
| `--max-tickers` | Limit number of tickers scanned | all |
| `--top-n` | Number of passing stocks to print | `25` |
| `--concurrency` | Parallel fetch workers | `4` |
| `--format` | Output: `text` or `json` | `text` |
| `--db-path` | SQLite cache path | `sec_cache.db` |
| `--ttl-days` | Cache TTL in days | `7` |
| `--min-roic` | ROIC threshold (%) | `15` |
| `--min-op-margin` | Operating margin threshold (%) | `20` |
| `--min-buyback` | Required 3Y share reduction (%) | `2` |
| `--show-rejected` | Include failed tickers with reasons in output | off |

**Examples:**

```bash
# Run against S&P 500 universe
npm run compounder

# Quick sample run
npm run compounder -- --tickers AAPL,MSFT,NVDA --top-n 10

# JSON output for automation
npm run compounder -- --format json --max-tickers 100

# Show filter-fail reasons
npm run compounder -- --tickers PLTR --show-rejected
```

## Buffett's 10 Formulas

The fundamental analysis evaluates stocks against Warren Buffett's criteria:

| #   | Formula            | Target       | Description              |
| --- | ------------------ | ------------ | ------------------------ |
| 1   | Cash Test          | > Total Debt | Cash covers all debt     |
| 2   | Debt-to-Equity     | < 0.5        | Low leverage             |
| 3   | Return on Equity   | > 15%        | Efficient use of capital |
| 4   | Current Ratio      | > 1.5        | Short-term liquidity     |
| 5   | Operating Margin   | > 12%        | Operational efficiency   |
| 6   | Asset Turnover     | > 0.5        | Asset efficiency         |
| 7   | Interest Coverage  | > 3x         | Ability to pay interest  |
| 8   | Earnings Stability | Positive     | Consistent profitability |
| 9   | Free Cash Flow     | > 0          | Cash generation          |
| 10  | Capital Allocation | > 15% ROE    | Management effectiveness |

**Scoring:** Each passing formula earns 1 point. Maximum score: 10/10.

## Technical Indicator

**Williams %R (Williams Percent Range)**

- Range: -100 to 0
- Oversold: < -80 (potential buy signal)
- Overbought: > -20 (potential sell signal)

The screener finds stocks where:

- Williams %R < -80 (oversold)
- Combined with Buffett score >= min-score (for US market)

## Output Formats

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
...
```

### JSON

```json
{
  "totalScanned": 503,
  "oversoldCount": 42,
  "qualityCount": 8,
  "minBuffettScore": 5,
  "market": "us",
  "topStocks": [...]
}
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

## Data Sources

- **US Stocks**: SEC EDGAR for fundamentals, Yahoo Finance for prices
- **Thai Stocks**: Yahoo Finance only (no SEC data available)

## Scoring Formula

Combined score = (Technical Score × 0.3) + (Fundamental Score × 0.7)

- Technical Score: (Williams %R + 100) / 100
- Fundamental Score: (Buffett Score / 10) × 100

## npm Scripts

```bash
npm run dev          # Run screening (alias for npm run screening)
npm run screening    # Run combined screening
npm run technical    # Run technical-only scan
npm run analyze      # Analyze a stock (requires ticker argument)
npm run compounder   # Run Compounding Machine screener
```

Pass CLI flags after `--`, for example: `npm run screening -- --market us --min-score 7`
