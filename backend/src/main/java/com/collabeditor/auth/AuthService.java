package com.collabeditor.auth;

import com.collabeditor.auth.AuthDtos.AuthPayload;
import com.collabeditor.auth.AuthDtos.LoginRequest;
import com.collabeditor.auth.AuthDtos.RegisterRequest;
import com.collabeditor.auth.AuthDtos.UserDto;
import com.collabeditor.common.AppException;
import com.collabeditor.user.UserAccount;
import com.collabeditor.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;

    public AuthService(
            JwtService jwtService,
            PasswordEncoder passwordEncoder,
            UserRepository userRepository
    ) {
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
    }

    public AuthPayload register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new AppException("An account already exists for that email.", HttpStatus.CONFLICT);
        }

        UserAccount user = new UserAccount();
        user.setDisplayName(request.displayName().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));

        return buildPayload(userRepository.save(user));
    }

    public AuthPayload login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        UserAccount user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException("Invalid email or password.", HttpStatus.UNAUTHORIZED));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new AppException("Invalid email or password.", HttpStatus.UNAUTHORIZED);
        }

        return buildPayload(user);
    }

    public UserDto getCurrentUser(String userId) {
        return toDto(findById(userId));
    }

    public UserAccount findById(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new AppException("Authentication required.", HttpStatus.UNAUTHORIZED));
    }

    public UserAccount findByEmail(String email) {
        return userRepository.findByEmail(normalizeEmail(email))
                .orElseThrow(() -> new AppException("No user exists for that email address.", HttpStatus.NOT_FOUND));
    }

    public UserDto toDto(UserAccount user) {
        return new UserDto(user.getId(), user.getDisplayName(), user.getEmail());
    }

    private AuthPayload buildPayload(UserAccount user) {
        return new AuthPayload(jwtService.createToken(user), toDto(user));
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
