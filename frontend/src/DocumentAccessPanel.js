export default function DocumentAccessPanel({
    documentDetails,
    loading,
    onLogout,
    onShareEmailChange,
    onShareSubmit,
    shareEmail,
    shareError,
    shareSuccess,
    shareSubmitting,
}) {
    const isOwner = documentDetails?.permission === "owner"

    return (
        <aside className="access-panel" data-testid="access-panel">
            <div className="access-panel__header">
                <div>
                    <p className="access-panel__eyebrow">Secure document access</p>
                    <h2>{documentDetails?.title || "Loading document..."}</h2>
                    <p>
                        {isOwner
                            ? "You own this document."
                            : `Shared by ${documentDetails?.owner?.displayName || "the owner"}.`}
                    </p>
                </div>
                <button className="access-panel__logout" type="button" onClick={onLogout}>
                    Log out
                </button>
            </div>

            <div className="access-panel__section">
                <h3>Access</h3>
                {loading ? (
                    <p className="access-panel__empty">Loading document access...</p>
                ) : (
                    <>
                        <p className="access-panel__role">
                            {isOwner ? "Owner" : "Editor"}
                        </p>
                        <p className="access-panel__owner">
                            Owner: {documentDetails?.owner?.displayName || "Unknown"} ({documentDetails?.owner?.email || "No email"})
                        </p>
                    </>
                )}
            </div>

            <div className="access-panel__section">
                <h3>Collaborators</h3>
                {documentDetails?.collaborators?.length ? (
                    <ul className="access-panel__collaborators">
                        {documentDetails.collaborators.map((collaborator) => (
                            <li key={collaborator.userId}>
                                <span>{collaborator.displayName}</span>
                                <span>{collaborator.email}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="access-panel__empty">
                        {isOwner
                            ? "No collaborators yet. Share access to start editing together."
                            : "Only the owner has access right now."}
                    </p>
                )}
            </div>

            {isOwner ? (
                <form className="access-panel__share-form" onSubmit={onShareSubmit}>
                    <h3>Share with an existing user</h3>
                    <input
                        className="access-panel__input"
                        data-testid="share-email-input"
                        placeholder="teammate@example.com"
                        type="email"
                        value={shareEmail}
                        onChange={(event) => onShareEmailChange(event.target.value)}
                    />
                    <button
                        className="access-panel__share-button"
                        data-testid="share-submit"
                        disabled={shareSubmitting}
                        type="submit"
                    >
                        {shareSubmitting ? "Sharing..." : "Share access"}
                    </button>
                    {shareError ? (
                        <p className="access-panel__message access-panel__message--error" role="alert">
                            {shareError}
                        </p>
                    ) : null}
                    {shareSuccess ? (
                        <p className="access-panel__message access-panel__message--success">
                            {shareSuccess}
                        </p>
                    ) : null}
                </form>
            ) : null}
        </aside>
    )
}
