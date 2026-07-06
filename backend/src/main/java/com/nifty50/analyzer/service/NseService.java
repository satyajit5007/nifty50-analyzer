package com.nifty50.analyzer.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nifty50.analyzer.client.NseApiClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * Market data service.
 *
 * Data source priority:
 *   1. NSE India API (native, richest data — PE ratio, 52W H/L with dates, sector info)
 *      Primary endpoints:
 *        - GET /api/equity-stockIndices?index=NIFTY%2050   (index + all 50 stocks)
 *        - GET /api/quote-equity?symbol=SUNPHARMA           (individual stock detail)
 *
 *   2. Yahoo Finance (fallback if NSE is blocked/unreachable)
 *      Used because NSE has Cloudflare bot protection that intermittently
 *      blocks automated clients. Yahoo Finance always works reliably.
 *
 * All public methods are @Cacheable. MarketScheduler refreshes every 60s.
 */
@Service
@EnableScheduling
public class NseService {

    private static final Logger log = LoggerFactory.getLogger(NseService.class);

    // Yahoo Finance fallback
    private static final String YF_CHART_URL =
        "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=1d";
    private static final String NIFTY_INDEX_SYMBOL = "%5ENSEI";

    /**
     * NIFTY 50 constituents — Yahoo Finance tickers for fallback.
     * Corrections: INFY (not INFOSYS), TATAMOTORS→TMPV (demerged Oct 2025), LTIM→LTM
     */
    private static final List<String[]> NIFTY50_SYMBOLS = List.of(
        new String[]{"RELIANCE",   "RELIANCE.NS"},
        new String[]{"TCS",        "TCS.NS"},
        new String[]{"HDFCBANK",   "HDFCBANK.NS"},
        new String[]{"BHARTIARTL", "BHARTIARTL.NS"},
        new String[]{"ICICIBANK",  "ICICIBANK.NS"},
        new String[]{"INFY",       "INFY.NS"},
        new String[]{"SBIN",       "SBIN.NS"},
        new String[]{"HINDUNILVR", "HINDUNILVR.NS"},
        new String[]{"ITC",        "ITC.NS"},
        new String[]{"LT",         "LT.NS"},
        new String[]{"KOTAKBANK",  "KOTAKBANK.NS"},
        new String[]{"HCLTECH",    "HCLTECH.NS"},
        new String[]{"AXISBANK",   "AXISBANK.NS"},
        new String[]{"BAJFINANCE", "BAJFINANCE.NS"},
        new String[]{"WIPRO",      "WIPRO.NS"},
        new String[]{"ASIANPAINT", "ASIANPAINT.NS"},
        new String[]{"MARUTI",     "MARUTI.NS"},
        new String[]{"NTPC",       "NTPC.NS"},
        new String[]{"ONGC",       "ONGC.NS"},
        new String[]{"ULTRACEMCO", "ULTRACEMCO.NS"},
        new String[]{"BAJAJFINSV", "BAJAJFINSV.NS"},
        new String[]{"POWERGRID",  "POWERGRID.NS"},
        new String[]{"TITAN",      "TITAN.NS"},
        new String[]{"SUNPHARMA",  "SUNPHARMA.NS"},
        new String[]{"ADANIENT",   "ADANIENT.NS"},
        new String[]{"TATAMOTORS", "TMPV.NS"},
        new String[]{"NESTLEIND",  "NESTLEIND.NS"},
        new String[]{"JSWSTEEL",   "JSWSTEEL.NS"},
        new String[]{"TATASTEEL",  "TATASTEEL.NS"},
        new String[]{"TECHM",      "TECHM.NS"},
        new String[]{"ADANIPORTS", "ADANIPORTS.NS"},
        new String[]{"COALINDIA",  "COALINDIA.NS"},
        new String[]{"INDUSINDBK", "INDUSINDBK.NS"},
        new String[]{"HINDALCO",   "HINDALCO.NS"},
        new String[]{"GRASIM",     "GRASIM.NS"},
        new String[]{"CIPLA",      "CIPLA.NS"},
        new String[]{"DRREDDY",    "DRREDDY.NS"},
        new String[]{"EICHERMOT",  "EICHERMOT.NS"},
        new String[]{"BPCL",       "BPCL.NS"},
        new String[]{"BRITANNIA",  "BRITANNIA.NS"},
        new String[]{"APOLLOHOSP", "APOLLOHOSP.NS"},
        new String[]{"TATACONSUM", "TATACONSUM.NS"},
        new String[]{"DIVISLAB",   "DIVISLAB.NS"},
        new String[]{"SHRIRAMFIN", "SHRIRAMFIN.NS"},
        new String[]{"BAJAJ-AUTO", "BAJAJ-AUTO.NS"},
        new String[]{"HEROMOTOCO", "HEROMOTOCO.NS"},
        new String[]{"LTIM",       "LTM.NS"},
        new String[]{"SBILIFE",    "SBILIFE.NS"},
        new String[]{"HDFCLIFE",   "HDFCLIFE.NS"},
        new String[]{"M&M",        "M&M.NS"}
    );

