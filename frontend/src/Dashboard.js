import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "./AuthContext"
import { apiRequest } from "./api"

const DOCUMENT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
})

function formatDocumentDate(value) {
    if (!value) return "Unknown"

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Unknown"

    return DOCUMENT_DATE_FORMATTER.format(date)
}

export default function Dashboard() {
    const navigate = useNavigate()
    const { logout, token, user } = useAuth()
    const [documents, setDocuments] = useState([])
    const [title, setTitle] = useState("")
    const [errorMessage, setErrorMessage] = useState("")
    const [isCreating, setIsCreating] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let isActive = true

        apiRequest("/documents", { token })
            .then((payload) => {
                if (!isActive) return

                setDocuments(payload.documents || [])
                setIsLoading(false)
            })
            .catch((error) => {
                if (!isActive) return

                if (error.statusCode === 401) {
                    logout()
                    return
                }

                setErrorMessage(error.message || "Unable to load your documents.")
                setIsLoading(false)
            })

        return () => {
            isActive = false
        }
    }, [logout, token])

    const handleCreateDocument = async (event) => {
        event.preventDefault()
        setErrorMessage("")
        setIsCreating(true)

        try {
            const payload = await apiRequest("/documents", {
                body: { title },
                method: "POST",
                token,
            })

            navigate(`/documents/${payload.document.documentId}`)
        } catch (error) {
            if (error.statusCode === 401) {
                logout()
                return
            }

            setErrorMessage(error.message || "Unable to create the document.")
            setIsCreating(false)
        }
    }

    return (
        <main className="dashboard-screen">
            <section className="dashboard-shell">
                <header className="dashboard-shell__header">
                    <div>
                        <p className="dashboard-shell__eyebrow">Authenticated Workspace</p>
                        <h1>{user.displayName}&rsquo;s documents</h1>
                        <p>{user.email}</p>
                    </div>
                    <button
                        className="dashboard-shell__logout"
                        type="button"
                        onClick={logout}
                    >
                        Log out
                    </button>
                </header>

                <section className="dashboard-card">
                    <h2>Create a new document</h2>
                    <form className="dashboard-create" onSubmit={handleCreateDocument}>
                        <input
                            className="dashboard-create__input"
                            data-testid="dashboard-title-input"
                            placeholder="Untitled document"
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                        <button
                            className="dashboard-create__submit"
                            data-testid="dashboard-create-submit"
                            disabled={isCreating}
                            type="submit"
                        >
                            {isCreating ? "Creating..." : "Create document"}
                        </button>
                    </form>
                </section>

                <section className="dashboard-card">
                    <div className="dashboard-card__header">
                        <h2>Your accessible documents</h2>
                        <p>Owned and shared documents appear here.</p>
                    </div>

                    {errorMessage ? (
                        <p className="dashboard-card__error" role="alert">
                            {errorMessage}
                        </p>
                    ) : null}

                    {isLoading ? (
                        <p className="dashboard-card__empty">Loading documents...</p>
                    ) : documents.length === 0 ? (
                        <p className="dashboard-card__empty">
                            No documents yet. Create your first one to start collaborating.
                        </p>
                    ) : (
                        <ul className="dashboard-documents">
                            {documents.map((document) => (
                                <li
                                    className="dashboard-documents__item"
                                    data-testid={`dashboard-document-${document.documentId}`}
                                    key={document.documentId}
                                >
                                    <div className="dashboard-documents__meta">
                                        <p className="dashboard-documents__title">{document.title}</p>
                                        <p className="dashboard-documents__details">
                                            {document.permission === "owner" ? "Owner" : "Shared editor"}
                                            {" · "}
                                            Updated {formatDocumentDate(document.updatedAt)}
                                        </p>
                                    </div>
                                    <button
                                        className="dashboard-documents__open"
                                        type="button"
                                        onClick={() => navigate(`/documents/${document.documentId}`)}
                                    >
                                        Open
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </section>
        </main>
    )
}
