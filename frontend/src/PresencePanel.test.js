import { render, screen } from "@testing-library/react"

import PresencePanel from "./PresencePanel"

describe("PresencePanel", () => {
    it("renders the empty state when no collaborators are present", () => {
        render(<PresencePanel collaborators={[]} />)

        expect(
            screen.getByText(/Presence will appear here/i)
        ).toBeInTheDocument()
    })

    it("renders active collaborators and marks the local user", () => {
        render(
            <PresencePanel
                collaborators={[
                    {
                        color: "#1864ab",
                        displayName: "Alice",
                        isLocal: true,
                        userId: "user-1",
                    },
                    {
                        color: "#d9480f",
                        displayName: "Bob",
                        isLocal: false,
                        userId: "user-2",
                    },
                ]}
            />
        )

        expect(screen.getByText("Alice")).toBeInTheDocument()
        expect(screen.getByText("Bob")).toBeInTheDocument()
        expect(screen.getByText("You")).toBeInTheDocument()
        expect(screen.getByText("Editing now")).toBeInTheDocument()
    })
})
