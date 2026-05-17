# 📈 Nifty 50 Analyzer Dashboard

A full-stack, real-time market analytics dashboard built with **React.js + Vite** (frontend) and **Spring Boot** (backend). Fetches live data from **NSE India API** (`equity-stockIndices?index=NIFTY%2050`) with automatic Yahoo Finance fallback. Features Caffeine in-memory caching, Spring Scheduler for auto-refresh, parallel stock fetching, and a rich analytical UI.

---

## ✨ Features

### Dashboard
| Feature | Description |
|---|---|
| 🔍 **Global Search Bar** | Real-time search by symbol, company name, or industry — results show price + % badge with highlighted text matches |
| 📊 **Market Summary Cards** | 6 live KPI cards: NIFTY 50 value, Advances, Declines, Market Breadth, Unchanged, Last Updated |
| 🚀 **Top Movers Panel** | Top Gainers / Top Losers / Volume Leaders in a 3-column layout |
| 🗺 **Market Heatmap** | Color-coded grid of all 50 stocks (green intensity = gain, red = loss). Click any cell to open stock detail |
| 📊 **Gainers/Losers Chart** | Bar charts for top 8 gainers and top 8 losers by daily % change |
| 🥧 **Sector Pie Chart** | Distribution of NIFTY 50 constituents by industry/sector |
| 📋 **Data Table** | Sortable, searchable, paginated (25/page) table with: Day%, 30D%, 1Y%, Near 52W High, Volume, 52W H/L |

### Stock Detail Panel (NSE-powered)
| Field | Source |
|---|---|
| LTP, Open, High, Low, VWAP | NSE `/api/quote-equity` |
| P/E Ratio (Stock + Sector) | NSE exclusive ✅ |
| 52W High / Low **with exact dates** | NSE exclusive ✅ |
| 30D % Change + 1Y % Change | NSE exclusive ✅ |
| Sector / Industry / Basic Industry | NSE exclusive ✅ |
| Face Value, ISIN, Issue Size | NSE exclusive ✅ |
| Day Range Bar + 52W Range Bar | Computed |
| Price Snapshot (Area chart) | Recharts |
| Performance Radar chart | Recharts |
| **NSE / YAHOO source badge** | Auto-detected |

