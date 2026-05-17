import { Activity, TrendingUp, TrendingDown, BarChart2, Users, Clock } from "lucide-react";

/**
 * MarketSummary — premium stat cards at the top of the dashboard.
 * Shows: NIFTY 50 value, change, advances, declines, breadth ratio, timestamp.
 */
export default function MarketSummary({ indexData, summary, loading }) {
  const fmt = (n, digits = 2) =>
    typeof n === "number"
      ? n.toLocaleString("en-IN", { maximumFractionDigits: digits })
      : n ?? "—";

  // Use indexValue from top-level (^NSEI) if available, fallback to first stock
  const indexValue  = indexData?.indexValue  || indexData?.data?.[0]?.lastPrice || 0;
  const indexChange = indexData?.indexChange || indexData?.data?.[0]?.change    || 0;
  const indexPChange= indexData?.indexPChange|| indexData?.data?.[0]?.pChange   || 0;
  const isUp        = indexPChange >= 0;

  const advance  = indexData?.advance;
  const advances = parseInt(advance?.advances || 0);
  const declines = parseInt(advance?.declines || 0);
  const unchanged= parseInt(advance?.unchanged || 0);
  const breadth  = declines > 0 ? (advances / declines).toFixed(2) : advances > 0 ? "∞" : "—";

  const cards = [
    {
      id: "index",
      label: "NIFTY 50",
      value: fmt(indexValue, 2),
      sub: `${isUp ? "+" : ""}${fmt(indexChange)} (${isUp ? "+" : ""}${Number(indexPChange).toFixed(2)}%)`,
      icon: <Activity size={20} />,
      color: isUp ? "card-up" : "card-down",
      accent: isUp ? "#00d4aa" : "#ef4444",
    },
    {
      id: "advances",
      label: "Advances",
      value: advances,
      sub: `${advances} stocks rising`,
      icon: <TrendingUp size={20} />,
      color: "card-up",
      accent: "#00d4aa",
    },
    {
      id: "declines",
      label: "Declines",
      value: declines,
      sub: `${declines} stocks falling`,
      icon: <TrendingDown size={20} />,
      color: "card-down",
      accent: "#ef4444",
    },
    {
      id: "breadth",
      label: "Mkt Breadth",
      value: breadth,
      sub: `Adv/Dec ratio`,
      icon: <BarChart2 size={20} />,
      color: advances > declines ? "card-up" : "card-down",
      accent: "#3b82f6",
    },
    {
      id: "unchanged",
      label: "Unchanged",
      value: unchanged,
      sub: `No movement`,
      icon: <Users size={20} />,
      color: "",
      accent: "#64748b",
    },
    {
      id: "timestamp",
      label: "Last Updated",
      value: indexData?.timestamp
        ? indexData.timestamp.split(" ").slice(1).join(" ")
        : "—",
      sub: indexData?.timestamp?.split(" ")[0] || "",
      icon: <Clock size={20} />,
      color: "",
      accent: "#8b5cf6",
    },
  ];

  return (
    <div className="market-summary-grid">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`summary-card ${card.color} ${loading ? "skeleton-card" : ""}`}
          style={{ "--card-accent": card.accent }}
        >
          <div className="summary-card-icon" style={{ color: card.accent }}>
            {card.icon}
          </div>
          <div className="summary-card-body">
            <span className="summary-label">{card.label}</span>
            <span className={`summary-value ${card.color}`}>
              {loading ? "—" : card.value}
            </span>
            <span className="summary-sub">{loading ? "" : card.sub}</span>
          </div>
          <div
            className="summary-card-glow"
            style={{ background: card.accent }}
          />
        </div>
      ))}
    </div>
  );
}
