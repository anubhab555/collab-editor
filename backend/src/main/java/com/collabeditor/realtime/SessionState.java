package com.collabeditor.realtime;

import com.collabeditor.security.AuthenticatedUser;

public class SessionState {
    private final AuthenticatedUser user;
    private Long awarenessClientId;
    private String documentId;

    public SessionState(AuthenticatedUser user) {
        this.user = user;
    }

    public AuthenticatedUser user() {
        return user;
    }

    public Long awarenessClientId() {
        return awarenessClientId;
    }

    public void awarenessClientId(Long awarenessClientId) {
        this.awarenessClientId = awarenessClientId;
    }

    public String documentId() {
        return documentId;
    }

    public void documentId(String documentId) {
        this.documentId = documentId;
    }
}
