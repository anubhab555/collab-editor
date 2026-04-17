package com.collabeditor.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "collab")
public record CollabProperties(
        Cors cors,
        Redis redis,
        Security security,
        AuthRateLimit authRateLimit
) {
    public record Cors(String allowedOrigins) {
    }

    public record Redis(boolean enabled, String channel) {
    }

    public record Security(String jwtSecret, long jwtExpiresInSeconds) {
    }

    public record AuthRateLimit(int maxRequests, long windowMs) {
    }
}
