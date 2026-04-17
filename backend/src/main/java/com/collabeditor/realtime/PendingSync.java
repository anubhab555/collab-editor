package com.collabeditor.realtime;

import java.time.Instant;

public record PendingSync(String documentId, String targetSessionId, Instant expiresAt) {
    public boolean isExpired(Instant now) {
        return expiresAt.isBefore(now);
    }
}
