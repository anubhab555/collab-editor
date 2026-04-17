package com.collabeditor.document;

import java.time.Instant;
import java.util.Map;

public class VersionEntry {
    private String versionId;
    private Instant createdAt;
    private SavedBy savedBy;
    private String source;
    private String yjsState;
    private Map<String, Object> data;

    public String getVersionId() {
        return versionId;
    }

    public void setVersionId(String versionId) {
        this.versionId = versionId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public SavedBy getSavedBy() {
        return savedBy;
    }

    public void setSavedBy(SavedBy savedBy) {
        this.savedBy = savedBy;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getYjsState() {
        return yjsState;
    }

    public void setYjsState(String yjsState) {
        this.yjsState = yjsState;
    }

    public Map<String, Object> getData() {
        return data;
    }

    public void setData(Map<String, Object> data) {
        this.data = data;
    }

    public record SavedBy(String clientId, String displayName) {
    }
}
