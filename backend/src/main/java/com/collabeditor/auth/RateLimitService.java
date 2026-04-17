package com.collabeditor.auth;

import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.collabeditor.common.AppException;
import com.collabeditor.config.CollabProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {
    private final Map<String, Bucket> authBuckets = new ConcurrentHashMap<>();
    private final Clock clock;
    private final int maxRequests;
    private final long windowMs;

    @Autowired
    public RateLimitService(CollabProperties properties) {
        this(properties, Clock.systemUTC());
    }

    RateLimitService(CollabProperties properties, Clock clock) {
        this.clock = clock;
        this.maxRequests = properties.authRateLimit().maxRequests();
        this.windowMs = properties.authRateLimit().windowMs();
    }

    public void checkAuthWriteAllowed(HttpServletRequest request) {
        String key = getClientIp(request);
        long now = clock.millis();
        Bucket bucket = authBuckets.compute(key, (ignored, existing) -> {
            if (existing == null || existing.resetAt <= now) {
                return new Bucket(1, now + windowMs);
            }

            return new Bucket(existing.count + 1, existing.resetAt);
        });

        if (bucket.count > maxRequests) {
            throw new AppException("Too many auth attempts. Please wait and try again.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private record Bucket(int count, long resetAt) {
    }
}
