import { OHLC } from "./database.js";
import { PriceDataFetcher, PriceResult } from "./priceData.js";

export const PRICE_HISTORY_DAYS = 90;
export const WILLIAMS_R_PERIOD = 21;

export async function fetchPricesForWilliamsR(
  priceFetcher: PriceDataFetcher,
  ticker: string
): Promise<OHLC[] | null> {
  const hasEnoughHistory = (result: PriceResult): result is PriceResult & { data: OHLC[] } =>
    Boolean(result.success && result.data && result.data.length >= WILLIAMS_R_PERIOD);

  let result = await priceFetcher.fetchStockPrices(ticker, PRICE_HISTORY_DAYS);
  if (hasEnoughHistory(result)) {
    return result.data;
  }

  result = await priceFetcher.fetchStockPrices(ticker, PRICE_HISTORY_DAYS, true);
  if (hasEnoughHistory(result)) {
    return result.data;
  }

  return null;
}