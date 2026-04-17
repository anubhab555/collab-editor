package com.collabeditor.document;

import com.collabeditor.document.DocumentDtos.CreateDocumentRequest;
import com.collabeditor.document.DocumentDtos.DocumentListResponse;
import com.collabeditor.document.DocumentDtos.DocumentResponse;
import com.collabeditor.document.DocumentDtos.ShareDocumentRequest;
import com.collabeditor.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {
    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    public DocumentListResponse list(@AuthenticationPrincipal AuthenticatedUser user) {
        return documentService.listDocuments(user);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentResponse create(
            @RequestBody(required = false) CreateDocumentRequest request,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return documentService.createDocument(request == null ? null : request.title(), user);
    }

    @GetMapping("/{documentId}")
    public DocumentResponse getMetadata(
            @PathVariable String documentId,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return documentService.getMetadata(documentId, user);
    }

    @PostMapping("/{documentId}/share")
    public DocumentResponse share(
            @PathVariable String documentId,
            @Valid @RequestBody ShareDocumentRequest request,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return documentService.share(documentId, request.email(), user);
    }
}
