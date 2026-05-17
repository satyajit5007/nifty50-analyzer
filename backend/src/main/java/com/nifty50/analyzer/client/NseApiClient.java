package com.nifty50.analyzer.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.cookie.BasicCookieStore;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.util.Timeout;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * NSE India API client with proper session/cookie management.
 *
 * NSE requires visiting their homepage first to receive session cookies
 * (nsit, nseappid, bm_sv). Those cookies must then be sent with every API
 * request. Apache HttpClient 5's BasicCookieStore handles this automatically.
 *
 * Session flow:
 *   1. GET https://www.nseindia.com/          → initializes nsit + nseappid cookies
 *   2. GET /get-quotes/equity?symbol=SUNPHARMA → sets bm_sv (bot-management) cookie
 *   3. GET /api/quote-equity?symbol=SUNPHARMA → actual data (cookies forwarded auto)
 *
 * This client is used by NseService as the primary data source.
 * Yahoo Finance is the fallback if NSE returns an error or times out.
 */
@Component
public class NseApiClient {

    private static final Logger log = LoggerFactory.getLogger(NseApiClient.class);

    private static final String NSE_HOME         = "https://www.nseindia.com/";
    private static final String NSE_QUOTE_PAGE   = "https://www.nseindia.com/get-quotes/equity?symbol=";
    private static final String NSE_INDEX_API    = "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050";
    private static final String NSE_QUOTE_API    = "https://www.nseindia.com/api/quote-equity?symbol=";

    private final ObjectMapper objectMapper;

    // Cookie store shared across all requests — auto-populated on session init
    private BasicCookieStore cookieStore;
    private CloseableHttpClient httpClient;
    private volatile boolean sessionReady = false;
    private volatile long lastSessionInit = 0;

    // Re-initialize session every 4 minutes (NSE cookies expire ~5min)
    private static final long SESSION_TTL_MS = 4 * 60 * 1000L;

    public NseApiClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Fetches NIFTY 50 index data from NSE.
     * Returns null if NSE is unavailable (caller should fall back to Yahoo Finance).
     */
    public JsonNode fetchNifty50Index() {
        try {
            ensureSession();
            String json = get(NSE_INDEX_API, NSE_HOME + "market-data/live-equity-market");
            if (json == null || json.contains("\"error\"")) return null;
            JsonNode node = objectMapper.readTree(json);
            if (node.has("data") && node.path("data").size() > 0) {
                log.info("[NSE] Nifty50 index fetched: {} stocks", node.path("data").size());
                return node;
            }
            return null;
        } catch (Exception e) {
            log.warn("[NSE] fetchNifty50Index failed: {}", e.getMessage());
            sessionReady = false; // force re-init next time
            return null;
        }
    }

    /**
     * Fetches individual stock quote from NSE.
     * Returns null if NSE is unavailable.
     *
     * Response shape (NSE native):
     * { info:{...}, metadata:{...}, priceInfo:{...}, securityInfo:{...}, industryInfo:{...} }
     */
    public JsonNode fetchStockQuote(String symbol) {
        try {
            ensureSession();

            // Simulate user navigating to the quote page first (gets bm_sv cookie)
            get(NSE_QUOTE_PAGE + symbol.toUpperCase(), NSE_HOME);

            String json = get(NSE_QUOTE_API + symbol.toUpperCase(),
                NSE_HOME + "get-quotes/equity?symbol=" + symbol.toUpperCase());

            if (json == null || json.contains("\"error\"") || json.contains("Access Denied")) {
                return null;
            }

            JsonNode node = objectMapper.readTree(json);
            if (node.has("priceInfo")) {
                log.info("[NSE] Stock quote fetched for: {}", symbol);
                return node;
            }
            return null;
        } catch (Exception e) {
            log.warn("[NSE] fetchStockQuote({}) failed: {}", symbol, e.getMessage());
            sessionReady = false;
            return null;
        }
    }

