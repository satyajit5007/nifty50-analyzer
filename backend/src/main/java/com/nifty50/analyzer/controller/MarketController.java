package com.nifty50.analyzer.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nifty50.analyzer.service.NseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * REST controller exposing NSE market data to the React frontend.
 * All endpoints are prefixed with /api/market.
 * CORS allowed for React dev server (localhost:3000 and 5173).
 *
 * Endpoints:
 *   GET /api/market/nifty50         → full 50-stock index dataset (cached)
 *   GET /api/market/quote/{symbol}  → individual stock quote (cached 30s)
 *   GET /api/market/top-gainers     → top 10 stocks by % gain
 *   GET /api/market/top-losers      → top 10 stocks by % loss
 *   GET /api/market/market-summary  → index level, advances/declines, volume leaders
 *   GET /api/market/health          → health check
 */
@RestController
@RequestMapping("/api/market")
@CrossOrigin(origins = {
    // ── Local development ─────────────────────────────
    "http://localhost:3000",
    "http://localhost:5173",
    "https://nifty50-analyzer.vercel.app",   // ← vercel URL (you'll get it next)
    "https://nifty50-analyzer-cloud.vercel.app"
})
public class MarketController {

    private static final Logger log = LoggerFactory.getLogger(MarketController.class);

    private final NseService nseService;
    private final ObjectMapper objectMapper;

    public MarketController(NseService nseService, ObjectMapper objectMapper) {
        this.nseService = nseService;
        this.objectMapper = objectMapper;
    }

    // ── 1. Full NIFTY 50 Index Data ───────────────────────────────────────────

    @GetMapping("/nifty50")
    public ResponseEntity<?> getNifty50Index() {
        try {
            log.info("Fetching NIFTY 50 index data");
            return ResponseEntity.ok(nseService.getNifty50IndexData());
        } catch (Exception e) {
            log.error("Error fetching NIFTY 50: {}", e.getMessage());
            return error("Failed to fetch NIFTY 50 data", e.getMessage(),
                "NSE/Yahoo Finance may be unavailable. Cached data will serve next request.");
        }
    }

    // ── 2. Individual Stock Quote ─────────────────────────────────────────────

    @GetMapping("/quote/{symbol}")
    public ResponseEntity<?> getStockQuote(@PathVariable String symbol) {
        try {
            // ── Security: sanitize symbol input ───────────────────────────
            if (symbol == null || symbol.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Symbol cannot be empty"));
            }
            // Allow only uppercase letters, digits, ampersand (for M&M), hyphen — max 20 chars
            String clean = symbol.toUpperCase().replaceAll("[^A-Z0-9&\\-]", "");
            if (clean.isBlank() || clean.length() > 20) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid symbol: " + symbol));
            }
            log.info("Fetching stock quote for: {}", clean);
            return ResponseEntity.ok(nseService.getStockQuote(clean));
        } catch (Exception e) {
            log.error("Error fetching quote for {}: {}", symbol, e.getMessage());
            return error("Failed to fetch quote for " + symbol, null, null);
        }
    }

    // ── 3. Top Gainers ────────────────────────────────────────────────────────

    /**
     * GET /api/market/top-gainers
     * Returns top 10 NIFTY 50 stocks sorted by % change (descending).
     */
    @GetMapping("/top-gainers")
    public ResponseEntity<?> getTopGainers() {
        try {
            log.info("Fetching top gainers");
            List<JsonNode> stocks = getStockList();
            stocks.sort(Comparator.comparingDouble(
                n -> -n.path("pChange").asDouble(0)));
            ArrayNode result = objectMapper.createArrayNode();
            stocks.stream().limit(10).forEach(result::add);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error fetching top gainers: {}", e.getMessage());
            return error("Failed to fetch top gainers", e.getMessage(), null);
        }
    }

    // ── 4. Top Losers ─────────────────────────────────────────────────────────

    /**
     * GET /api/market/top-losers
     * Returns top 10 NIFTY 50 stocks with worst % change (ascending).
     */
    @GetMapping("/top-losers")
    public ResponseEntity<?> getTopLosers() {
        try {
            log.info("Fetching top losers");
            List<JsonNode> stocks = getStockList();
            stocks.sort(Comparator.comparingDouble(
                n -> n.path("pChange").asDouble(0)));
            ArrayNode result = objectMapper.createArrayNode();
            stocks.stream().limit(10).forEach(result::add);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error fetching top losers: {}", e.getMessage());
            return error("Failed to fetch top losers", e.getMessage(), null);
        }
    }

    // ── 5. Market Summary ─────────────────────────────────────────────────────

    /**
     * GET /api/market/market-summary
     * Returns aggregated market statistics.
     * {
     *   "indexValue": 24870.5,
     *   "indexChange": +145.3,
     *   "indexPChange": +0.59,
     *   "advances": 32, "declines": 18, "unchanged": 0,
     *   "timestamp": "...",
     *   "topVolumeLeaders": [ top 5 by traded volume ],
     *   "marketBreadth": 1.78   // advances / declines ratio
     * }
     */
    @GetMapping("/market-summary")
    public ResponseEntity<?> getMarketSummary() {
        try {
            log.info("Fetching market summary");
            JsonNode indexData = nseService.getNifty50IndexData();
            List<JsonNode> stocks = getStockList(indexData);

            // Volume leaders
            List<JsonNode> volLeaders = new ArrayList<>(stocks);
            volLeaders.sort(Comparator.comparingLong(
                n -> -n.path("totalTradedVolume").asLong(0)));

            ArrayNode volumeLeaders = objectMapper.createArrayNode();
            volLeaders.stream().limit(5).forEach(volumeLeaders::add);

            int advances  = Integer.parseInt(indexData.path("advance").path("advances").asText("0"));
            int declines  = Integer.parseInt(indexData.path("advance").path("declines").asText("0"));
            double breadth = declines > 0 ? (double) advances / declines : advances;

            ObjectNode summary = objectMapper.createObjectNode();
            summary.put("indexValue",    indexData.path("indexValue").asDouble(0));
            summary.put("indexChange",   indexData.path("indexChange").asDouble(0));
            summary.put("indexPChange",  indexData.path("indexPChange").asDouble(0));
            summary.put("advances",      advances);
            summary.put("declines",      declines);
            summary.put("unchanged",     Integer.parseInt(indexData.path("advance").path("unchanged").asText("0")));
            summary.put("timestamp",     indexData.path("timestamp").asText());
            summary.put("marketBreadth", Math.round(breadth * 100.0) / 100.0);
            summary.put("totalStocks",   stocks.size());
            summary.set("volumeLeaders", volumeLeaders);

            return ResponseEntity.ok(summary);
        } catch (Exception e) {
            log.error("Error fetching market summary: {}", e.getMessage());
            return error("Failed to fetch market summary", e.getMessage(), null);
        }
    }

    // ── 6. Health Check ───────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
            "status",  "UP",
            "service", "Nifty 50 Analyzer API",
            "version", "2.0"
        ));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private List<JsonNode> getStockList() {
        return getStockList(nseService.getNifty50IndexData());
    }

    private List<JsonNode> getStockList(JsonNode indexData) {
        List<JsonNode> stocks = new ArrayList<>();
        indexData.path("data").forEach(stocks::add);
        return stocks;
    }

    private ResponseEntity<?> error(String error, String message, String hint) {
        var body = new java.util.LinkedHashMap<String, String>();
        body.put("error", error);
        // ── Security: never expose raw exception messages to clients ──────
        // message is only logged (server-side), never returned to the browser
        if (hint != null) body.put("hint", hint);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
