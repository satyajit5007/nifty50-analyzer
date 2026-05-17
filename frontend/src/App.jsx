import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import IndexDashboard from "./components/IndexDashboard";
import StockDetail from "./components/StockDetail";
import Header from "./components/Header";
import "./styles/global.css";

// In development: Vite proxy forwards /api → localhost:8080 (see vite.config.js)
// In production:  set VITE_API_URL=https://your-backend.railway.app/api/market
const API_BASE = import.meta.env.VITE_API_URL || "/api/market";

export default function App() {
  const [indexData,     setIndexData]     = useState(null);
  const [gainers,       setGainers]       = useState([]);
  const [losers,        setLosers]        = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [stockData,     setStockData]     = useState(null);

  const [indexLoading,  setIndexLoading]  = useState(true);
  const [moversLoading, setMoversLoading] = useState(true);
  const [stockLoading,  setStockLoading]  = useState(false);

  const [indexError,    setIndexError]    = useState(null);
  const [stockError,    setStockError]    = useState(null);
  const [lastUpdated,   setLastUpdated]   = useState(null);

  // ── Fetch all index data + movers together ────────────────────────────────
  const fetchAllData = useCallback(async () => {
    try {
      setIndexError(null);
      setMoversLoading(true);

      const [indexRes, gainersRes, losersRes, summaryRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/nifty50`),
        axios.get(`${API_BASE}/top-gainers`),
        axios.get(`${API_BASE}/top-losers`),
        axios.get(`${API_BASE}/market-summary`),
      ]);

      if (indexRes.status === "fulfilled") {
        setIndexData(indexRes.value.data);
        setLastUpdated(new Date());
      } else {
        setIndexError(
          indexRes.reason?.response?.data?.message ||
          "Unable to fetch NIFTY 50 data. Ensure Spring Boot is running on port 8080."
        );
      }

      if (gainersRes.status === "fulfilled") setGainers(gainersRes.value.data);
      if (losersRes.status  === "fulfilled") setLosers(losersRes.value.data);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.data);

    } finally {
      setIndexLoading(false);
      setMoversLoading(false);
    }
  }, []);

  // ── Fetch individual stock detail ─────────────────────────────────────────
  const fetchStockData = useCallback(async (symbol) => {
    try {
      setStockLoading(true);
      setStockError(null);
      const res = await axios.get(`${API_BASE}/quote/${symbol}`);
      setStockData(res.data);
    } catch (err) {
      setStockError(err.response?.data?.message || `Unable to fetch data for ${symbol}`);
    } finally {
      setStockLoading(false);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  // ── Auto-refresh every 60s (matches backend cache TTL) ───────────────────
  useEffect(() => {
    const interval = setInterval(fetchAllData, 60000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ── Fetch stock detail when selected ─────────────────────────────────────
  useEffect(() => {
    if (selectedStock) {
      fetchStockData(selectedStock);
    } else {
      setStockData(null);
      setStockError(null);
    }
  }, [selectedStock, fetchStockData]);

  const handleStockSelect = (symbol) =>
    setSelectedStock((prev) => (prev === symbol ? null : symbol));

  const handleRefresh = () => {
    fetchAllData();
    if (selectedStock) fetchStockData(selectedStock);
  };

  return (
    <div className="app">
      <Header
        indexData={indexData}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        loading={indexLoading}
      />
      <main className="main-layout">
        <IndexDashboard
          data={indexData}
          gainers={gainers}
          losers={losers}
          summary={summary}
          loading={indexLoading}
          moversLoading={moversLoading}
          error={indexError}
          selectedStock={selectedStock}
          onStockSelect={handleStockSelect}
        />
        {selectedStock && (
          <StockDetail
            symbol={selectedStock}
            data={stockData}
            loading={stockLoading}
            error={stockError}
            onClose={() => setSelectedStock(null)}
          />
        )}
      </main>
    </div>
  );
}
