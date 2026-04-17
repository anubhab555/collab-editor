package com.collabeditor.user;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface UserRepository extends MongoRepository<UserAccount, String> {
    boolean existsByEmail(String email);

    Optional<UserAccount> findByEmail(String email);
}
