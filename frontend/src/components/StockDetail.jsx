import { X, TrendingUp, TrendingDown, BarChart2, Info, Cpu, Database } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";

export default function StockDetail({ symbol, data, loading, error, onClose }) {
  const fmt = (n, digits = 2) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: digits })
      : n ?? "—";

  const source      = data?.source;        // "NSE" or "YAHOO"
  const info        = data?.info;
  const priceInfo   = data?.priceInfo;
  const metadata    = data?.metadata;
  const securityInfo= data?.securityInfo;
  const industryInfo= data?.industryInfo;

  const lastPrice = parseFloat(priceInfo?.lastPrice ?? 0);
  const pChange   = parseFloat(priceInfo?.pChange   ?? 0);
  const isUp      = pChange >= 0;

  // 52W Range
  const weekMax = priceInfo?.weekHighLow?.max || 0;
  const weekMin = priceInfo?.weekHighLow?.min || 0;
  const weekMaxDate = priceInfo?.weekHighLow?.maxDate || "";
  const weekMinDate = priceInfo?.weekHighLow?.minDate || "";

  // NSE-specific: PE Ratio
  const symbolPe = metadata?.pdSymbolPe;
  const sectorPe = metadata?.pdSectorPe;
  const sectorIndex = metadata?.pdSectorInd;

  // Performance radar
  const radarData = priceInfo ? [
    {
      metric: "vs Open",
      value: Math.min(Math.max(
        ((lastPrice - (priceInfo.open || lastPrice)) / (priceInfo.open || lastPrice)) * 100 * 10 + 50,
        0), 100),
    },
    {
      metric: "Day Range",
      value: priceInfo.dayHigh !== priceInfo.dayLow
        ? Math.min(((lastPrice - priceInfo.dayLow) / (priceInfo.dayHigh - priceInfo.dayLow)) * 100, 100)
        : 50,
    },
    {
      metric: "52W Range",
      value: weekMax && weekMin
        ? Math.min(((lastPrice - weekMin) / (weekMax - weekMin)) * 100, 100)
        : 50,
    },
    {
      metric: "Momentum",
      value: Math.min(Math.max(pChange * 5 + 50, 0), 100),
    },
    {
      metric: "Volume",
      value: Math.min((metadata?.totalTradedVolume ?? 0) / 1_000_000, 100),
    },
  ] : [];

  // Intraday shape
  const intradayShape = priceInfo ? [
    { time: "Prev Close", price: priceInfo.previousClose },
    { time: "Open",       price: priceInfo.open },
    { time: "Low",        price: priceInfo.dayLow },
    { time: "High",       price: priceInfo.dayHigh },
    { time: "LTP",        price: priceInfo.lastPrice },
  ] : [];

  return (
    <aside className="stock-detail">
      {/* Header */}
      <div className="detail-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 className="detail-symbol">{symbol}</h2>
            {source && (
              <span
                className="source-badge"
                title={source === "NSE" ? "Data from NSE India API" : "Data from Yahoo Finance (NSE fallback)"}
                style={{ background: source === "NSE" ? "rgba(0,212,170,0.12)" : "rgba(59,130,246,0.12)",
                         borderColor: source === "NSE" ? "rgba(0,212,170,0.3)" : "rgba(59,130,246,0.3)",
                         color: source === "NSE" ? "var(--accent-teal)" : "var(--accent-blue)" }}
              >
                {source === "NSE" ? <Cpu size={10} /> : <Database size={10} />}
                {source}
              </span>
            )}
          </div>
          <p className="detail-company">{info?.companyName || "Loading..."}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {info?.industry && <span className="detail-badge">{info.industry}</span>}
            {industryInfo?.sector && industryInfo.sector !== info?.industry && (
              <span className="detail-badge" style={{ background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.3)", color: "#8b5cf6" }}>
                {industryInfo.sector}
              </span>
            )}
          </div>
        </div>
        <button className="close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>
      </div>

      {loading && (
        <div className="detail-loading">
          <div className="spinner" />
          <p>Fetching {symbol} from NSE India...</p>
        </div>
      )}

      {error && (
        <div className="detail-error">
          <Info size={16} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && priceInfo && (
        <>
          {/* Price */}
          <div className="price-block">
            <span className="price-value">₹{fmt(lastPrice)}</span>
            <span className={`price-change ${isUp ? "up" : "down"}`}>
              {isUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {isUp ? "+" : ""}₹{fmt(priceInfo.change)} ({isUp ? "+" : ""}{pChange.toFixed(2)}%)
            </span>
            {priceInfo.vwap > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                VWAP: ₹{fmt(priceInfo.vwap)}
              </span>
            )}
          </div>

          {/* Key Metrics */}
          <div className="metrics-grid">
            {[
              { label: "Open",       value: `₹${fmt(priceInfo.open)}` },
              { label: "Prev Close", value: `₹${fmt(priceInfo.previousClose)}` },
              { label: "Day High",   value: `₹${fmt(priceInfo.dayHigh)}`,  color: "green" },
              { label: "Day Low",    value: `₹${fmt(priceInfo.dayLow)}`,   color: "red" },
              { label: "52W High",   value: `₹${fmt(weekMax)}`,            color: "green" },
              { label: "52W Low",    value: `₹${fmt(weekMin)}`,            color: "red" },
              { label: "Volume",     value: parseInt(metadata?.totalTradedVolume ?? 0).toLocaleString("en-IN") },
              { label: "Traded Val", value: metadata?.totalTradedValue ? `₹${fmt(metadata.totalTradedValue)} Cr` : "—" },
              ...(symbolPe ? [{ label: "P/E Ratio",  value: fmt(symbolPe), color: "amber" }] : []),
              ...(sectorPe ? [{ label: "Sector P/E", value: fmt(sectorPe) }] : []),
              ...(priceInfo?.perChange30d  != null ? [{ label: "30D Change",  value: `${priceInfo.perChange30d >= 0 ? "+" : ""}${fmt(priceInfo.perChange30d)}%`, color: priceInfo.perChange30d >= 0 ? "green" : "red" }] : []),
              ...(priceInfo?.perChange365d != null ? [{ label: "1Y Change",   value: `${priceInfo.perChange365d >= 0 ? "+" : ""}${fmt(priceInfo.perChange365d)}%`, color: priceInfo.perChange365d >= 0 ? "green" : "red" }] : []),
              ...(securityInfo?.faceValue ? [{ label: "Face Value", value: `₹${securityInfo.faceValue}` }] : []),
              ...(info?.isin ? [{ label: "ISIN", value: info.isin }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} className={`metric-card ${color === "amber" ? "highlight-card" : ""}`}>
                <span className="metric-label">{label}</span>
                <span className={`metric-value ${color === "green" ? "green" : color === "red" ? "red" : color === "amber" ? "amber" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* 52W Date info (NSE only) */}
          {weekMaxDate && (
            <div className="week-dates-row">
              <span><span className="green">▲</span> 52W High: {weekMaxDate}</span>
              <span><span className="red">▼</span> 52W Low: {weekMinDate}</span>
            </div>
          )}

          {/* Sector Index info (NSE only) */}
          {sectorIndex && (
            <div className="sector-info-row">
              <Cpu size={12} style={{ color: "var(--accent-teal)" }} />
              <span>Tracked in <strong style={{ color: "var(--accent-teal)" }}>{sectorIndex}</strong></span>
            </div>
          )}

          {/* Day Range Bar */}
          {priceInfo.dayHigh && priceInfo.dayLow && priceInfo.dayHigh !== priceInfo.dayLow && (
            <div className="range-bar-section">
              <div className="range-labels">
                <span>Day Low: ₹{fmt(priceInfo.dayLow)}</span>
                <span>Day High: ₹{fmt(priceInfo.dayHigh)}</span>
              </div>
              <div className="range-track">
                <div
                  className="range-fill"
                  style={{
                    left: `${((lastPrice - priceInfo.dayLow) / (priceInfo.dayHigh - priceInfo.dayLow)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 52W Range Bar */}
          {weekMax > 0 && weekMin > 0 && weekMax !== weekMin && (
            <div className="range-bar-section">
              <div className="range-labels">
                <span>52W Low: ₹{fmt(weekMin)}</span>
                <span>52W High: ₹{fmt(weekMax)}</span>
              </div>
              <div className="range-track">
                <div
                  className="range-fill"
                  style={{
                    left: `${((lastPrice - weekMin) / (weekMax - weekMin)) * 100}%`,
                    background: "#3b82f6",
                  }}
                />
              </div>
            </div>
          )}

          {/* Intraday Chart */}
          <div className="chart-section">
            <h3 className="section-title">
              <BarChart2 size={15} /> Price Snapshot
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={intradayShape} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={isUp ? "#00d4aa" : "#ef4444"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isUp ? "#00d4aa" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickFormatter={v => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={v => [`₹${v.toLocaleString("en-IN")}`, "Price"]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={isUp ? "#00d4aa" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Radar */}
          <div className="chart-section">
            <h3 className="section-title">Performance Radar</h3>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke={isUp ? "#00d4aa" : "#ef4444"}
                  fill={isUp ? "#00d4aa" : "#ef4444"}
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Company Info */}
          {info && (
            <div className="info-section">
              <h3 className="section-title"><Info size={15} /> Company Info</h3>
              <div className="info-rows">
                {[
                  ["Symbol",    info.symbol],
                  ["Series",    info.series],
                  ["Industry",  info.industry || industryInfo?.basicIndustry],
                  ["Macro",     industryInfo?.macro],
                  ["ISIN",      info.isin],
                  ["Status",    info.status],
                ].map(([label, value]) =>
                  value ? (
                    <div key={label} className="info-row">
                      <span className="info-label">{label}</span>
                      <span className="info-value">{value}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
