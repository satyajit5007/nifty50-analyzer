import { RefreshCw, TrendingUp, TrendingDown, Activity } from "lucide-react";

export default function Header({ indexData, lastUpdated, onRefresh, loading }) {
  const meta = indexData?.metadata;
  const advance = indexData?.advance;
  const indexSummary = indexData?.data?.[0]; // First item is the index itself

  const pChange = parseFloat(indexSummary?.pChange || 0);
  const isPositive = pChange >= 0;

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : n ?? "—";

  const fmtTime = (d) =>
    d
      ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "—";

  return (
    <header className="header">
      <div className="header-brand">
        <div className="brand-icon">
          <Activity size={22} />
        </div>
        <div className="brand-text">
          <span className="brand-name">NIFTY 50</span>
          <span className="brand-sub">Analyzer Dashboard</span>
        </div>
      </div>

      <div className="header-index">
        {indexSummary ? (
          <>
            <span className="index-value">{fmt(indexSummary.lastPrice)}</span>
            <span className={`index-change ${isPositive ? "up" : "down"}`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {isPositive ? "+" : ""}{fmt(indexSummary.change)} ({isPositive ? "+" : ""}{pChange.toFixed(2)}%)
            </span>
          </>
        ) : (
          <span className="index-value skeleton-text">Loading...</span>
        )}
      </div>

      <div className="header-breadcrumbs">
        {advance && (
          <>
            <div className="breadcrumb-pill advances">
              <span className="dot green" /> {advance.advances} Advances
            </div>
            <div className="breadcrumb-pill declines">
              <span className="dot red" /> {advance.declines} Declines
            </div>
            {advance.unchanged > 0 && (
              <div className="breadcrumb-pill unchanged">
                <span className="dot grey" /> {advance.unchanged} Unchanged
              </div>
            )}
          </>
        )}
      </div>

      <div className="header-actions">
        <span className="last-updated">
          {lastUpdated ? `Updated: ${fmtTime(lastUpdated)}` : "Fetching..."}
        </span>
        <button
          className={`refresh-btn ${loading ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          title="Refresh data"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}
