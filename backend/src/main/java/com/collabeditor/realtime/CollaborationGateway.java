package com.collabeditor.realtime;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import com.collabeditor.document.DocumentDtos.HistoryPayload;
import com.collabeditor.document.DocumentDtos.LoadDocumentPayload;
import com.collabeditor.document.DocumentDtos.RestoreResult;
import com.collabeditor.document.DocumentDtos.SaveResult;
import com.collabeditor.document.DocumentService;
import com.collabeditor.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Component
public class CollaborationGateway {
    private static final int SYNC_TIMEOUT_SECONDS = 5;

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, SessionState> sessionStates = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> roomSessions = new ConcurrentHashMap<>();
    private final Map<String, PendingSync> pendingDocumentSyncs = new ConcurrentHashMap<>();
    private final Map<String, PendingSync> pendingAwarenessSyncs = new ConcurrentHashMap<>();
    private final String instanceId = UUID.randomUUID().toString();

    private final DocumentService documentService;
    private final ObjectProvider<RedisRealtimeBus> redisRealtimeBusProvider;
    private final RealtimeMessageSupport messages;

    public CollaborationGateway(
            DocumentService documentService,
            ObjectProvider<RedisRealtimeBus> redisRealtimeBusProvider,
            RealtimeMessageSupport messages
    ) {
        this.documentService = documentService;
        this.redisRealtimeBusProvider = redisRealtimeBusProvider;
        this.messages = messages;
    }

    public void register(WebSocketSession session, AuthenticatedUser user) {
        sessions.put(session.getId(), session);
        sessionStates.put(session.getId(), new SessionState(user));
        send(session, "connected", Map.of("sessionId", session.getId()));
    }

    public void unregister(WebSocketSession session) {
        SessionState state = sessionStates.remove(session.getId());
        sessions.remove(session.getId());
        if (state == null) return;

        leaveRoom(session.getId(), state);
    }

    public void handle(WebSocketSession session, SocketEnvelope envelope) {
        SessionState state = sessionStates.get(session.getId());
        if (state == null) return;

        JsonNode payload = envelope.payload();
        switch (envelope.event()) {
            case "get-document" -> handleGetDocument(session, state, payload);
            case "join-document" -> handleJoinDocument(session, state, payload);
            case "get-document-history" -> handleGetDocumentHistory(session, state, payload);
            case "yjs-update" -> handleYjsUpdate(session, state, payload);
            case "document-sync" -> handleDocumentSync(state, payload);
            case "awareness-update" -> handleAwarenessUpdate(session, state, payload);
            case "awareness-sync" -> handleAwarenessSync(state, payload);
            case "awareness-leave" -> handleAwarenessLeave(session, state, payload);
            case "save-document" -> handleSaveDocument(session, state, payload);
            case "restore-version" -> handleRestoreVersion(session, state, payload);
            default -> {
            }
        }
    }

    public int activeSocketCount() {
        return sessions.size();
    }

    public int activeDocumentRoomCount() {
        return (int) roomSessions.entrySet().stream().filter(entry -> !entry.getValue().isEmpty()).count();
    }

    public boolean isRedisEnabled() {
        RedisRealtimeBus redisRealtimeBus = redisRealtimeBusProvider.getIfAvailable();
        return redisRealtimeBus != null && redisRealtimeBus.isEnabled();
    }

    public void applyRemoteMessage(RedisRealtimeMessage message) {
        if (instanceId.equals(message.originInstanceId())) return;

        if (message.targetSessionId() != null) {
            WebSocketSession target = sessions.get(message.targetSessionId());
            if (target != null) {
                send(target, message.event(), message.payload());
            }
            return;
        }

        sendLocalRoom(message.documentId(), message.event(), message.payload(), message.excludeSessionId());
    }

    private void handleGetDocument(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = payload.isTextual() ? payload.asText() : messages.text(payload, "documentId");
        if (documentId == null || documentId.isBlank()) return;

        try {
            if (state.documentId() != null) {
                leaveRoom(session.getId(), state);
            }

            LoadDocumentPayload document = documentService.loadDocumentState(documentId, state.user());
            state.documentId(documentId);
            roomSessions.computeIfAbsent(documentId, ignored -> ConcurrentHashMap.newKeySet()).add(session.getId());
            send(session, "load-document", document);

            if (roomSize(documentId) > 1) {
                String requestId = registerPending(pendingDocumentSyncs, documentId, session.getId());
                ObjectNode request = messages.objectNode();
                request.put("documentId", documentId);
                request.put("requestId", requestId);
                request.put("targetSocketId", session.getId());
                broadcast(documentId, "request-document-sync", request, session.getId());
            }
        } catch (Exception error) {
            sendDocumentError(session, error);
        }
    }

