import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminOverviewPage from "@/app/admin/page";
import { ApiError } from "@/lib/api-client";

const apiFetch = vi.fn();

vi.mock("@/lib/use-require-admin", () => ({
  useRequireAdmin: () => ({ isReady: true, user: { id: "admin-1", role: "ADMIN" } }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("affiche les compteurs (médecins en attente, utilisateurs, rendez-vous)", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/admin/doctors")) return Promise.resolve({ doctors: [], total: 2, page: 1, limit: 1 });
      if (path.includes("/admin/appointments")) return Promise.resolve({ appointments: [], total: 7, page: 1, limit: 1 });
      return Promise.resolve({ users: [], total: 15, page: 1, pageSize: 1 });
    });

    render(<AdminOverviewPage />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("affiche les liens de navigation vers les 3 sections admin", async () => {
    apiFetch.mockResolvedValue({ doctors: [], users: [], appointments: [], total: 0, page: 1, limit: 1, pageSize: 1 });

    render(<AdminOverviewPage />);
    await screen.findByText("Espace administrateur");

    expect(screen.getByRole("link", { name: "Médecins" })).toHaveAttribute("href", "/admin/doctors");
    expect(screen.getByRole("link", { name: "Utilisateurs" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Rendez-vous" })).toHaveAttribute("href", "/admin/appointments");
  });

  it("affiche une erreur API en cas d'échec", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<AdminOverviewPage />);

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });
});
