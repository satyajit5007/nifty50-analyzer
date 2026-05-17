package com.nifty50.analyzer.scheduler;

import com.nifty50.analyzer.service.NseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

/**
 * Spring Scheduler — periodically refreshes the NIFTY 50 cache.
 *
 * Flow:
 *   [Every 60s] → evict "nifty50Data" cache → re-fetch from Yahoo Finance
 *                → cache is warm for next request (near-instant response)
 *
 * This avoids calling Yahoo Finance on every user request, prevents rate-limiting,
 * and keeps the dashboard snappy even with 50 parallel HTTP calls per refresh.
 */
@Component
public class MarketScheduler {

    private static final Logger log = LoggerFactory.getLogger(MarketScheduler.class);

    private final NseService nseService;
    private final CacheManager cacheManager;

    public MarketScheduler(NseService nseService, CacheManager cacheManager) {
        this.nseService = nseService;
        this.cacheManager = cacheManager;
    }

    /**
     * Refresh NIFTY 50 data every 60 seconds.
     * initialDelay=10000 → first run 10s after startup (let app fully start).
     */
    @Scheduled(fixedRate = 60000, initialDelay = 10000)
    public void refreshNifty50Cache() {
        try {
            log.info("[Scheduler] Evicting & refreshing NIFTY 50 cache...");

            // Evict old cached data
            Objects.requireNonNull(cacheManager.getCache("nifty50Data")).clear();
            Objects.requireNonNull(cacheManager.getCache("marketSummary")).clear();

            // Re-fetch: @Cacheable in NseService will store the fresh result
            nseService.getNifty50IndexData();

            log.info("[Scheduler] NIFTY 50 cache refreshed successfully.");
        } catch (Exception e) {
            log.error("[Scheduler] Cache refresh failed: {}", e.getMessage());
        }
    }
}
