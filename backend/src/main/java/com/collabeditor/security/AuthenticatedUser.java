package com.collabeditor.security;

public record AuthenticatedUser(String id, String displayName, String email) {
}
