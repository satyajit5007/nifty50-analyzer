import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, X, TrendingUp, TrendingDown, Zap } from "lucide-react";

/**
 * GlobalSearchBar — prominent full-width search at the top of the dashboard.
 *
 * Features:
 * - Searches both symbol AND company name in real-time
 * - Dropdown shows up to 8 results with price + % change badge
 * - Keyboard navigation: ↑↓ to move, Enter to select, Escape to close
 * - Clicking a result selects the stock (opens StockDetail panel)
 * - Animated highlight on the matching text
 */
export default function GlobalSearchBar({ stocks, onSelect, selectedStock }) {
  const [query,       setQuery]   = useState("");
  const [open,        setOpen]    = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const inputRef    = useRef(null);
  const containerRef = useRef(null);
  const listRef     = useRef(null);

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : n ?? "—";

  // ── Search results (filter on symbol + company name) ──────────────────────
  const results = useMemo(() => {
    if (!query.trim() || !stocks?.length) return [];
    const q = query.toLowerCase().trim();
    return stocks
      .filter((s) =>
        s.symbol !== "NIFTY 50" &&
        (s.symbol?.toLowerCase().includes(q) ||
         s.companyName?.toLowerCase().includes(q) ||
         s.industry?.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [query, stocks]);

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!open || !results.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = highlighted >= 0 ? results[highlighted] : results[0];
      if (pick) handleSelect(pick.symbol);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      setHighlighted(-1);
      inputRef.current?.blur();
    }
  }, [open, results, highlighted]); // eslint-disable-line

  // ── Select a stock ────────────────────────────────────────────────────────
  const handleSelect = (symbol) => {
    onSelect(symbol);
    setQuery("");
    setOpen(false);
    setHighlighted(-1);
  };

  // ── Highlight matching text ────────────────────────────────────────────────
  const highlight = (text = "", q = "") => {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-highlight">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const isActive = open && results.length > 0;

  return (
    <div className="global-search-wrapper" ref={containerRef}>
      {/* ── Search Bar ──────────────────────────────────────────────────── */}
      <div className={`global-search-bar ${isActive ? "glow" : ""}`}>
        <Search
          size={20}
          className={`gsb-icon ${query ? "active" : ""}`}
        />
        <input
          ref={inputRef}
          type="text"
          className="gsb-input"
          placeholder="Search company or symbol... (e.g. SUNPHARMA, Reliance, Pharma)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
        {query && (
          <button
            className="gsb-clear"
            onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
            tabIndex={-1}
          >
            <X size={16} />
          </button>
        )}
        <div className="gsb-kbd-hint">
          <kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> select · <kbd>Esc</kbd> close
        </div>
      </div>

      {/* ── Results Dropdown ─────────────────────────────────────────────── */}
      {isActive && (
        <div className="search-results-dropdown" ref={listRef}>
          <div className="search-results-header">
            <Zap size={12} />
            {results.length} result{results.length !== 1 ? "s" : ""} for
            <strong>&nbsp;"{query}"</strong>
          </div>

          {results.map((stock, i) => {
            const pct      = parseFloat(stock.pChange || 0);
            const isUp     = pct >= 0;
            const isSelected = selectedStock === stock.symbol;
            const isHl    = i === highlighted;

            return (
              <div
                key={stock.symbol}
                className={`search-result-item ${isSelected ? "is-selected" : ""} ${isHl ? "is-highlighted" : ""}`}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => handleSelect(stock.symbol)}
              >
                {/* Left: Symbol + Company + Industry */}
                <div className="sri-left">
                  <span className="sri-symbol">
                    {highlight(stock.symbol, query)}
                  </span>
                  <span className="sri-company">
                    {highlight(stock.companyName || stock.symbol, query)}
                  </span>
                  {stock.industry && (
                    <span className="sri-industry">
                      {highlight(stock.industry, query)}
                    </span>
                  )}
                </div>

                {/* Right: Price + % Change badge */}
                <div className="sri-right">
                  <span className="sri-price">₹{fmt(stock.lastPrice)}</span>
                  <span className={`sri-badge ${isUp ? "badge-up" : "badge-down"}`}>
                    {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {isUp ? "+" : ""}{pct.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}

          <div className="search-results-footer">
            Click or press Enter to view detailed analytics
          </div>
        </div>
      )}

      {/* ── No results message ────────────────────────────────────────────── */}
      {open && query.trim() && results.length === 0 && (
        <div className="search-no-results">
          <Search size={20} style={{ opacity: 0.3 }} />
          <span>No stocks found for <strong>"{query}"</strong></span>
          <span className="hint">Try symbol (INFY) or company (Infosys)</span>
        </div>
      )}
    </div>
  );
}
