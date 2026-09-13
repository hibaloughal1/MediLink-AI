import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminUsersPage from "@/app/admin/users/page";
import { ApiError } from "@/lib/api-client";
import type { AuthUser, PaginatedAdminUsers } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/users",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "admin-self", role: "ADMIN" }, status: "authenticated" }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "patient@medilink.local",
    firstName: "Sara",
    lastName: "Patient",
    phone: null,
    role: "PATIENT",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.spyOn(window, "confirm");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche la liste des utilisateurs avec rôle et statut de compte, dans une table à défilement horizontal", async () => {
    const data: PaginatedAdminUsers = { users: [makeUser()], total: 1, page: 1, pageSize: 100 };
    apiFetch.mockResolvedValue(data);

    const { container } = render(<AdminUsersPage />);

    expect(await screen.findByText("Sara Patient")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Actif")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });

  it("demande confirmation avant de suspendre, et appelle l'API si confirmé", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    const data: PaginatedAdminUsers = { users: [makeUser()], total: 1, page: 1, pageSize: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/suspend")) {
        return Promise.resolve({ user: makeUser({ status: "SUSPENDED" }) });
      }
      return Promise.resolve(data);
    });

    render(<AdminUsersPage />);
    await screen.findByText("Sara Patient");

    await userEvent.setup().click(screen.getByRole("button", { name: "Suspendre" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/users/user-1/suspend", { method: "PATCH" });
    expect(await screen.findByText("Compte suspendu.")).toBeInTheDocument();
  });

  it("n'appelle pas l'API si la confirmation de suspension est annulée", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const data: PaginatedAdminUsers = { users: [makeUser()], total: 1, page: 1, pageSize: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminUsersPage />);
    await screen.findByText("Sara Patient");

    await userEvent.setup().click(screen.getByRole("button", { name: "Suspendre" }));

    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/suspend"), expect.anything());
  });

  it("propose Réactiver (avec confirmation) pour un compte suspendu", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    const data: PaginatedAdminUsers = { users: [makeUser({ status: "SUSPENDED" })], total: 1, page: 1, pageSize: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/reactivate")) {
        return Promise.resolve({ user: makeUser({ status: "ACTIVE" }) });
      }
      return Promise.resolve(data);
    });

    render(<AdminUsersPage />);
    await screen.findByText("Sara Patient");

    await userEvent.setup().click(screen.getByRole("button", { name: "Réactiver" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/users/user-1/reactivate", { method: "PATCH" });
  });

  it("affiche une erreur si l'action échoue côté API (ex. 409)", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    const data: PaginatedAdminUsers = { users: [makeUser()], total: 1, page: 1, pageSize: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/suspend")) {
        return Promise.reject(new ApiError(409, "Ce compte est déjà suspendu.", null));
      }
      return Promise.resolve(data);
    });

    render(<AdminUsersPage />);
    await screen.findByText("Sara Patient");

    await userEvent.setup().click(screen.getByRole("button", { name: "Suspendre" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ce compte est déjà suspendu.");
  });

  it("protège la ligne du compte admin courant : aucune action proposée, message explicatif affiché", async () => {
    const data: PaginatedAdminUsers = {
      users: [makeUser({ id: "admin-self", role: "ADMIN", firstName: "Moi", lastName: "Admin" })],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    apiFetch.mockResolvedValue(data);

    render(<AdminUsersPage />);

    expect(await screen.findByText("Moi Admin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspendre" })).not.toBeInTheDocument();
    expect(screen.getByText("Vous ne pouvez pas modifier votre propre compte.")).toBeInTheDocument();
  });

  it("protège toute ligne ADMIN (autre que soi-même) : pas de bouton Suspendre", async () => {
    const data: PaginatedAdminUsers = {
      users: [makeUser({ id: "other-admin", role: "ADMIN", firstName: "Autre", lastName: "Admin" })],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    apiFetch.mockResolvedValue(data);

    render(<AdminUsersPage />);

    expect(await screen.findByText("Autre Admin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspendre" })).not.toBeInTheDocument();
    expect(screen.getByText("Les comptes administrateurs ne peuvent pas être suspendus depuis cette interface.")).toBeInTheDocument();
  });

  it("les filtres rôle/statut relancent le chargement avec les bons paramètres", async () => {
    const data: PaginatedAdminUsers = { users: [], total: 0, page: 1, pageSize: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminUsersPage />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/users?pageSize=100"));

    await userEvent.setup().selectOptions(screen.getByLabelText("Rôle"), "DOCTOR");

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/users?pageSize=100&role=DOCTOR"));
  });
});