    /**
     * Re-initializes the NSE session.
     * Called by MarketScheduler and on demand when a request fails.
     */
    public synchronized void refreshSession() {
        try {
            log.info("[NSE] Initializing session...");
            cookieStore = new BasicCookieStore();

            PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
            cm.setMaxTotal(20);
            cm.setDefaultMaxPerRoute(5);

            RequestConfig requestConfig = RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofSeconds(15))
                .setResponseTimeout(Timeout.ofSeconds(30))
                .build();

            // Close old client if exists
            if (httpClient != null) {
                try { httpClient.close(); } catch (IOException ignored) {}
            }

            httpClient = HttpClients.custom()
                .setDefaultCookieStore(cookieStore)
                .setConnectionManager(cm)
                .setDefaultRequestConfig(requestConfig)
                .disableAutomaticRetries()
                .build();
            // ↑ Apache HC5 automatically handles gzip/deflate decompression
            //   when Content-Encoding response header is present.

            // Step 1: Hit the NSE homepage to get nsit + nseappid cookies
            String homeResponse = get(NSE_HOME, null);
            log.debug("[NSE] Homepage fetched: {} bytes", homeResponse != null ? homeResponse.length() : 0);

            // Small delay to mimic human browsing
            Thread.sleep(1500);

            // Step 2: Hit market data page to strengthen session
            get(NSE_HOME + "market-data/live-equity-market", NSE_HOME);

            Thread.sleep(500);

            int cookieCount = cookieStore.getCookies().size();
            if (cookieCount > 0) {
                log.info("[NSE] Session initialized with {} cookies: {}",
                    cookieCount,
                    cookieStore.getCookies().stream()
                        .map(c -> c.getName() + "=" + c.getValue().substring(0, Math.min(8, c.getValue().length())) + "...")
                        .toList());
                sessionReady = true;
                lastSessionInit = System.currentTimeMillis();
            } else {
                log.warn("[NSE] Session init got 0 cookies — NSE may be blocking");
                sessionReady = false;
            }
        } catch (Exception e) {
            log.error("[NSE] Session initialization failed: {}", e.getMessage());
            sessionReady = false;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void ensureSession() {
        if (!sessionReady || System.currentTimeMillis() - lastSessionInit > SESSION_TTL_MS) {
            refreshSession();
        }
    }

    /**
     * Performs a GET request with full browser-mimicking headers.
     * Cookies are automatically sent/received via the shared cookieStore.
     */
    private String get(String url, String referer) {
        HttpGet request = new HttpGet(url);

        request.setHeader("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        request.setHeader("Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
        request.setHeader("Accept-Language", "en-US,en;q=0.9");
        // No Accept-Encoding — let Apache HC5 handle gzip/deflate transparently
        request.setHeader("Connection", "keep-alive");
        request.setHeader("Upgrade-Insecure-Requests", "1");
        request.setHeader("Sec-Fetch-Dest", "document");
        request.setHeader("Sec-Fetch-Mode", "navigate");
        request.setHeader("Sec-Fetch-Site", "same-origin");
        request.setHeader("Cache-Control", "no-cache");

        if (referer != null) {
            request.setHeader("Referer", referer);
        }

        // For API calls: override accept to prefer JSON
        if (url.contains("/api/")) {
            request.setHeader("Accept", "application/json, text/plain, */*");
            request.setHeader("X-Requested-With", "XMLHttpRequest");
            request.setHeader("Sec-Fetch-Dest", "empty");
            request.setHeader("Sec-Fetch-Mode", "cors");
        }

        try (CloseableHttpResponse response = httpClient.execute(request)) {
            int status = response.getCode();
            String body = EntityUtils.toString(response.getEntity(), "UTF-8");

            if (status == 200 && body != null) {
                return body;
            }
            log.warn("[NSE] GET {} returned HTTP {}", url, status);
            if (status == 401 || status == 403) {
                sessionReady = false; // force re-init
            }
            return null;
        } catch (Exception e) {
            log.error("[NSE] GET {} failed: {}", url, e.getMessage());
            return null;
        }
    }
}
