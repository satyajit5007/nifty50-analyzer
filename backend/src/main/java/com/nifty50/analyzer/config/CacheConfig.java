package com.nifty50.analyzer.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Caffeine in-memory cache configuration.
 *
 * Two caches:
 *  - "nifty50Data"  : full 50-stock index snapshot, TTL 60s
 *  - "stockQuote"   : individual stock quote, TTL 30s
 *
 * To swap to Redis: replace this bean with RedisCacheManager
 * and add spring-boot-starter-data-redis to pom.xml.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(
            buildCache("nifty50Data", 60),   // 60s TTL — full index
            buildCache("stockQuote",  30),   // 30s TTL — individual quotes
            buildCache("marketSummary", 60)  // 60s TTL — summary stats
        ));
        return manager;
    }

    private CaffeineCache buildCache(String name, int ttlSeconds) {
        return new CaffeineCache(name,
            Caffeine.newBuilder()
                .expireAfterWrite(ttlSeconds, TimeUnit.SECONDS)
                .maximumSize(200)
                .recordStats()
                .build());
    }
}
