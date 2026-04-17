package com.collabeditor.document;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface DocumentRepository extends MongoRepository<DocumentRecord, String> {
    List<DocumentRecord> findByOwnerIdOrCollaboratorsUserIdOrderByUpdatedAtDesc(String ownerId, String collaboratorUserId);
}
