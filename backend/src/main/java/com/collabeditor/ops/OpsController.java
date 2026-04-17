package com.collabeditor.ops;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.Map;

import com.collabeditor.realtime.CollaborationGateway;
import com.mongodb.client.MongoClient;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OpsController {
    private final CollaborationGateway collaborationGateway;
    private final MongoClient mongoClient;
    private final StringRedisTemplate redisTemplate;

    public OpsController(
            CollaborationGateway collaborationGateway,
            MongoClient mongoClient,
            StringRedisTemplate redisTemplate
    ) {
        this.collaborationGateway = collaborationGateway;
        this.mongoClient = mongoClient;
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/healthz")
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "uptimeSeconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000
        );
    }

    @GetMapping("/readyz")
    public ResponseEntity<Map<String, Object>> ready() {
        boolean mongoUp = isMongoUp();
        Map<String, Object> payload = Map.of(
                "status", mongoUp ? "ready" : "not_ready",
                "checks", Map.of("mongo", mongoUp ? "up" : "down")
        );

        return ResponseEntity.status(mongoUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(payload);
    }

    @GetMapping(value = "/metrics", produces = MediaType.TEXT_PLAIN_VALUE)
    public String metrics() {
        Runtime runtime = Runtime.getRuntime();
        StringBuilder builder = new StringBuilder();
        builder.append("# HELP collab_editor_uptime_seconds JVM uptime in seconds.\n");
        builder.append("# TYPE collab_editor_uptime_seconds gauge\n");
        builder.append("collab_editor_uptime_seconds ")
                .append(ManagementFactory.getRuntimeMXBean().getUptime() / 1000)
                .append('\n');
        builder.append("# HELP collab_editor_socket_connections_active Active WebSocket connections.\n");
        builder.append("# TYPE collab_editor_socket_connections_active gauge\n");
        builder.append("collab_editor_socket_connections_active ")
                .append(collaborationGateway.activeSocketCount())
                .append('\n');
        builder.append("# HELP collab_editor_document_rooms_active Active document rooms.\n");
        builder.append("# TYPE collab_editor_document_rooms_active gauge\n");
        builder.append("collab_editor_document_rooms_active ")
                .append(collaborationGateway.activeDocumentRoomCount())
                .append('\n');
        builder.append("# HELP collab_editor_redis_adapter_enabled Whether Redis fanout is enabled.\n");
        builder.append("# TYPE collab_editor_redis_adapter_enabled gauge\n");
        builder.append("collab_editor_redis_adapter_enabled ")
                .append(collaborationGateway.isRedisEnabled() ? 1 : 0)
                .append('\n');
        builder.append("# HELP collab_editor_process_memory_bytes JVM memory usage.\n");
        builder.append("# TYPE collab_editor_process_memory_bytes gauge\n");
        builder.append("collab_editor_process_memory_bytes{area=\"used\"} ")
                .append(runtime.totalMemory() - runtime.freeMemory())
                .append('\n');
        builder.append("collab_editor_process_memory_bytes{area=\"max\"} ")
                .append(runtime.maxMemory())
                .append('\n');
        builder.append("# generated_at ").append(Instant.now()).append('\n');
        return builder.toString();
    }

    private boolean isMongoUp() {
        try {
            mongoClient.getDatabase("admin").runCommand(new org.bson.Document("ping", 1));
            return true;
        } catch (Exception error) {
            return false;
        }
    }
}
