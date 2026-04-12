import { createContext, useContext, useEffect, useState } from "react"

import { apiRequest } from "./api"

const AUTH_TOKEN_STORAGE_KEY = "collab-editor-auth-token"
const AUTH_USER_STORAGE_KEY = "collab-editor-auth-user"
const AuthContext = createContext(null)

function readStoredUser() {
    const storedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (!storedUser) return null

    try {
        return JSON.parse(storedUser)
    } catch (error) {
        window.localStorage.removeItem(AUTH_USER_STORAGE_KEY)
        return null
    }
}

function persistSession(token, user) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
}

function clearSession() {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY)
}

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
    const [user, setUser] = useState(() => readStoredUser())
    const [authReady, setAuthReady] = useState(() => !window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))

    useEffect(() => {
        if (!token) {
            setAuthReady(true)
            setUser(null)
            return
        }

        let isActive = true
        setAuthReady(false)

        apiRequest("/auth/me", { token })
            .then((payload) => {
                if (!isActive) return

                setUser(payload.user)
                persistSession(token, payload.user)
                setAuthReady(true)
            })
            .catch(() => {
                if (!isActive) return

                clearSession()
                setToken(null)
                setUser(null)
                setAuthReady(true)
            })

        return () => {
            isActive = false
        }
    }, [token])

    const applyAuthPayload = (payload) => {
        persistSession(payload.token, payload.user)
        setToken(payload.token)
        setUser(payload.user)
        setAuthReady(true)
    }

    const register = async (credentials) => {
        const payload = await apiRequest("/auth/register", {
            method: "POST",
            body: credentials,
        })

        applyAuthPayload(payload)
        return payload
    }

    const login = async (credentials) => {
        const payload = await apiRequest("/auth/login", {
            method: "POST",
            body: credentials,
        })

        applyAuthPayload(payload)
        return payload
    }

    const logout = () => {
        clearSession()
        setToken(null)
        setUser(null)
        setAuthReady(true)
    }

    return (
        <AuthContext.Provider
            value={{
                authReady,
                isAuthenticated: Boolean(token && user),
                login,
                logout,
                register,
                token,
                user,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const value = useContext(AuthContext)

    if (!value) {
        throw new Error("useAuth must be used within an AuthProvider.")
    }

    return value
}
