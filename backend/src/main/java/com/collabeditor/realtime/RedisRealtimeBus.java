package com.collabeditor.realtime;

import com.collabeditor.config.CollabProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;

@Component
public class RedisRealtimeBus implements MessageListener {
    private final CollabProperties properties;
    private final CollaborationGateway collaborationGateway;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;

    public RedisRealtimeBus(
            CollabProperties properties,
            CollaborationGateway collaborationGateway,
            ObjectMapper objectMapper,
            StringRedisTemplate redisTemplate
    ) {
        this.properties = properties;
        this.collaborationGateway = collaborationGateway;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
    }

    @PostConstruct
    void logMode() {
        if (properties.redis().enabled()) {
            System.out.println("[Redis] Spring Redis pub/sub fanout enabled");
        } else {
            System.out.println("[Redis] Running in single-node mode");
        }
    }

    public boolean isEnabled() {
        return properties.redis().enabled();
    }

    public void publish(RedisRealtimeMessage message) {
        if (!isEnabled()) return;

        try {
            redisTemplate.convertAndSend(properties.redis().channel(), objectMapper.writeValueAsString(message));
        } catch (Exception error) {
            System.err.println("[Redis] Failed to publish realtime message: " + error.getMessage());
        }
    }

    @Override
    public void onMessage(@NonNull Message message, byte[] pattern) {
        if (!isEnabled()) return;

        try {
            RedisRealtimeMessage realtimeMessage = objectMapper.readValue(message.getBody(), RedisRealtimeMessage.class);
            collaborationGateway.applyRemoteMessage(realtimeMessage);
        } catch (Exception error) {
            System.err.println("[Redis] Failed to consume realtime message: " + error.getMessage());
        }
    }
}
