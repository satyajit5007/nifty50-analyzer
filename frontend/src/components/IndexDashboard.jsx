import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend
} from "recharts";
import { Search, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import TopMovers from "./TopMovers";
import MarketSummary from "./MarketSummary";
import GlobalSearchBar from "./GlobalSearchBar";

const PAGE_SIZE = 25;

export default function IndexDashboard({
  data, gainers, losers, summary,
  loading, moversLoading, error,
  selectedStock, onStockSelect,
}) {
  const [search,    setSearch]    = useState("");
  const [sortKey,   setSortKey]   = useState("pChange");
  const [sortDir,   setSortDir]   = useState("desc");
  const [activeTab, setActiveTab] = useState("heatmap");
  const [page,      setPage]      = useState(1);

  const constituents = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((d) => d.symbol !== "NIFTY 50");
  }, [data]);

  const filtered = useMemo(() => {
    let list = constituents.filter((s) =>
      s.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      s.meta?.longName?.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      const av = parseFloat(a[sortKey] ?? 0);
      const bv = parseFloat(b[sortKey] ?? 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [constituents, search, sortKey, sortDir]);

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const handleSearch = (val) => { setSearch(val); setPage(1); };

  const fmt = (n, digits = 2) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: digits })
      : n ?? "—";

  if (loading) return (
    <div className="panel loading-panel">
      <div className="spinner large" />
      <p>Fetching NIFTY 50 data from Yahoo Finance...</p>
      <p className="hint">Parallel fetching 50 stocks + ^NSEI index...</p>
    </div>
  );
  if (error) return (
    <div className="panel error-panel">
      <h3>⚠ Data Unavailable</h3>
      <p>{error}</p>
      <p className="hint">Make sure Spring Boot is running: <code>mvn spring-boot:run</code></p>
    </div>
  );
  if (!constituents.length) return null;

  // Chart data
  const topGainers5  = [...constituents].sort((a, b) => b.pChange - a.pChange).slice(0, 8);
  const topLosers5   = [...constituents].sort((a, b) => a.pChange - b.pChange).slice(0, 8);

  // Sector pie from Yahoo longName heuristic
  const sectorMap = {};
  constituents.forEach((s) => {
    const sec = s.meta?.sector || s.meta?.industry || "Other";
    sectorMap[sec] = (sectorMap[sec] || 0) + 1;
  });
  const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value }));
  const PIE_COLORS = ["#00d4aa","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#06b6d4","#84cc16"];

  return (
    <div className="index-dashboard">

      {/* ── Global Search Bar ── */}
      <GlobalSearchBar
        stocks={constituents}
        onSelect={onStockSelect}
        selectedStock={selectedStock}
      />

      {/* ── Market Summary Cards ── */}
      <MarketSummary indexData={data} summary={summary} loading={loading} />

      {/* ── Top Movers Section ── */}
      <TopMovers
        gainers={gainers?.length ? gainers : topGainers5}
        losers={losers?.length  ? losers  : topLosers5}
        onStockSelect={onStockSelect}
        selectedStock={selectedStock}
        loading={moversLoading}
      />

      {/* ── Tab Navigation ── */}
      <div className="tab-nav">
        {["heatmap", "chart", "sectors", "table"].map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "heatmap" ? "🗺 Heatmap"
             : tab === "chart" ? "📊 Chart"
             : tab === "sectors" ? "🥧 Sectors"
             : "📋 Table"}
          </button>
        ))}
      </div>

      {/* ── Heatmap Tab ── */}
      {activeTab === "heatmap" && (
        <div className="panel">
          <h2 className="panel-title">Market Heatmap</h2>
          <p className="panel-sub">Click any stock to view detailed analytics</p>
          <div className="heatmap-grid">
            {constituents.map((stock) => {
              const pct       = parseFloat(stock.pChange || 0);
              const intensity = Math.min(Math.abs(pct) / 4, 1);
              const isUp      = pct >= 0;
              const bg        = isUp
                ? `rgba(0, 212, 170, ${0.15 + intensity * 0.55})`
                : `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`;
              const border    = isUp
                ? `rgba(0, 212, 170, ${0.4 + intensity * 0.4})`
                : `rgba(239, 68, 68, ${0.4 + intensity * 0.4})`;
              const isSelected = selectedStock === stock.symbol;
              return (
                <div
                  key={stock.symbol}
                  className={`heatmap-cell ${isSelected ? "selected" : ""}`}
                  style={{ background: bg, borderColor: border }}
                  onClick={() => onStockSelect(stock.symbol)}
                  title={`${stock.symbol}: ₹${fmt(stock.lastPrice)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`}
                >
                  <span className="cell-symbol">{stock.symbol}</span>
                  <span className={`cell-change ${isUp ? "up" : "down"}`}>
                    {isUp ? "+" : ""}{pct.toFixed(2)}%
                  </span>
                  <span className="cell-price">₹{fmt(stock.lastPrice, 0)}</span>
                </div>
              );
            })}
          </div>
          <div className="heatmap-legend">
            <span className="legend-item loss-4">-4%+</span>
            <span className="legend-item loss-2">-2%</span>
            <span className="legend-item flat">0%</span>
            <span className="legend-item gain-2">+2%</span>
            <span className="legend-item gain-4">+4%+</span>
          </div>
        </div>
      )}

      {/* ── Chart Tab ── */}
      {activeTab === "chart" && (
        <div className="panel">
          <h2 className="panel-title">Top Gainers — Daily % Change</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topGainers5.map((s) => ({ symbol: s.symbol, pChange: +s.pChange }))}
              margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
              <XAxis dataKey="symbol" tick={{ fill: "#94a3b8", fontSize: 11 }} angle={-35} textAnchor="end" />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v) => [`${v.toFixed(2)}%`, "Change"]} />
              <Bar dataKey="pChange" radius={[6, 6, 0, 0]}>
                {topGainers5.map((_, i) => <Cell key={i} fill="#00d4aa" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <h2 className="panel-title" style={{ marginTop: 32 }}>Top Losers — Daily % Change</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topLosers5.map((s) => ({ symbol: s.symbol, pChange: +s.pChange }))}
              margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
              <XAxis dataKey="symbol" tick={{ fill: "#94a3b8", fontSize: 11 }} angle={-35} textAnchor="end" />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v) => [`${v.toFixed(2)}%`, "Change"]} />
              <Bar dataKey="pChange" radius={[6, 6, 0, 0]}>
                {topLosers5.map((_, i) => <Cell key={i} fill="#ef4444" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Sectors Tab ── */}
      {activeTab === "sectors" && (
        <div className="panel">
          <h2 className="panel-title">Sector Distribution</h2>
          <ResponsiveContainer width="100%" height={380}>
            <PieChart>
              <Pie
                data={sectorData}
                cx="50%" cy="50%"
                outerRadius={140}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {sectorData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Table Tab (with pagination) ── */}
      {activeTab === "table" && (
        <div className="panel">
          <div className="table-toolbar">
            <h2 className="panel-title">All Constituents</h2>
            <div className="search-box">
              <Search size={14} />
              <input
                placeholder="Search symbol or company..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: "symbol",            label: "Symbol" },
                    { key: "lastPrice",         label: "LTP (₹)" },
                    { key: "open",              label: "Open" },
                    { key: "dayHigh",           label: "High" },
                    { key: "dayLow",            label: "Low" },
                    { key: "previousClose",     label: "Prev Close" },
                    { key: "change",            label: "Change" },
                    { key: "pChange",           label: "Day %" },
                    { key: "perChange30d",      label: "30D %" },
                    { key: "perChange365d",     label: "1Y %" },
                    { key: "nearWKH",           label: "Near 52W H" },
                    { key: "fiftyTwoWeekHigh",  label: "52W High" },
                    { key: "fiftyTwoWeekLow",   label: "52W Low" },
                    { key: "totalTradedVolume", label: "Volume" },
                  ].map((col) => (
                    <th key={col.key} onClick={() => handleSort(col.key)} className="sortable">
                      {col.label}
                      {sortKey === col.key
                        ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        : <ArrowUpDown size={12} className="sort-icon" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((stock) => {
                  const pct  = parseFloat(stock.pChange || 0);
                  const isUp = pct >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      className={`table-row ${selectedStock === stock.symbol ? "selected" : ""}`}
                      onClick={() => onStockSelect(stock.symbol)}
                    >
                      <td className="symbol-cell">{stock.symbol}</td>
                      <td>₹{fmt(stock.lastPrice)}</td>
                      <td>₹{fmt(stock.open)}</td>
                      <td>₹{fmt(stock.dayHigh)}</td>
                      <td>₹{fmt(stock.dayLow)}</td>
                      <td>₹{fmt(stock.previousClose)}</td>
                      <td className={isUp ? "up" : "down"}>{isUp ? "+" : ""}{fmt(stock.change)}</td>
                      <td className={`pchange ${isUp ? "up" : "down"}`}>{isUp ? "+" : ""}{pct.toFixed(2)}%</td>
                      <td className={parseFloat(stock.perChange30d||0) >= 0 ? "up" : "down"}>
                        {parseFloat(stock.perChange30d||0) >= 0 ? "+" : ""}{parseFloat(stock.perChange30d||0).toFixed(2)}%
                      </td>
                      <td className={parseFloat(stock.perChange365d||0) >= 0 ? "up" : "down"}>
                        {parseFloat(stock.perChange365d||0) >= 0 ? "+" : ""}{parseFloat(stock.perChange365d||0).toFixed(2)}%
                      </td>
                      <td className={parseFloat(stock.nearWKH||0) >= -2 ? "up" : "down"}>
                        {parseFloat(stock.nearWKH||0).toFixed(2)}%
                      </td>
                      <td className="green">₹{fmt(stock.fiftyTwoWeekHigh || stock.meta?.fiftyTwoWeekHigh)}</td>
                      <td className="red">₹{fmt(stock.fiftyTwoWeekLow  || stock.meta?.fiftyTwoWeekLow)}</td>
                      <td>{parseInt(stock.totalTradedVolume || 0).toLocaleString("en-IN")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="page-info">
                Page {page} of {totalPages} · {filtered.length} stocks
              </span>
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