    private void handleJoinDocument(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        if (documentId == null || !documentId.equals(state.documentId())) return;

        if (roomSize(documentId) > 1) {
            String requestId = registerPending(pendingAwarenessSyncs, documentId, session.getId());
            ObjectNode request = messages.objectNode();
            request.put("documentId", documentId);
            request.put("requestId", requestId);
            request.put("targetSocketId", session.getId());
            broadcast(documentId, "request-awareness-sync", request, session.getId());
        }
    }

    private void handleGetDocumentHistory(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        if (!isActiveDocument(state, documentId)) return;

        try {
            send(session, "document-history", documentService.loadHistory(documentId, state.user()));
        } catch (Exception error) {
            sendDocumentError(session, error);
        }
    }

    private void handleYjsUpdate(WebSocketSession session, SessionState state, JsonNode payload) {
        if (state.documentId() == null || payload == null || !payload.has("update")) return;

        ObjectNode nextPayload = messages.objectNode();
        nextPayload.put("documentId", state.documentId());
        nextPayload.set("update", payload.get("update"));
        broadcast(state.documentId(), "yjs-update", nextPayload, session.getId());
    }

    private void handleDocumentSync(SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        String requestId = messages.text(payload, "requestId");
        String targetSessionId = messages.text(payload, "targetSocketId");
        if (!isActiveDocument(state, documentId) || requestId == null || targetSessionId == null) return;

        PendingSync pending = pendingDocumentSyncs.remove(requestId);
        ObjectNode syncPayload = messages.objectNode();
        syncPayload.put("documentId", documentId);
        syncPayload.set("update", payload.get("update"));
        if (pending != null && !pending.isExpired(Instant.now())) {
            sendToTarget(targetSessionId, "document-sync", syncPayload);
        } else {
            publishTarget(targetSessionId, "document-sync", documentId, syncPayload);
        }
    }

    private void handleAwarenessUpdate(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        if (!isActiveDocument(state, documentId) || !payload.has("update")) return;

        if (payload.has("awarenessClientId")) {
            state.awarenessClientId(payload.get("awarenessClientId").asLong());
        }

        ObjectNode nextPayload = messages.objectNode();
        nextPayload.put("documentId", documentId);
        nextPayload.set("update", payload.get("update"));
        broadcast(documentId, "awareness-update", nextPayload, session.getId());
    }

    private void handleAwarenessSync(SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        String requestId = messages.text(payload, "requestId");
        String targetSessionId = messages.text(payload, "targetSocketId");
        if (!isActiveDocument(state, documentId) || requestId == null || targetSessionId == null) return;

        PendingSync pending = pendingAwarenessSyncs.remove(requestId);
        ObjectNode syncPayload = messages.objectNode();
        syncPayload.put("documentId", documentId);
        syncPayload.set("update", payload.get("update"));
        if (pending != null && !pending.isExpired(Instant.now())) {
            sendToTarget(targetSessionId, "awareness-update", syncPayload);
        } else {
            publishTarget(targetSessionId, "awareness-update", documentId, syncPayload);
        }
    }

    private void handleAwarenessLeave(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        if (!isActiveDocument(state, documentId) || state.awarenessClientId() == null) return;

        ObjectNode removePayload = messages.objectNode();
        removePayload.put("documentId", documentId);
        removePayload.putArray("awarenessClientIds").add(state.awarenessClientId());
        state.awarenessClientId(null);
        broadcast(documentId, "awareness-remove", removePayload, session.getId());
    }

    private void handleSaveDocument(WebSocketSession session, SessionState state, JsonNode payload) {
        if (state.documentId() == null) return;

        try {
            SaveResult result = documentService.saveDocument(
                    state.documentId(),
                    messages.text(payload, "yjsStateBase64"),
                    messages.toMap(payload.get("data")),
                    state.user()
            );

            if (result.historyUpdated()) {
                broadcast(state.documentId(), "document-history-updated", messages.toJson(result.history()), null);
            }
        } catch (Exception error) {
            sendDocumentError(session, error);
        }
    }

