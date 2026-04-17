package com.collabeditor.realtime;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import com.collabeditor.auth.AuthService;
import com.collabeditor.auth.JwtService;
import com.collabeditor.user.UserAccount;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class CollaborationWebSocketHandler extends TextWebSocketHandler {
    private final AuthService authService;
    private final CollaborationGateway collaborationGateway;
    private final JwtService jwtService;
    private final RealtimeMessageSupport messages;

    public CollaborationWebSocketHandler(
            AuthService authService,
            CollaborationGateway collaborationGateway,
            JwtService jwtService,
            RealtimeMessageSupport messages
    ) {
        this.authService = authService;
        this.collaborationGateway = collaborationGateway;
        this.jwtService = jwtService;
        this.messages = messages;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String token = readToken(session.getUri());
        if (token == null || token.isBlank()) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Authentication required."));
            return;
        }

        try {
            UserAccount user = authService.findById(jwtService.parseUserId(token));
            collaborationGateway.register(
                    session,
                    new com.collabeditor.security.AuthenticatedUser(
                            user.getId(),
                            user.getDisplayName(),
                            user.getEmail()
                    )
            );
        } catch (Exception error) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Authentication required."));
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        collaborationGateway.handle(session, messages.decode(message.getPayload()));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        collaborationGateway.unregister(session);
    }

    private String readToken(URI uri) {
        if (uri == null || uri.getQuery() == null) return null;

        Map<String, String> params = Arrays.stream(uri.getQuery().split("&"))
                .map(part -> part.split("=", 2))
                .filter(parts -> parts.length == 2)
                .collect(Collectors.toMap(
                        parts -> decode(parts[0]),
                        parts -> decode(parts[1]),
                        (left, right) -> right
                ));

        return params.get("token");
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
