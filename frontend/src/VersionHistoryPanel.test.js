import { fireEvent, render, screen } from "@testing-library/react"

import VersionHistoryPanel, {
    formatHistoryTimestamp,
} from "./VersionHistoryPanel"

describe("VersionHistoryPanel", () => {
    it("shows the loading state while history is being fetched", () => {
        render(
            <VersionHistoryPanel
                historyLoading={true}
                restoringVersionId={null}
                versions={[]}
                onRestore={() => {}}
            />
        )

        expect(screen.getByText(/Loading history/i)).toBeInTheDocument()
    })

    it("shows the empty state when no versions exist", () => {
        render(
            <VersionHistoryPanel
                historyLoading={false}
                restoringVersionId={null}
                versions={[]}
                onRestore={() => {}}
            />
        )

        expect(
            screen.getByText(/No history yet/i)
        ).toBeInTheDocument()
    })

    it("renders versions and calls restore when clicked", () => {
        const onRestore = jest.fn()

        render(
            <VersionHistoryPanel
                historyLoading={false}
                restoringVersionId={null}
                versions={[
                    {
                        versionId: "version-1",
                        createdAt: "2026-04-02T12:34:56.000Z",
                        savedBy: {
                            displayName: "Anubhab",
                        },
                        source: "checkpoint",
                    },
                ]}
                onRestore={onRestore}
            />
        )

        expect(screen.getByText("Anubhab")).toBeInTheDocument()
        expect(screen.getByText("Checkpoint")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /restore/i }))

        expect(onRestore).toHaveBeenCalledWith("version-1")
    })

    it("shows restoring state when a restore is in progress", () => {
        render(
            <VersionHistoryPanel
                historyLoading={false}
                restoringVersionId="version-1"
                versions={[
                    {
                        versionId: "version-1",
                        createdAt: "2026-04-02T12:34:56.000Z",
                        savedBy: {
                            displayName: "Anubhab",
                        },
                        source: "restore-backup",
                    },
                ]}
                onRestore={() => {}}
            />
        )

        expect(screen.getByText("Pre-restore backup")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /restoring/i })).toBeDisabled()
    })

    it("falls back to guest metadata and preserves unknown source labels", () => {
        render(
            <VersionHistoryPanel
                historyLoading={false}
                restoringVersionId="version-1"
                versions={[
                    {
                        versionId: "version-1",
                        createdAt: null,
                        source: "manual-import",
                    },
                    {
                        versionId: "version-2",
                        createdAt: "2026-04-02T12:34:56.000Z",
                        source: "checkpoint",
                    },
                ]}
                onRestore={() => {}}
            />
        )

        expect(screen.getByText("Guest")).toBeInTheDocument()
        expect(screen.getByText("Unknown time")).toBeInTheDocument()
        expect(screen.getByText("manual-import")).toBeInTheDocument()
        expect(screen.getByTestId("history-restore-version-2")).toBeDisabled()
    })
})

describe("formatHistoryTimestamp", () => {
    it("falls back for invalid dates", () => {
        expect(formatHistoryTimestamp("not-a-date")).toBe("Unknown time")
    })
})
