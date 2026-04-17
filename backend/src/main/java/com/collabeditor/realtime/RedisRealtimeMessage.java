package com.collabeditor.realtime;

import com.fasterxml.jackson.databind.JsonNode;

public record RedisRealtimeMessage(
        String originInstanceId,
        String event,
        String documentId,
        String excludeSessionId,
        String targetSessionId,
        JsonNode payload
) {
}
