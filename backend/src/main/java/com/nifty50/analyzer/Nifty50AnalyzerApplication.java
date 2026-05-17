package com.nifty50.analyzer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class Nifty50AnalyzerApplication {
    public static void main(String[] args) {
        SpringApplication.run(Nifty50AnalyzerApplication.class, args);
    }
}
