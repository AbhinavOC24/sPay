import axios from "axios";

let cachedRate: number | null = null;
let lastFetched: number | null = null;

const fetchUsdExchangeRate = async () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  if (!cachedRate || !lastFetched || now - lastFetched > HOUR_MS) {
    console.log("🔄 Fetching new BTC-USD rate from Coinbase...");
    const res = await axios.get(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot"
    );
    cachedRate = parseFloat(res.data?.data?.amount);
    lastFetched = now;
  }

  return cachedRate;
};

export default fetchUsdExchangeRate;
