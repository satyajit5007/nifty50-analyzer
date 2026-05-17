import { TrendingUp, TrendingDown, Zap } from "lucide-react";

/**
 * TopMovers — displays Top Gainers & Top Losers side-by-side.
 * Each item is clickable to open the StockDetail panel.
 */
export default function TopMovers({ gainers, losers, onStockSelect, selectedStock, loading }) {
  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : "—";

  const StockItem = ({ stock, type }) => {
    const pct = parseFloat(stock.pChange || 0);
    const isUp = pct >= 0;
    const isSelected = selectedStock === stock.symbol;

    return (
      <div
        className={`mover-item ${isSelected ? "selected" : ""} ${type}`}
        onClick={() => onStockSelect(stock.symbol)}
        title={`Click to view ${stock.symbol} details`}
      >
        <div className="mover-left">
          <span className="mover-symbol">{stock.symbol}</span>
          <span className="mover-price">₹{fmt(stock.lastPrice)}</span>
        </div>
        <div className="mover-right">
          <span className={`mover-badge ${isUp ? "badge-up" : "badge-down"}`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isUp ? "+" : ""}{pct.toFixed(2)}%
          </span>
          <span className="mover-vol">
            Vol: {parseInt(stock.totalTradedVolume || 0).toLocaleString("en-IN")}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="top-movers-section">
      {/* Top Gainers */}
      <div className="movers-card gainers-card">
        <div className="movers-header">
          <TrendingUp size={16} className="movers-icon gain" />
          <h3 className="movers-title">Top Gainers</h3>
          <span className="movers-count">{gainers?.length || 0}</span>
        </div>
        <div className="movers-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mover-skeleton" />
            ))
          ) : gainers?.slice(0, 5).map((s) => (
            <StockItem key={s.symbol} stock={s} type="gainer" />
          ))}
        </div>
      </div>

      {/* Top Losers */}
      <div className="movers-card losers-card">
        <div className="movers-header">
          <TrendingDown size={16} className="movers-icon loss" />
          <h3 className="movers-title">Top Losers</h3>
          <span className="movers-count">{losers?.length || 0}</span>
        </div>
        <div className="movers-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mover-skeleton" />
            ))
          ) : losers?.slice(0, 5).map((s) => (
            <StockItem key={s.symbol} stock={s} type="loser" />
          ))}
        </div>
      </div>

      {/* Volume Leaders (mini column) */}
      <div className="movers-card volume-card">
        <div className="movers-header">
          <Zap size={16} className="movers-icon vol" />
          <h3 className="movers-title">Volume Leaders</h3>
        </div>
        <div className="movers-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mover-skeleton" />
            ))
          ) : gainers && losers && [...(gainers || []), ...(losers || [])]
            .sort((a, b) => b.totalTradedVolume - a.totalTradedVolume)
            .filter((v, i, arr) => arr.findIndex(x => x.symbol === v.symbol) === i)
            .slice(0, 5)
            .map((s) => {
              const pct = parseFloat(s.pChange || 0);
              const isUp = pct >= 0;
              return (
                <div
                  key={s.symbol}
                  className={`mover-item ${selectedStock === s.symbol ? "selected" : ""}`}
                  onClick={() => onStockSelect(s.symbol)}
                >
                  <div className="mover-left">
                    <span className="mover-symbol">{s.symbol}</span>
                    <span className="mover-vol">
                      {(s.totalTradedVolume / 1_000_000).toFixed(1)}M
                    </span>
                  </div>
                  <span className={`mover-badge ${isUp ? "badge-up" : "badge-down"}`}>
                    {isUp ? "+" : ""}{pct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
