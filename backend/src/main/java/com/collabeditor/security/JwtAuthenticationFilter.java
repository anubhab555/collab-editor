package com.collabeditor.security;

import java.io.IOException;
import java.util.List;

import com.collabeditor.auth.AuthService;
import com.collabeditor.auth.JwtService;
import com.collabeditor.user.UserAccount;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final AuthService authService;
    private final JwtService jwtService;

    public JwtAuthenticationFilter(AuthService authService, JwtService jwtService) {
        this.authService = authService;
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String token = readBearerToken(request);

        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                String userId = jwtService.parseUserId(token);
                UserAccount user = authService.findById(userId);
                AuthenticatedUser principal = new AuthenticatedUser(
                        user.getId(),
                        user.getDisplayName(),
                        user.getEmail()
                );
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(principal, null, List.of());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (Exception ignored) {
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }

    private String readBearerToken(HttpServletRequest request) {
        String value = request.getHeader("Authorization");
        if (value == null || !value.startsWith("Bearer ")) {
            return null;
        }

        return value.substring("Bearer ".length()).trim();
    }
}