### Backend Intelligence
- 🧠 **Dual Data Source**: NSE India (primary) → Yahoo Finance (automatic fallback)
- ⚡ **Caffeine Cache**: 60s TTL for index data, 30s for individual stock quotes
- 🔄 **Spring Scheduler**: Pre-warms cache every 60s — users always get instant responses
- 🚀 **Parallel Fetching**: `CompletableFuture` with 20-thread pool fetches 50 stocks in ~1s
- 🍪 **Cookie Session**: Apache HttpClient 5 + `BasicCookieStore` for NSE session management

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSER (React.js + Vite)                    │
│                                                                  │
│  GlobalSearchBar  →  search symbol/company/industry              │
│  MarketSummary    →  6 live KPI cards                            │
│  TopMovers        →  Gainers / Losers / Volume                   │
│  IndexDashboard   →  Heatmap / Charts / Sectors / Table          │
│  StockDetail      →  Full analytics panel (NSE-powered)          │
│                                                                  │
│  Auto-refresh every 60s via setInterval                          │
└───────────────────────────┬──────────────────────────────────────┘
                            │  Axios  /api/*
                            │  (Vite proxy: :3000 → :8080)
┌───────────────────────────▼──────────────────────────────────────┐
│                  SPRING BOOT BACKEND (:8080)                     │
│                                                                  │
│  MarketController   @CrossOrigin                                 │
│    GET /api/market/nifty50          ← all 50 stocks + index      │
│    GET /api/market/top-gainers      ← top 10 by pChange          │
│    GET /api/market/top-losers       ← bottom 10 by pChange       │
│    GET /api/market/market-summary   ← aggregated stats           │
│    GET /api/market/quote/{symbol}   ← full stock detail          │
│    GET /api/market/health           ← health check               │
│         ↓                                                        │
│  NseService   @Cacheable ("nifty50Data" / "stockQuote")          │
│         ↓                    ↓                                   │
│   NseApiClient          Yahoo Finance                            │
│  Apache HC5             RestTemplate                             │
│  BasicCookieStore       (fallback)                               │
│         ↓                                                        │
│  MarketScheduler  @Scheduled(fixedRate=60s)                      │
│    → evicts cache → re-fetches proactively                       │
└──────────────┬────────────────────────┬──────────────────────────┘
               │                        │
               ▼                        ▼
 ┌─────────────────────┐   ┌────────────────────────────────┐
 │  NSE India API      │   │  Yahoo Finance API              │
 │  (PRIMARY)          │   │  (FALLBACK — always available)  │
 │                     │   │                                │
 │  equity-stockIndices│   │  /v8/finance/chart/INFY.NS     │
 │  ?index=NIFTY%2050  │   │  (50 parallel requests)        │
 │                     │   │                                │
 │  quote-equity       │   │                                │
 │  ?symbol=SUNPHARMA  │   │                                │
 └─────────────────────┘   └────────────────────────────────┘
```

---

## Project Structure

```
nifty50-analyzer/
│
├── backend/                                ← Spring Boot (Maven)
│   ├── pom.xml                             ← spring-boot, cache, caffeine, httpclient5
│   └── src/main/java/com/nifty50/analyzer/
│       ├── Nifty50AnalyzerApplication.java ← @SpringBootApplication @EnableScheduling
│       ├── config/
│       │   ├── AppConfig.java              ← RestTemplate bean
│       │   └── CacheConfig.java            ← @EnableCaching + 3 Caffeine caches
│       ├── client/
│       │   └── NseApiClient.java           ← Apache HC5 + BasicCookieStore, NSE session
│       ├── service/
│       │   └── NseService.java             ← @Cacheable, NSE+Yahoo dual-source, parallel fetch
│       ├── controller/
│       │   └── MarketController.java       ← 6 REST endpoints + @CrossOrigin
│       └── scheduler/
│           └── MarketScheduler.java        ← @Scheduled 60s cache refresh
│
└── frontend/                               ← React + Vite
    ├── index.html
    ├── vite.config.js                      ← proxy /api → localhost:8080
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                         ← root: parallel fetch, state management
        ├── styles/
        │   └── global.css                  ← full dark design system, CSS variables
        └── components/
            ├── Header.jsx                  ← NIFTY value, advances/declines, refresh
            ├── GlobalSearchBar.jsx         ← live search by symbol/name/industry
            ├── MarketSummary.jsx           ← 6 KPI stat cards
            ├── TopMovers.jsx               ← gainers / losers / volume leaders
            ├── IndexDashboard.jsx          ← heatmap / chart / sectors / table tabs
            └── StockDetail.jsx             ← full analytics sidebar (NSE-powered)
```

---

## Setup & Running

### Prerequisites
- Java 21+
- Maven 3.8+
- Node.js 18+ / npm

### 1. Start the Spring Boot Backend

```bash
cd backend
mvn spring-boot:run
```

On startup the backend:
1. Starts Tomcat on `http://localhost:8080`
2. Activates Caffeine cache (`nifty50Data`, `stockQuote`, `marketSummary`)
3. After 10s → `MarketScheduler` fires the first cache warm-up
4. `NseApiClient` initializes NSE session (homepage → market page → API)
5. If NSE is blocked → auto-falls back to Yahoo Finance
6. Scheduler repeats every 60s to keep cache fresh

Verify:
```bash
curl http://localhost:8080/api/market/health
# → {"status":"UP","service":"Nifty 50 Analyzer API"}

curl http://localhost:8080/api/market/nifty50
# → {"source":"NSE","indexValue":23643.5,"data":[...51 items]}
```

### 2. Start the React Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`

> **Market Hours**: NSE returns live data Mon–Fri, 09:15–15:30 IST. Outside hours, it returns the last available closing snapshot.

---

## API Reference

### Endpoints

| Method | Endpoint | Cached | Description |
|--------|----------|--------|-------------|
| GET | `/api/market/health` | No | Service health check |
| GET | `/api/market/nifty50` | 60s | All 50 stocks + index value + advances |
| GET | `/api/market/top-gainers` | 60s | Top 10 stocks by daily % gain |
| GET | `/api/market/top-losers` | 60s | Top 10 stocks by daily % loss |
| GET | `/api/market/market-summary` | 60s | Aggregated index stats |
| GET | `/api/market/quote/{symbol}` | 30s | Full stock detail (PE, 52W, sector, ISIN) |

### NSE Fields Mapped (from `equity-stockIndices?index=NIFTY%2050`)

```json
{
  "source": "NSE",
  "name": "NIFTY 50",
  "indexValue": 23643.5,
  "indexChange": -46.1,
  "indexPChange": -0.19,
  "timestamp": "16-May-2026 15:29:00",
  "advance": { "advances": "25", "declines": "24", "unchanged": "1" },
  "data": [
    {
      "symbol":           "SUNPHARMA",
      "companyName":      "Sun Pharmaceutical Industries Limited",
      "industry":         "Pharmaceuticals & Biotechnology",
      "lastPrice":        1878.0,
      "open":             1874.0,
      "dayHigh":          1887.9,
      "dayLow":           1863.2,
      "previousClose":    1863.2,
      "change":           14.8,
      "pChange":          0.79,
      "totalTradedVolume":1234567,
      "totalTradedValue": 231.4,
      "fiftyTwoWeekHigh": 1887.9,
      "fiftyTwoWeekLow":  1548.0,
      "perChange30d":     2.15,
      "perChange365d":    12.34,
      "nearWKH":          -0.52,
      "nearWKL":          21.3,
      "chart30dPath":     "/live_charts/...",
      "chart365dPath":    "/live_charts/...",
      "chartTodayPath":   "/live_charts/..."
    }
  ]
}
```

### SUNPHARMA Quote (from `quote-equity?symbol=SUNPHARMA`)

```json
{
  "source": "NSE",
  "info": {
    "symbol": "SUNPHARMA",
    "companyName": "Sun Pharmaceutical Industries Limited",
    "industry": "Pharmaceuticals & Biotechnology",
    "isin": "INE044A01036",
    "series": "EQ"
  },
  "priceInfo": {
    "lastPrice":     1878.0,
    "open":          1874.0,
    "dayHigh":       1887.9,
    "dayLow":        1863.2,
    "previousClose": 1863.2,
    "change":        14.8,
    "pChange":       0.79,
    "vwap":          1878.36,
    "perChange30d":  0.79,
    "perChange365d": 12.34,
    "weekHighLow": {
      "max":     1887.9,
      "min":     1548.0,
      "maxDate": "15-May-2026",
      "minDate": "26-Sep-2025"
    }
  },
  "metadata": {
    "totalTradedVolume": 1234567,
    "totalTradedValue":  231.4,
    "pdSymbolPe":        40.96,
    "pdSectorPe":        36.85,
    "pdSectorInd":       "Nifty Pharma",
    "lastUpdateTime":    "16-May-2026 15:29:00"
  },
  "securityInfo": { "faceValue": 1, "issuedSize": 2394938600 },
  "industryInfo": {
    "macro":          "Healthcare",
    "sector":         "Pharmaceutical",
    "industry":       "Pharmaceutical",
    "basicIndustry":  "Pharmaceuticals - Indian - Specialty"
  }
}
```

---

## Tech Stack

### Frontend
| Tech | Version | Purpose |
|---|---|---|
| React.js | 18 | Component-based UI |
| Vite | 5 | Dev server + proxy + HMR |
| Axios | Latest | HTTP client, `Promise.allSettled` |
| Recharts | Latest | BarChart, PieChart, AreaChart, RadarChart |
| Lucide React | Latest | Icon library |
| CSS Variables | — | Dark design system, no CSS framework |

### Backend
| Tech | Version | Purpose |
|---|---|---|
| Spring Boot | 3.2.5 | Web server, DI, auto-config |
| Spring Cache | — | `@Cacheable` / `@CacheEvict` annotations |
| Caffeine | 3.x | In-memory cache with TTL |
| Spring Scheduler | — | `@Scheduled` 60s cache refresh |
| Apache HttpClient 5 | 5.x | NSE session with `BasicCookieStore` |
| Jackson | 2.x | JSON parsing (`ObjectMapper`, `JsonNode`) |
| Java CompletableFuture | 21 | 20-thread parallel stock fetching |

---

## Key Design Decisions

### 1. NSE Primary + Yahoo Finance Fallback
NSE India gives richer data (PE ratio, 52W dates, sector) but uses Cloudflare bot protection. The backend tries NSE first via a browser-mimicking session. If blocked, it silently falls back to Yahoo Finance. The frontend shows a **source badge** (NSE 🟢 or YAHOO 🔵).

### 2. Caffeine Cache + Scheduler (no Redis needed)
- `@Cacheable` prevents duplicate API calls — 100 users share 1 cached result
- `@Scheduled(fixedRate=60000)` proactively refreshes the cache every 60s
- Users always get instant responses — the cache is never cold

### 3. Apache HttpClient 5 + BasicCookieStore
NSE requires: visit homepage → get `nsit`/`nseappid` cookies → pass them on every API call. `BasicCookieStore` handles this exactly like a browser cookie jar — automatically storing and forwarding cookies.

### 4. CompletableFuture Parallel Fetch (Yahoo fallback)
50 sequential Yahoo Finance calls × 200ms = 10s. With `CompletableFuture` + 20-thread pool, all 50 fire simultaneously, completing in ~1s.

### 5. Promise.allSettled (Frontend)
4 endpoints are fetched in parallel. `Promise.allSettled` ensures that if one endpoint fails (e.g., top-gainers timeout), the other 3 still render — no full-page crash.

---

## Cache Configuration

```properties
# application.properties
spring.cache.type=caffeine
spring.cache.caffeine.spec=maximumSize=200,expireAfterWrite=60s
```

```java
// CacheConfig.java — 3 named caches with different TTLs
"nifty50Data"   → 60s TTL  (all 50 stocks + index)
"stockQuote"    → 30s TTL  (individual stock: SUNPHARMA etc.)
"marketSummary" → 60s TTL  (aggregated stats)
```
