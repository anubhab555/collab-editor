package com.collabeditor.config;

import com.collabeditor.realtime.RedisRealtimeBus;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
public class RedisConfig {
    @Bean
    RedisMessageListenerContainer redisMessageListenerContainer(
            CollabProperties properties,
            RedisConnectionFactory connectionFactory,
            RedisRealtimeBus redisRealtimeBus
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);

        if (properties.redis().enabled()) {
            container.addMessageListener(redisRealtimeBus, new ChannelTopic(properties.redis().channel()));
        }

        return container;
    }
}
