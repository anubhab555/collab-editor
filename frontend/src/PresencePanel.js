export default function PresencePanel({ collaborators }) {
    const collaboratorCount = collaborators.length

    return (
        <aside className="presence-panel" data-testid="presence-panel">
            <div className="presence-panel__header">
                <h2>Active Collaborators</h2>
                <p>
                    {collaboratorCount === 1
                        ? "1 active collaborator"
                        : `${collaboratorCount} active collaborators`}
                </p>
            </div>
            <div className="presence-panel__body">
                {collaboratorCount === 0 ? (
                    <p className="presence-panel__empty">
                        Presence will appear here as soon as a document session is active.
                    </p>
                ) : (
                    <ul className="presence-list">
                        {collaborators.map((collaborator) => (
                            <li
                                className="presence-list__item"
                                data-testid={`presence-item-${collaborator.userId}`}
                                key={collaborator.userId}
                            >
                                <span
                                    aria-hidden="true"
                                    className="presence-list__swatch"
                                    style={{ backgroundColor: collaborator.color }}
                                />
                                <div className="presence-list__meta">
                                    <p className="presence-list__name">{collaborator.displayName}</p>
                                    <p className="presence-list__status">
                                        {collaborator.isLocal ? "You" : "Editing now"}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    )
}
