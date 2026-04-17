package com.collabeditor.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record AuthPayload(String token, UserDto user) {
    }

    public record LoginRequest(
            @Email @NotBlank String email,
            @NotBlank @Size(min = 8) String password
    ) {
    }

    public record RegisterRequest(
            @NotBlank @Size(min = 2) String displayName,
            @Email @NotBlank String email,
            @NotBlank @Size(min = 8) String password
    ) {
    }

    public record UserDto(String id, String displayName, String email) {
    }
}
