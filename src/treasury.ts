const TREASURY_YIELD_CSV_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/all?type=daily_treasury_yield_curve&field_tdr_date_value&page&_format=csv";

let cachedRate: number | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchRiskFreeRate(fallback: number = 0.1): Promise<number> {
  if (cachedRate !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const response = await fetch(TREASURY_YIELD_CSV_URL, {
      headers: {
        "User-Agent": "claw-screener/1.0 (https://github.com/rsoutar/claw-screener)",
        Accept: "text/csv",
      },
    });
    if (!response.ok) {
      return fallback;
    }

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return fallback;

    const header = lines[0].split(",");
    const colIndex = findColumn(header);
    if (colIndex === -1) return fallback;

    const lastRow = lines[lines.length - 1].split(",");
    const raw = lastRow[colIndex]?.trim();

    if (!raw || raw === "N/A" || raw === "") return fallback;

    const percent = parseFloat(raw);
    if (!Number.isFinite(percent)) return fallback;

    const decimal = percent / 100;
    if (decimal <= 0 || decimal > 0.2) return fallback;

    cachedRate = decimal;
    cachedAt = Date.now();
    return decimal;
  } catch {
    return fallback;
  }
}

function findColumn(header: string[]): number {
  const candidates = ["BC_10YEAR", "10 Yr", "10 yr", "10yr", "10_Yr", "10_year"];
  for (const candidate of candidates) {
    const idx = header.findIndex((h) => h.trim() === candidate);
    if (idx !== -1) return idx;
  }

  const fuzzyIdx = header.findIndex(
    (h) => h.toLowerCase().includes("10") && h.toLowerCase().includes("yr")
  );
  return fuzzyIdx;
}

export function clearRiskFreeRateCache(): void {
  cachedRate = null;
  cachedAt = 0;
}
