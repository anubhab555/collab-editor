package com.collabeditor.auth;

import java.util.Map;

import com.collabeditor.auth.AuthDtos.AuthPayload;
import com.collabeditor.auth.AuthDtos.LoginRequest;
import com.collabeditor.auth.AuthDtos.RegisterRequest;
import com.collabeditor.auth.AuthDtos.UserDto;
import com.collabeditor.security.AuthenticatedUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final RateLimitService rateLimitService;

    public AuthController(AuthService authService, RateLimitService rateLimitService) {
        this.authService = authService;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthPayload register(@Valid @RequestBody RegisterRequest request, HttpServletRequest servletRequest) {
        rateLimitService.checkAuthWriteAllowed(servletRequest);
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthPayload login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        rateLimitService.checkAuthWriteAllowed(servletRequest);
        return authService.login(request);
    }

    @GetMapping("/me")
    public Map<String, UserDto> me(@AuthenticationPrincipal AuthenticatedUser user) {
        return Map.of("user", new UserDto(user.id(), user.displayName(), user.email()));
    }
}
