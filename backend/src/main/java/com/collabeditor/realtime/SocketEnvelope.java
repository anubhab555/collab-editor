package com.collabeditor.realtime;

import com.fasterxml.jackson.databind.JsonNode;

public record SocketEnvelope(String event, JsonNode payload) {
}
