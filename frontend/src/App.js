import {
    BrowserRouter as Router,
    Navigate,
    Route,
    Routes,
} from "react-router-dom"

import { AuthProvider, useAuth } from "./AuthContext"
import AuthScreen from "./AuthScreen"
import Dashboard from "./Dashboard"
import TextEditor from "./TextEditor"

function LoadingScreen() {
    return <div className="auth-screen__status">Loading account...</div>
}

function RootRedirect() {
    const { authReady, isAuthenticated } = useAuth()

    if (!authReady) {
        return <LoadingScreen />
    }

    return <Navigate replace to={isAuthenticated ? "/dashboard" : "/auth"} />
}

function ProtectedRoute({ children }) {
    const { authReady, isAuthenticated } = useAuth()

    if (!authReady) {
        return <LoadingScreen />
    }

    if (!isAuthenticated) {
        return <Navigate replace to="/auth" />
    }

    return children
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/auth" element={<AuthScreen />} />
            <Route
                path="/dashboard"
                element={(
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                )}
            />
            <Route
                path="/documents/:id"
                element={(
                    <ProtectedRoute>
                        <TextEditor />
                    </ProtectedRoute>
                )}
            />
        </Routes>
    )
}

export default function App() {
    return (
        <AuthProvider>
            <Router>
                <AppRoutes />
            </Router>
        </AuthProvider>
    )
}
