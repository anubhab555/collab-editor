const VERSION_SOURCE_LABELS = {
    checkpoint: "Checkpoint",
    "restore-backup": "Pre-restore backup",
}
const HISTORY_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
})

function formatHistoryTimestamp(createdAt) {
    if (!createdAt) return "Unknown time"

    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return "Unknown time"

    return HISTORY_TIMESTAMP_FORMATTER.format(date)
}

export default function VersionHistoryPanel({
    historyLoading,
    restoringVersionId,
    versions,
    onRestore,
}) {
    return (
        <aside className="history-panel" data-testid="history-panel">
            <div className="history-panel__header">
                <h2>Version History</h2>
                <p>Automatic checkpoints are created every 30 seconds while the document changes.</p>
            </div>
            <div className="history-panel__body">
                {historyLoading ? (
                    <p className="history-panel__empty">Loading history...</p>
                ) : versions.length === 0 ? (
                    <p className="history-panel__empty">
                        No history yet. Keep editing and the first checkpoint will appear automatically.
                    </p>
                ) : (
                    <ul className="history-list">
                        {versions.map((version) => (
                            <li
                                className="history-list__item"
                                data-testid={`history-item-${version.versionId}`}
                                key={version.versionId}
                            >
                                <div className="history-list__meta">
                                    <p className="history-list__timestamp">
                                        {formatHistoryTimestamp(version.createdAt)}
                                    </p>
                                    <p className="history-list__author">
                                        {version.savedBy?.displayName || "Guest"}
                                    </p>
                                </div>
                                <span className="history-list__source">
                                    {VERSION_SOURCE_LABELS[version.source] || version.source}
                                </span>
                                <button
                                    className="history-list__restore"
                                    data-testid={`history-restore-${version.versionId}`}
                                    type="button"
                                    disabled={historyLoading || restoringVersionId != null}
                                    onClick={() => onRestore(version.versionId)}
                                >
                                    {restoringVersionId === version.versionId ? "Restoring..." : "Restore"}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    )
}

export {
    formatHistoryTimestamp,
    VERSION_SOURCE_LABELS,
}
