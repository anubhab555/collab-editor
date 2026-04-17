package com.collabeditor.document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class DocumentDtos {
    private DocumentDtos() {
    }

    public record CreateDocumentRequest(String title) {
    }

    public record ShareDocumentRequest(String email) {
    }

    public record SaveDocumentRequest(String yjsStateBase64, Map<String, Object> data) {
    }

    public record RestoreVersionRequest(String versionId) {
    }

    public record DocumentSummary(
            String documentId,
            String title,
            String permission,
            Owner owner,
            List<CollaboratorDto> collaborators,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record Owner(String id, String displayName, String email) {
    }

    public record CollaboratorDto(String userId, String displayName, String email, String role) {
    }

    public record DocumentListResponse(List<DocumentSummary> documents) {
    }

    public record DocumentResponse(DocumentSummary document) {
    }

    public record LoadDocumentPayload(String yjsStateBase64, String contentFormat) {
    }

    public record HistoryPayload(String documentId, List<VersionMetadata> versions) {
    }

    public record VersionMetadata(
            String versionId,
            Instant createdAt,
            VersionEntry.SavedBy savedBy,
            String source
    ) {
    }

    public record SaveResult(boolean historyUpdated, HistoryPayload history) {
    }

    public record RestoreResult(
            LoadDocumentPayload document,
            HistoryPayload history,
            String restoredVersionId,
            VersionEntry.SavedBy restoredBy
    ) {
    }
}
