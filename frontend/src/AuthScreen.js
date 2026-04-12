import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"

import { useAuth } from "./AuthContext"

const INITIAL_LOGIN_FORM = {
    email: "",
    password: "",
}
const INITIAL_REGISTER_FORM = {
    displayName: "",
    email: "",
    password: "",
}

export default function AuthScreen() {
    const navigate = useNavigate()
    const { authReady, isAuthenticated, login, register } = useAuth()
    const [mode, setMode] = useState("login")
    const [errorMessage, setErrorMessage] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [loginForm, setLoginForm] = useState(INITIAL_LOGIN_FORM)
    const [registerForm, setRegisterForm] = useState(INITIAL_REGISTER_FORM)

    if (!authReady) {
        return <div className="auth-screen__status">Loading account...</div>
    }

    if (isAuthenticated) {
        return <Navigate replace to="/dashboard" />
    }

    const isRegisterMode = mode === "register"

    const handleSubmit = async (event) => {
        event.preventDefault()
        setErrorMessage("")
        setIsSubmitting(true)

        try {
            if (isRegisterMode) {
                await register(registerForm)
            } else {
                await login(loginForm)
            }

            navigate("/dashboard", { replace: true })
        } catch (error) {
            setErrorMessage(error.message || "Unable to continue.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="auth-screen">
            <section className="auth-card">
                <div className="auth-card__header">
                    <p className="auth-card__eyebrow">Collab Editor</p>
                    <h1>{isRegisterMode ? "Create your account" : "Welcome back"}</h1>
                    <p>
                        {isRegisterMode
                            ? "Sign up to create private documents and share them securely."
                            : "Log in to access your documents and collaborative editing sessions."}
                    </p>
                </div>

                <div className="auth-card__tabs">
                    <button
                        className={`auth-card__tab ${!isRegisterMode ? "auth-card__tab--active" : ""}`}
                        type="button"
                        onClick={() => {
                            setMode("login")
                            setErrorMessage("")
                        }}
                    >
                        Log in
                    </button>
                    <button
                        className={`auth-card__tab ${isRegisterMode ? "auth-card__tab--active" : ""}`}
                        type="button"
                        onClick={() => {
                            setMode("register")
                            setErrorMessage("")
                        }}
                    >
                        Sign up
                    </button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {isRegisterMode ? (
                        <label className="auth-form__field">
                            <span>Display name</span>
                            <input
                                autoComplete="name"
                                data-testid="register-display-name"
                                type="text"
                                value={registerForm.displayName}
                                onChange={(event) => {
                                    setRegisterForm((current) => ({
                                        ...current,
                                        displayName: event.target.value,
                                    }))
                                }}
                            />
                        </label>
                    ) : null}

                    <label className="auth-form__field">
                        <span>Email</span>
                        <input
                            autoComplete="email"
                            data-testid={isRegisterMode ? "register-email" : "login-email"}
                            type="email"
                            value={isRegisterMode ? registerForm.email : loginForm.email}
                            onChange={(event) => {
                                const nextValue = event.target.value
                                if (isRegisterMode) {
                                    setRegisterForm((current) => ({
                                        ...current,
                                        email: nextValue,
                                    }))
                                } else {
                                    setLoginForm((current) => ({
                                        ...current,
                                        email: nextValue,
                                    }))
                                }
                            }}
                        />
                    </label>

                    <label className="auth-form__field">
                        <span>Password</span>
                        <input
                            autoComplete={isRegisterMode ? "new-password" : "current-password"}
                            data-testid={isRegisterMode ? "register-password" : "login-password"}
                            type="password"
                            value={isRegisterMode ? registerForm.password : loginForm.password}
                            onChange={(event) => {
                                const nextValue = event.target.value
                                if (isRegisterMode) {
                                    setRegisterForm((current) => ({
                                        ...current,
                                        password: nextValue,
                                    }))
                                } else {
                                    setLoginForm((current) => ({
                                        ...current,
                                        password: nextValue,
                                    }))
                                }
                            }}
                        />
                    </label>

                    {errorMessage ? (
                        <p className="auth-form__error" role="alert">
                            {errorMessage}
                        </p>
                    ) : null}

                    <button
                        className="auth-form__submit"
                        data-testid={isRegisterMode ? "register-submit" : "login-submit"}
                        disabled={isSubmitting}
                        type="submit"
                    >
                        {isSubmitting
                            ? isRegisterMode
                                ? "Creating account..."
                                : "Logging in..."
                            : isRegisterMode
                                ? "Create account"
                                : "Log in"}
                    </button>
                </form>
            </section>
        </main>
    )
}
