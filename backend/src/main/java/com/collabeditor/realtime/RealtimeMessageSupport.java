package com.collabeditor.realtime;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class RealtimeMessageSupport {
    private final ObjectMapper objectMapper;

    public RealtimeMessageSupport(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ObjectNode objectNode() {
        return objectMapper.createObjectNode();
    }

    public JsonNode toJson(Object value) {
        return objectMapper.valueToTree(value);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> toMap(JsonNode value) {
        if (value == null || value.isNull()) {
            return Map.of();
        }

        return objectMapper.convertValue(value, Map.class);
    }

    public String encode(String event, Object payload) {
        ObjectNode envelope = objectMapper.createObjectNode();
        envelope.put("event", event);
        envelope.set("payload", toJson(payload == null ? Map.of() : payload));
        return envelope.toString();
    }

    public SocketEnvelope decode(String message) throws Exception {
        return objectMapper.readValue(message, SocketEnvelope.class);
    }

    public String text(JsonNode node, String fieldName) {
        JsonNode value = node == null ? null : node.get(fieldName);
        return value == null || value.isNull() ? null : value.asText();
    }
}
