import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedRoomLobby } from "./SharedRoomLobby";

const socket = { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
vi.mock("socket.io-client", () => ({ io: () => socket }));

function projection(status: "waiting" | "playing" | "closed" = "waiting") {
  return { code: "AB23CD", status, version: 0, participants: [{ id: "host-1", name: "Host", role: "host", connected: true }], self: { id: "host-1", role: "host" } };
}

describe("SharedRoomLobby", () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

  it("creates a room and renders a local participant QR without host credentials", async () => {
    const fetchMock = vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ room: projection(), hostToken: "HOST-SECRET", reconnectToken: "RECONNECT-SECRET" }), { status: 201 }));
    const { container } = render(<SharedRoomLobby apiUrl="http://localhost:3000" />);
    fireEvent.change(screen.getByLabelText("ホスト名"), { target: { value: "Host" } });
    fireEvent.click(screen.getAllByRole("button", { name: "ルームを作る" })[1]);
    await waitFor(() => expect(screen.getByLabelText("参加用QRコード")).toBeInTheDocument());
    expect(screen.getByText("AB23CD")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("HOST-SECRET");
    expect(container.innerHTML).not.toContain("RECONNECT-SECRET");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/v2/rooms", expect.objectContaining({ method: "POST" }));
  });

  it("shows closed-room rejection for manual code entry", async () => {
    vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...projection("closed") }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "room_not_joinable" }), { status: 409 }));
    render(<SharedRoomLobby apiUrl="http://localhost:3000" />);
    fireEvent.click(screen.getAllByRole("button", { name: "コードで参加" })[0]);
    fireEvent.change(screen.getByLabelText("ルームコード"), { target: { value: "AB23CD" } });
    fireEvent.change(screen.getByLabelText("ニックネーム"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("参加受付を締め切っています"));
  });
});
