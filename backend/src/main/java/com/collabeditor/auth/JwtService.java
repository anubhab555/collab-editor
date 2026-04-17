package com.collabeditor.auth;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

import com.collabeditor.config.CollabProperties;
import com.collabeditor.user.UserAccount;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private final SecretKey signingKey;
    private final long expiresInSeconds;

    public JwtService(CollabProperties properties) {
        String secret = properties.security().jwtSecret();
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiresInSeconds = properties.security().jwtExpiresInSeconds();
    }

    public String createToken(UserAccount user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(expiresInSeconds);

        return Jwts.builder()
                .subject(user.getId())
                .claim("displayName", user.getDisplayName())
                .claim("email", user.getEmail())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
    }

    public String parseUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return claims.getSubject();
    }
}
