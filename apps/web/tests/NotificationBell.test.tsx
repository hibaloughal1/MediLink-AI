import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationBell } from "@/components/NotificationBell";
import type { PaginatedNotifications } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("NotificationBell", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("interroge le nombre de non-lus au montage", async () => {
    const data: PaginatedNotifications = { notifications: [], total: 0, page: 1, limit: 1 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationBell />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/notifications/me?unreadOnly=true&limit=1"));
  });

  it("n'affiche aucun badge quand il n'y a aucune notification non lue", async () => {
    const data: PaginatedNotifications = { notifications: [], total: 0, page: 1, limit: 1 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationBell />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-unread-badge")).not.toBeInTheDocument();
  });

  it("affiche le badge avec le nombre de non-lus", async () => {
    const data: PaginatedNotifications = { notifications: [], total: 3, page: 1, limit: 1 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationBell />);

    expect(await screen.findByTestId("notification-unread-badge")).toHaveTextContent("3");
  });

  it("n'affiche pas de badge si la requête échoue", async () => {
    apiFetch.mockRejectedValue(new Error("network error"));

    render(<NotificationBell />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-unread-badge")).not.toBeInTheDocument();
  });
});
