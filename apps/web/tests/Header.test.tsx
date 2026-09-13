import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/Header";
import type { PaginatedNotifications } from "@/lib/types";

const apiFetch = vi.fn();
let mockUser: { role: string } | null = null;
let mockStatus: "loading" | "authenticated" | "unauthenticated" = "unauthenticated";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: mockUser, status: mockStatus, logout: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("Header — cloche de notifications", () => {
  beforeEach(() => {
    const data: PaginatedNotifications = { notifications: [], total: 0, page: 1, limit: 1 };
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(data);
  });

  it.each(["PATIENT", "DOCTOR", "ADMIN"])("affiche la cloche de notifications pour un %s authentifié", (role) => {
    mockStatus = "authenticated";
    mockUser = { role };

    render(<Header />);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("n'affiche pas la cloche pour un visiteur non authentifié", () => {
    mockStatus = "unauthenticated";
    mockUser = null;

    render(<Header />);

    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });
});
