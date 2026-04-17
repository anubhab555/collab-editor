package com.collabeditor.document;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.collabeditor.auth.AuthService;
import com.collabeditor.common.AppException;
import com.collabeditor.document.DocumentDtos.CollaboratorDto;
import com.collabeditor.document.DocumentDtos.DocumentListResponse;
import com.collabeditor.document.DocumentDtos.DocumentResponse;
import com.collabeditor.document.DocumentDtos.DocumentSummary;
import com.collabeditor.document.DocumentDtos.HistoryPayload;
import com.collabeditor.document.DocumentDtos.LoadDocumentPayload;
import com.collabeditor.document.DocumentDtos.Owner;
import com.collabeditor.document.DocumentDtos.RestoreResult;
import com.collabeditor.document.DocumentDtos.SaveResult;
import com.collabeditor.document.DocumentDtos.VersionMetadata;
import com.collabeditor.security.AuthenticatedUser;
import com.collabeditor.user.UserAccount;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class DocumentService {
    private static final String DEFAULT_TITLE = "Untitled document";
    private static final String CONTENT_FORMAT_YJS = "yjs";
    private static final int MAX_VERSIONS = 20;

    private final AuthService authService;
    private final Clock clock;
    private final DocumentRepository documentRepository;
    private final long checkpointIntervalMs;

    @Autowired
    public DocumentService(
            AuthService authService,
            DocumentRepository documentRepository,
            @Value("${CHECKPOINT_INTERVAL_MS:30000}") long checkpointIntervalMs
    ) {
        this(authService, documentRepository, Clock.systemUTC(), checkpointIntervalMs);
    }

    DocumentService(
            AuthService authService,
            DocumentRepository documentRepository,
            Clock clock,
            long checkpointIntervalMs
    ) {
        this.authService = authService;
        this.clock = clock;
        this.documentRepository = documentRepository;
        this.checkpointIntervalMs = checkpointIntervalMs;
    }

    public DocumentResponse createDocument(String title, AuthenticatedUser user) {
        DocumentRecord document = new DocumentRecord();
        document.setId(UUID.randomUUID().toString());
        document.setTitle(normalizeTitle(title));
        assignOwner(document, user);

        return new DocumentResponse(toSummary(documentRepository.save(document), user.id()));
    }

    public DocumentListResponse listDocuments(AuthenticatedUser user) {
        List<DocumentSummary> documents = documentRepository
                .findByOwnerIdOrCollaboratorsUserIdOrderByUpdatedAtDesc(user.id(), user.id())
                .stream()
                .map(document -> toSummary(document, user.id()))
                .toList();

        return new DocumentListResponse(documents);
    }

    public DocumentResponse getMetadata(String documentId, AuthenticatedUser user) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, user);
        return new DocumentResponse(toSummary(document, user.id()));
    }

    public DocumentResponse share(String documentId, String email, AuthenticatedUser currentUser) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, currentUser);
        if (!isOwner(document, currentUser.id())) {
            throw new AppException("Only the document owner can share access.", HttpStatus.FORBIDDEN);
        }

        UserAccount userToShare = authService.findByEmail(email);
        if (userToShare.getId().equals(currentUser.id())) {
            throw new AppException("You already own this document.", HttpStatus.BAD_REQUEST);
        }

        Collaborator collaborator = new Collaborator();
        collaborator.setUserId(userToShare.getId());
        collaborator.setDisplayName(userToShare.getDisplayName());
        collaborator.setEmail(userToShare.getEmail());
        collaborator.setRole("editor");

        List<Collaborator> collaborators = new ArrayList<>(safeCollaborators(document));
        collaborators.removeIf(existing -> existing.getUserId().equals(userToShare.getId()));
        collaborators.add(collaborator);
        document.setCollaborators(collaborators);

        return new DocumentResponse(toSummary(documentRepository.save(document), currentUser.id()));
    }

    public LoadDocumentPayload loadDocumentState(String documentId, AuthenticatedUser user) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, user);
        return new LoadDocumentPayload(nonNull(document.getYjsState()), CONTENT_FORMAT_YJS);
    }

    public HistoryPayload loadHistory(String documentId, AuthenticatedUser user) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, user);
        return historyPayload(document);
    }

    public SaveResult saveDocument(
            String documentId,
            String yjsStateBase64,
            Map<String, Object> data,
            AuthenticatedUser user
    ) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, user);
        String nextYjsState = nonNull(yjsStateBase64);
        boolean shouldCheckpoint = shouldCreateCheckpoint(document, nextYjsState, data);

        if (shouldCheckpoint) {
            prependVersion(document, createVersion(data, nextYjsState, user, "checkpoint"));
        }

        document.setData(data);
        document.setYjsState(nextYjsState);
        document.setContentFormat(CONTENT_FORMAT_YJS);
        DocumentRecord saved = documentRepository.save(document);

        return new SaveResult(shouldCheckpoint, historyPayload(saved));
    }

    public RestoreResult restoreVersion(String documentId, String versionId, AuthenticatedUser user) {
        DocumentRecord document = findOrCreateAccessibleDocument(documentId, user);
        VersionEntry target = safeVersions(document).stream()
                .filter(version -> version.getVersionId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new AppException("Version not found.", HttpStatus.NOT_FOUND));

        String currentYjsState = nonNull(document.getYjsState());
        String targetYjsState = nonNull(target.getYjsState());

        if (!currentYjsState.equals(targetYjsState)) {
            prependVersion(document, createVersion(document.getData(), currentYjsState, user, "restore-backup"));
        }

        document.setData(target.getData());
        document.setYjsState(targetYjsState);
        document.setContentFormat(CONTENT_FORMAT_YJS);
        DocumentRecord saved = documentRepository.save(document);

        return new RestoreResult(
                new LoadDocumentPayload(nonNull(saved.getYjsState()), CONTENT_FORMAT_YJS),
                historyPayload(saved),
                target.getVersionId(),
                savedBy(user)
        );
    }

    private DocumentRecord findOrCreateAccessibleDocument(String documentId, AuthenticatedUser user) {
        DocumentRecord document = documentRepository.findById(documentId)
                .orElseGet(() -> {
                    DocumentRecord nextDocument = new DocumentRecord();
                    nextDocument.setId(documentId);
                    nextDocument.setTitle(DEFAULT_TITLE);
                    return nextDocument;
                });

        if (document.getOwnerId() == null || document.getOwnerId().isBlank()) {
            assignOwner(document, user);
            return documentRepository.save(document);
        }

        if (!hasAccess(document, user.id())) {
            throw new AppException("You do not have access to this document.", HttpStatus.FORBIDDEN);
        }

        return document;
    }

    private void assignOwner(DocumentRecord document, AuthenticatedUser user) {
        document.setOwnerId(user.id());
        document.setOwnerDisplayName(user.displayName());
        document.setOwnerEmail(user.email());
        if (document.getTitle() == null || document.getTitle().isBlank()) {
            document.setTitle(DEFAULT_TITLE);
        }
    }

    private boolean hasAccess(DocumentRecord document, String userId) {
        return isOwner(document, userId)
                || safeCollaborators(document).stream().anyMatch(collaborator -> userId.equals(collaborator.getUserId()));
    }

    private boolean isOwner(DocumentRecord document, String userId) {
        return userId != null && userId.equals(document.getOwnerId());
    }

    private DocumentSummary toSummary(DocumentRecord document, String userId) {
        String permission = isOwner(document, userId) ? "owner" : "editor";
        Owner owner = document.getOwnerId() == null
                ? null
                : new Owner(document.getOwnerId(), document.getOwnerDisplayName(), document.getOwnerEmail());
        List<CollaboratorDto> collaborators = safeCollaborators(document)
                .stream()
                .map(collaborator -> new CollaboratorDto(
                        collaborator.getUserId(),
                        collaborator.getDisplayName(),
                        collaborator.getEmail(),
                        collaborator.getRole()
                ))
                .toList();

        return new DocumentSummary(
                document.getId(),
                normalizeTitle(document.getTitle()),
                permission,
                owner,
                collaborators,
                document.getCreatedAt(),
                document.getUpdatedAt()
        );
    }

    private HistoryPayload historyPayload(DocumentRecord document) {
        List<VersionMetadata> versions = safeVersions(document)
                .stream()
                .map(version -> new VersionMetadata(
                        version.getVersionId(),
                        version.getCreatedAt(),
                        version.getSavedBy(),
                        version.getSource()
                ))
                .toList();

        return new HistoryPayload(document.getId(), versions);
    }

    private boolean shouldCreateCheckpoint(DocumentRecord document, String nextYjsState, Map<String, Object> data) {
        if (isBlank(data)) return false;

        return safeVersions(document)
                .stream()
                .filter(version -> "checkpoint".equals(version.getSource()))
                .findFirst()
                .map(latestCheckpoint -> {
                    if (nextYjsState.equals(latestCheckpoint.getYjsState())) return false;

                    return latestCheckpoint.getCreatedAt() == null
                            || clock.millis() - latestCheckpoint.getCreatedAt().toEpochMilli() >= checkpointIntervalMs;
                })
                .orElse(true);
    }

    @SuppressWarnings("unchecked")
    private boolean isBlank(Map<String, Object> data) {
        if (data == null || data.isEmpty()) return true;
        Object opsValue = data.get("ops");
        if (!(opsValue instanceof List<?> ops) || ops.isEmpty()) return true;

        return ops.stream().noneMatch(operation -> {
            if (!(operation instanceof Map<?, ?> op)) return false;
            Object insert = op.get("insert");
            if (insert instanceof String text) {
                return !text.replace("\n", "").trim().isEmpty();
            }

            return insert != null;
        });
    }

    private VersionEntry createVersion(
            Map<String, Object> data,
            String yjsState,
            AuthenticatedUser user,
            String source
    ) {
        VersionEntry version = new VersionEntry();
        version.setVersionId(UUID.randomUUID().toString());
        version.setCreatedAt(Instant.now(clock));
        version.setSavedBy(savedBy(user));
        version.setSource(source);
        version.setYjsState(yjsState);
        version.setData(data);
        return version;
    }

    private VersionEntry.SavedBy savedBy(AuthenticatedUser user) {
        return new VersionEntry.SavedBy(user.id(), user.displayName());
    }

    private void prependVersion(DocumentRecord document, VersionEntry version) {
        List<VersionEntry> versions = new ArrayList<>(safeVersions(document));
        versions.add(0, version);
        if (versions.size() > MAX_VERSIONS) {
            versions = new ArrayList<>(versions.subList(0, MAX_VERSIONS));
        }
        document.setVersions(versions);
    }

    private List<Collaborator> safeCollaborators(DocumentRecord document) {
        return document.getCollaborators() == null ? List.of() : document.getCollaborators();
    }

    private List<VersionEntry> safeVersions(DocumentRecord document) {
        return document.getVersions() == null ? List.of() : document.getVersions();
    }

    private String normalizeTitle(String title) {
        return title == null || title.isBlank() ? DEFAULT_TITLE : title.trim();
    }

    private String nonNull(String value) {
        return value == null ? "" : value;
    }
}