    private void handleRestoreVersion(WebSocketSession session, SessionState state, JsonNode payload) {
        String documentId = messages.text(payload, "documentId");
        String versionId = messages.text(payload, "versionId");
        if (!isActiveDocument(state, documentId) || versionId == null) return;

        try {
            RestoreResult result = documentService.restoreVersion(documentId, versionId, state.user());
            broadcast(documentId, "document-history-updated", messages.toJson(result.history()), null);
            ObjectNode restorePayload = messages.objectNode();
            restorePayload.put("documentId", documentId);
            restorePayload.put("versionId", result.restoredVersionId());
            restorePayload.set("restoredBy", messages.toJson(result.restoredBy()));
            restorePayload.put("yjsStateBase64", result.document().yjsStateBase64());
            broadcast(documentId, "document-restored", restorePayload, null);
        } catch (Exception error) {
            sendDocumentError(session, error);
        }
    }

    private void leaveRoom(String sessionId, SessionState state) {
        String documentId = state.documentId();
        if (documentId == null) return;

        Set<String> room = roomSessions.get(documentId);
        if (room != null) {
            room.remove(sessionId);
            if (room.isEmpty()) {
                roomSessions.remove(documentId);
            }
        }

        if (state.awarenessClientId() != null) {
            ObjectNode payload = messages.objectNode();
            payload.put("documentId", documentId);
            payload.putArray("awarenessClientIds").add(state.awarenessClientId());
            broadcast(documentId, "awareness-remove", payload, sessionId);
        }

        state.awarenessClientId(null);
        state.documentId(null);
    }

    private void broadcast(String documentId, String event, JsonNode payload, String excludeSessionId) {
        sendLocalRoom(documentId, event, payload, excludeSessionId);
        RedisRealtimeBus redisRealtimeBus = redisRealtimeBusProvider.getIfAvailable();
        if (redisRealtimeBus != null && redisRealtimeBus.isEnabled()) {
            redisRealtimeBus.publish(new RedisRealtimeMessage(
                    instanceId,
                    event,
                    documentId,
                    excludeSessionId,
                    null,
                    payload
            ));
        }
    }

    private void sendLocalRoom(String documentId, String event, JsonNode payload, String excludeSessionId) {
        Set<String> room = roomSessions.getOrDefault(documentId, Set.of());
        for (String sessionId : room) {
            if (sessionId.equals(excludeSessionId)) continue;

            WebSocketSession session = sessions.get(sessionId);
            if (session != null) {
                send(session, event, payload);
            }
        }
    }

    private void sendToTarget(String targetSessionId, String event, JsonNode payload) {
        WebSocketSession target = sessions.get(targetSessionId);
        if (target != null) {
            send(target, event, payload);
        } else {
            publishTarget(targetSessionId, event, null, payload);
        }
    }

    private void publishTarget(String targetSessionId, String event, String documentId, JsonNode payload) {
        RedisRealtimeBus redisRealtimeBus = redisRealtimeBusProvider.getIfAvailable();
        if (redisRealtimeBus == null || !redisRealtimeBus.isEnabled()) return;

        redisRealtimeBus.publish(new RedisRealtimeMessage(
                instanceId,
                event,
                documentId,
                null,
                targetSessionId,
                payload
        ));
    }

    private void send(WebSocketSession session, String event, Object payload) {
        if (!session.isOpen()) return;

        try {
            session.sendMessage(new TextMessage(messages.encode(event, payload)));
        } catch (IOException error) {
            System.err.println("[WebSocket] Failed to send message: " + error.getMessage());
        }
    }

    private String registerPending(Map<String, PendingSync> pendingSyncs, String documentId, String targetSessionId) {
        Instant now = Instant.now();
        pendingSyncs.entrySet().removeIf(entry -> entry.getValue().isExpired(now));

        String requestId = UUID.randomUUID().toString();
        pendingSyncs.put(requestId, new PendingSync(
                documentId,
                targetSessionId,
                now.plus(SYNC_TIMEOUT_SECONDS, ChronoUnit.SECONDS)
        ));
        return requestId;
    }

    private int roomSize(String documentId) {
        return roomSessions.getOrDefault(documentId, Set.of()).size();
    }

    private boolean isActiveDocument(SessionState state, String documentId) {
        return documentId != null && documentId.equals(state.documentId());
    }

    private void sendDocumentError(WebSocketSession session, Exception error) {
        ObjectNode payload = messages.objectNode();
        payload.put("message", error.getMessage() == null ? "Document request failed." : error.getMessage());
        payload.put("statusCode", 400);
        send(session, "document-error", payload);
    }
}
