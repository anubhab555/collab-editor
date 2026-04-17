package com.collabeditor.config;

import com.collabeditor.realtime.CollaborationWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final CollaborationWebSocketHandler collaborationWebSocketHandler;
    private final CorsConfig corsConfig;

    public WebSocketConfig(CollaborationWebSocketHandler collaborationWebSocketHandler, CorsConfig corsConfig) {
        this.collaborationWebSocketHandler = collaborationWebSocketHandler;
        this.corsConfig = corsConfig;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(collaborationWebSocketHandler, "/ws")
                .setAllowedOrigins(corsConfig.getAllowedOrigins().toArray(String[]::new));
    }
}