    private final ExecutorService executor = Executors.newFixedThreadPool(20);
    private final NseApiClient nseApiClient;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public NseService(NseApiClient nseApiClient, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.nseApiClient = nseApiClient;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Returns NIFTY 50 full dataset.
     * Tries NSE first — if blocked, falls back to Yahoo Finance.
     *
     * Response shape (frontend expects):
     * {
     *   "source": "NSE" | "YAHOO",
     *   "indexValue": 24870.5,   ← actual ^NSEI value
     *   "indexChange": +145.3,
     *   "indexPChange": +0.59,
     *   "name": "NIFTY 50",
     *   "timestamp": "16-May-2026 14:25:00",
     *   "advance": { "advances": "32", "declines": "18", "unchanged": "0" },
     *   "data": [ { symbol, lastPrice, open, dayHigh, dayLow, pChange, change,
     *               totalTradedVolume, fiftyTwoWeekHigh, fiftyTwoWeekLow, ... } ]
     * }
     */
    @Cacheable("nifty50Data")
    public JsonNode getNifty50IndexData() {
        // ── Try NSE first ───────────────────────────────────────────────────
        log.info("Fetching NIFTY 50 data — trying NSE India first...");
        JsonNode nseData = nseApiClient.fetchNifty50Index();

        if (nseData != null && nseData.has("data") && nseData.path("data").size() > 1) {
            log.info("[NSE] ✓ Using NSE India data ({} stocks)", nseData.path("data").size());
            return enrichNseIndexData(nseData);
        }

        // ── Fallback to Yahoo Finance ────────────────────────────────────────
        log.warn("[NSE] ✗ NSE unavailable — falling back to Yahoo Finance");
        return fetchFromYahooFinance();
    }

    /**
     * Returns detailed quote for a single stock.
     * Tries NSE /api/quote-equity first (richer data), fallback to Yahoo Finance.
     *
     * NSE gives: PE ratio, 52W H/L with dates, sector, ISIN, face value, etc.
     */
    @Cacheable(value = "stockQuote", key = "#symbol")
    public JsonNode getStockQuote(String symbol) {
        log.info("Fetching stock quote for: {} — trying NSE first", symbol);

        // ── Try NSE quote endpoint ───────────────────────────────────────────
        JsonNode nseQuote = nseApiClient.fetchStockQuote(symbol);

        if (nseQuote != null && nseQuote.has("priceInfo")) {
            log.info("[NSE] ✓ Using NSE quote for {} (PE, 52W, sector available)", symbol);
            return mapNseQuote(symbol, nseQuote);
        }

        // ── Fallback to Yahoo Finance ────────────────────────────────────────
        log.warn("[NSE] ✗ NSE quote unavailable for {} — falling back to Yahoo Finance", symbol);
        return fetchYahooQuote(symbol);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  NSE response mapping
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Enriches the raw NSE index response:
     * - Adds indexValue/indexChange/indexPChange from the first row (NIFTY 50 itself)
     * - Normalizes stock entries to match the frontend's expected shape
     * - Tags the source as "NSE"
     */
    private JsonNode enrichNseIndexData(JsonNode raw) {
        ObjectNode result = objectMapper.createObjectNode();
        result.put("source",       "NSE");
        result.put("name",         raw.path("name").asText("NIFTY 50"));
        result.put("timestamp",    raw.path("timestamp").asText(
            LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd-MMM-yyyy HH:mm:ss"))));
        // dataFetchedAt = exact moment backend pulled this from NSE (for debugging staleness)
        result.put("dataFetchedAt", LocalDateTime.now()
            .format(DateTimeFormatter.ofPattern("dd-MMM-yyyy HH:mm:ss")));

        // The first item in NSE data is the index itself
        JsonNode indexRow = raw.path("data").path(0);
        result.put("indexValue",   r2(indexRow.path("lastPrice").asDouble(0)));
        result.put("indexChange",  r2(indexRow.path("change").asDouble(0)));
        result.put("indexPChange", r2(indexRow.path("pChange").asDouble(0)));

        // Advance/decline info
        result.set("advance", raw.path("advance"));

        // Index-level lastUpdateTime — used as fallback for stocks that don't carry it
        String indexLastUpdateTime = indexRow.path("lastUpdateTime").asText("");

        // Normalize each stock entry
        ArrayNode dataArray = objectMapper.createArrayNode();
        raw.path("data").forEach(stock -> {
            ObjectNode s = objectMapper.createObjectNode();

            // ── Core price fields ──────────────────────────────────────────
            s.put("symbol",            stock.path("symbol").asText());
            // companyName comes from the nested "meta" object in NSE equity-stockIndices
            s.put("companyName",       stock.path("meta").path("companyName")
                                            .asText(stock.path("symbol").asText()));
            s.put("industry",          stock.path("meta").path("industry").asText(""));
            s.put("lastPrice",         r2(stock.path("lastPrice").asDouble(0)));
            s.put("open",              r2(stock.path("open").asDouble(0)));
            s.put("dayHigh",           r2(stock.path("dayHigh").asDouble(0)));
            s.put("dayLow",            r2(stock.path("dayLow").asDouble(0)));
            s.put("previousClose",     r2(stock.path("previousClose").asDouble(0)));
            s.put("change",            r2(stock.path("change").asDouble(0)));
            s.put("pChange",           r2(stock.path("pChange").asDouble(0)));

            // ── Volume & Value ─────────────────────────────────────────────
            s.put("totalTradedVolume", stock.path("totalTradedVolume").asLong(0));
            s.put("totalTradedValue",  r2(stock.path("totalTradedValue").asDouble(0)));

            // ── 52-Week High / Low ─────────────────────────────────────────
            // NSE field names: yearHigh, yearLow (not fiftyTwoWeekHigh)
            s.put("fiftyTwoWeekHigh",  r2(stock.path("yearHigh").asDouble(0)));
            s.put("fiftyTwoWeekLow",   r2(stock.path("yearLow").asDouble(0)));

            // ── Performance Metrics — pass NSE's exact values, no extra rounding ──
            // r2() on NSE's already-rounded values can cause -5.18 → -5.16 drift
            s.put("perChange365d",     stock.path("perChange365d").asDouble(0));
            s.put("perChange30d",      stock.path("perChange30d").asDouble(0));
            // Reference dates for the performance windows
            s.put("date365dAgo",       stock.path("date365dAgo").asText(""));
            s.put("date30dAgo",        stock.path("date30dAgo").asText(""));

            // ── Distance from 52W High/Low (NSE-exclusive) ─────────────────
            s.put("nearWKH",           r2(stock.path("nearWKH").asDouble(0)));
            s.put("nearWKL",           r2(stock.path("nearWKL").asDouble(0)));

            // ── Timestamp — fallback to index-level time if stock row lacks it ──
            String stockUpdateTime = stock.path("lastUpdateTime").asText("");
            s.put("lastUpdateTime",    stockUpdateTime.isBlank() ? indexLastUpdateTime : stockUpdateTime);

            // ffmc = Free Float Market Cap (used to compute index weight %)
            s.put("ffmc",              r2(stock.path("ffmc").asDouble(0)));

            // ── NSE Chart URL paths (embedded charts) ─────────────────────
            s.put("chart30dPath",      stock.path("chart30dPath").asText(""));
            s.put("chart365dPath",     stock.path("chart365dPath").asText(""));
            s.put("chartTodayPath",    stock.path("chartTodayPath").asText(""));

            dataArray.add(s);
        });

        result.set("data", dataArray);
        return result;
    }

    /**
     * Maps the rich NSE quote response to the shape StockDetail.jsx expects.
     * Preserves ALL NSE-specific fields: PE ratio, 52W H/L with dates, ISIN, etc.
     */
    private JsonNode mapNseQuote(String symbol, JsonNode nse) {
        ObjectNode result = objectMapper.createObjectNode();
        result.put("source", "NSE");

        // ─ info block ─
        JsonNode info = nse.path("info");
        ObjectNode infoOut = objectMapper.createObjectNode();
        infoOut.put("symbol",      info.path("symbol").asText(symbol));
        infoOut.put("companyName", info.path("companyName").asText(symbol));
        infoOut.put("industry",    info.path("industry").asText("N/A"));
        infoOut.put("isin",        info.path("isin").asText(""));
        infoOut.put("series",      info.path("activeSeries").path(0).asText("EQ"));
        infoOut.put("status",      "Listed");
        result.set("info", infoOut);

        // ─ priceInfo block ─
        JsonNode pi = nse.path("priceInfo");
        ObjectNode priceOut = objectMapper.createObjectNode();
        priceOut.put("lastPrice",     r2(pi.path("lastPrice").asDouble(0)));
        priceOut.put("open",          r2(pi.path("open").asDouble(0)));
        priceOut.put("close",         r2(pi.path("close").asDouble(0)));
        priceOut.put("previousClose", r2(pi.path("previousClose").asDouble(0)));
        priceOut.put("change",        r2(pi.path("change").asDouble(0)));
        priceOut.put("pChange",       r2(pi.path("pChange").asDouble(0)));
        priceOut.put("vwap",          r2(pi.path("vwap").asDouble(0)));

        // Intraday H/L
        JsonNode intraDayHL = pi.path("intraDayHighLow");
        priceOut.put("dayHigh", r2(intraDayHL.path("max").asDouble(pi.path("lastPrice").asDouble(0))));
        priceOut.put("dayLow",  r2(intraDayHL.path("min").asDouble(pi.path("lastPrice").asDouble(0))));

        // 52-week H/L with dates — NSE gives these!
        JsonNode whl = pi.path("weekHighLow");
        ObjectNode weekHighLow = objectMapper.createObjectNode();
        weekHighLow.put("max",     r2(whl.path("max").asDouble(0)));
        weekHighLow.put("min",     r2(whl.path("min").asDouble(0)));
        weekHighLow.put("maxDate", whl.path("maxDate").asText(""));
        weekHighLow.put("minDate", whl.path("minDate").asText(""));
        priceOut.set("weekHighLow", weekHighLow);

        // Performance % changes — from NSE metadata block
        JsonNode metaForPerf = nse.path("metadata");
        priceOut.put("perChange30d",  r2(metaForPerf.path("pChange").asDouble(0)));   // today's %
        priceOut.put("perChange365d", r2(metaForPerf.path("perChange365d").asDouble(0))); // 1Y %

        result.set("priceInfo", priceOut);

        // ─ metadata block — PE ratio is here ─
        JsonNode meta = nse.path("metadata");
        ObjectNode metaOut = objectMapper.createObjectNode();
        metaOut.put("totalTradedVolume", meta.path("totalTradedVolume").asLong(0));
        metaOut.put("totalTradedValue",  r2(meta.path("totalTradedValue").asDouble(0)));
        metaOut.put("pdSymbolPe",        r2(meta.path("pdSymbolPe").asDouble(0)));   // Stock P/E
        metaOut.put("pdSectorPe",        r2(meta.path("pdSectorPe").asDouble(0)));   // Sector P/E
        metaOut.put("pdSectorInd",       meta.path("pdSectorInd").asText(""));       // Index name
        metaOut.put("series",            meta.path("series").asText("EQ"));
        metaOut.put("lastUpdateTime",    meta.path("lastUpdateTime").asText(""));
        result.set("metadata", metaOut);

        // ─ securityInfo block ─
        JsonNode sec = nse.path("securityInfo");
        ObjectNode secOut = objectMapper.createObjectNode();
        secOut.put("faceValue",      sec.path("faceValue").asInt(1));
        secOut.put("issuedSize",     sec.path("issuedSize").asLong(0));
        secOut.put("tradingStatus",  sec.path("tradingStatus").asText("Active"));
        result.set("securityInfo", secOut);

        // ─ industryInfo block ─
        result.set("industryInfo", nse.path("industryInfo"));

        return result;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Yahoo Finance fallback
    // ──────────────────────────────────────────────────────────────────────────

    private JsonNode fetchFromYahooFinance() {
        log.info("[Yahoo] Fetching 50 stocks + ^NSEI index in parallel...");

        CompletableFuture<ObjectNode> indexFuture = CompletableFuture.supplyAsync(
            this::fetchNiftyIndexValue, executor);

        List<CompletableFuture<ObjectNode>> stockFutures = NIFTY50_SYMBOLS.stream()
            .map(pair -> CompletableFuture.supplyAsync(
                () -> fetchYahooStock(pair[0], pair[1]), executor))
            .collect(Collectors.toList());

        ArrayNode dataArray = objectMapper.createArrayNode();
        int advances = 0, declines = 0, unchanged = 0;

        for (CompletableFuture<ObjectNode> f : stockFutures) {
            try {
                ObjectNode node = f.get();
                if (node != null) {
                    dataArray.add(node);
                    double pChange = node.path("pChange").asDouble(0);
                    if      (pChange > 0) advances++;
                    else if (pChange < 0) declines++;
                    else                  unchanged++;
                }
            } catch (Exception e) {
                log.warn("[Yahoo] Error collecting future: {}", e.getMessage());
            }
        }

        ObjectNode indexInfo;
        try { indexInfo = indexFuture.get(); }
        catch (Exception e) { indexInfo = objectMapper.createObjectNode(); }

        ObjectNode result = objectMapper.createObjectNode();
        result.put("source",       "YAHOO");
        result.put("name",         "NIFTY 50");
        result.put("timestamp",    LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd-MMM-yyyy HH:mm:ss")));
        result.put("indexValue",   indexInfo.path("lastPrice").asDouble(0));
        result.put("indexChange",  indexInfo.path("change").asDouble(0));
        result.put("indexPChange", indexInfo.path("pChange").asDouble(0));
        result.set("data",         dataArray);

        ObjectNode advance = objectMapper.createObjectNode();
        advance.put("advances",  String.valueOf(advances));
        advance.put("declines",  String.valueOf(declines));
        advance.put("unchanged", String.valueOf(unchanged));
        result.set("advance", advance);

        log.info("[Yahoo] Fetched {}/50 stocks. ADV:{} DEC:{} UNC:{} | ^NSEI={}",
            dataArray.size(), advances, declines, unchanged,
            indexInfo.path("lastPrice").asDouble(0));
        return result;
    }

    private JsonNode fetchYahooQuote(String symbol) {
        String yahooTicker = NIFTY50_SYMBOLS.stream()
            .filter(p -> p[0].equalsIgnoreCase(symbol))
            .map(p -> p[1])
            .findFirst()
            .orElse(symbol.toUpperCase() + ".NS");

        ObjectNode stockNode = fetchYahooStock(symbol.toUpperCase(), yahooTicker);
        if (stockNode == null) throw new RuntimeException("No data for: " + symbol);

        ObjectNode result   = objectMapper.createObjectNode();
        result.put("source", "YAHOO");

        ObjectNode info = objectMapper.createObjectNode();
        info.put("symbol",      symbol.toUpperCase());
        info.put("companyName", stockNode.path("meta").path("longName").asText(symbol));
        info.put("industry",    "N/A");
        result.set("info", info);

        JsonNode meta = stockNode.path("meta");
        ObjectNode priceInfo = objectMapper.createObjectNode();
        priceInfo.put("lastPrice",      stockNode.path("lastPrice").asDouble());
        priceInfo.put("open",           stockNode.path("open").asDouble());
        priceInfo.put("close",          stockNode.path("previousClose").asDouble());
        priceInfo.put("previousClose",  stockNode.path("previousClose").asDouble());
        priceInfo.put("dayHigh",        stockNode.path("dayHigh").asDouble());
        priceInfo.put("dayLow",         stockNode.path("dayLow").asDouble());
        priceInfo.put("change",         stockNode.path("change").asDouble());
        priceInfo.put("pChange",        stockNode.path("pChange").asDouble());
        ObjectNode weekHighLow = objectMapper.createObjectNode();
        weekHighLow.put("max", r2(meta.path("fiftyTwoWeekHigh").asDouble(0)));
        weekHighLow.put("min", r2(meta.path("fiftyTwoWeekLow").asDouble(0)));
        priceInfo.set("weekHighLow", weekHighLow);
        result.set("priceInfo", priceInfo);

        ObjectNode metaOut = objectMapper.createObjectNode();
        metaOut.put("totalTradedVolume", stockNode.path("totalTradedVolume").asLong(0));
        result.set("metadata", metaOut);

        return result;
    }

    private ObjectNode fetchNiftyIndexValue() {
        ObjectNode node = fetchYahooStock("NIFTY 50", NIFTY_INDEX_SYMBOL);
        return node != null ? node : objectMapper.createObjectNode();
    }

    private ObjectNode fetchYahooStock(String displaySymbol, String yahooTicker) {
        String rawUrl = String.format(YF_CHART_URL, yahooTicker.replace("&", "%26"));
        URI uri = URI.create(rawUrl);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
            headers.set(HttpHeaders.ACCEPT, "application/json");
            headers.set(HttpHeaders.REFERER, "https://finance.yahoo.com/");

            ResponseEntity<String> response = restTemplate.exchange(
                uri, HttpMethod.GET, new HttpEntity<>(headers), String.class);

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) return null;

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode meta = root.path("chart").path("result").path(0).path("meta");
            if (meta.isMissingNode()) return null;

            double lastPrice = meta.path("regularMarketPrice").asDouble(0);
            double prevClose = meta.has("chartPreviousClose") 
                ? meta.path("chartPreviousClose").asDouble() 
                : meta.path("previousClose").asDouble(0);
            double open      = meta.has("regularMarketOpen") 
                ? meta.path("regularMarketOpen").asDouble() 
                : (prevClose != 0 ? prevClose : lastPrice);
            double dayHigh   = meta.path("regularMarketDayHigh").asDouble(0);
            double dayLow    = meta.path("regularMarketDayLow").asDouble(0);
            double change    = lastPrice - prevClose;
            double pChange   = prevClose != 0 ? (change / prevClose) * 100.0 : 0;

            ObjectNode node = objectMapper.createObjectNode();
            node.put("symbol",            displaySymbol);
            node.put("lastPrice",         r2(lastPrice));
            node.put("open",              r2(open));
            node.put("dayHigh",           r2(dayHigh));
            node.put("dayLow",            r2(dayLow));
            node.put("previousClose",     r2(prevClose));
            node.put("change",            r2(change));
            node.put("pChange",           r2(pChange));
            node.put("totalTradedVolume", meta.path("regularMarketVolume").asLong(0));
            node.put("fiftyTwoWeekHigh",  r2(meta.path("fiftyTwoWeekHigh").asDouble(0)));
            node.put("fiftyTwoWeekLow",   r2(meta.path("fiftyTwoWeekLow").asDouble(0)));
            node.set("meta", meta);
            return node;

        } catch (Exception e) {
            log.error("[Yahoo] Error fetching {} → {}: {}", displaySymbol, yahooTicker, e.getMessage());
            return null;
        }
    }

    private double r2(double v) { return Math.round(v * 100.0) / 100.0; }
}
