import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDoctorsPage from "@/app/admin/doctors/page";
import { ApiError } from "@/lib/api-client";
import type { DetailedDoctor, PaginatedAdminDoctors } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/doctors",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "admin-1", role: "ADMIN" }, status: "authenticated" }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeDoctor(overrides: Partial<DetailedDoctor> = {}): DetailedDoctor {
  return {
    id: "doc-1",
    userId: "user-1",
    email: "doc@medilink.local",
    firstName: "Amina",
    lastName: "Bennani",
    licenseNumber: null,
    bio: null,
    professionalPhone: null,
    city: null,
    address: "12 rue de la Santé",
    verificationStatus: "PENDING",
    verifiedAt: null,
    specialties: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AdminDoctorsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.spyOn(window, "confirm");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche la file de médecins avec leur statut de vérification, dans une table à défilement horizontal", async () => {
    const data: PaginatedAdminDoctors = { doctors: [makeDoctor()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    const { container } = render(<AdminDoctorsPage />);

    expect(await screen.findByText("Amina Bennani")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("En attente")).toBeInTheDocument();
    // La table (potentiellement plus large que l'écran) doit défiler dans
    // son propre conteneur plutôt que de forcer un défilement horizontal de
    // toute la page (contrainte responsive à 400px de large).
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });

  it("vérifie un médecin sans demander de confirmation", async () => {
    const data: PaginatedAdminDoctors = { doctors: [makeDoctor()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify")) return Promise.resolve({ doctor: makeDoctor({ verificationStatus: "VERIFIED" }) });
      return Promise.resolve(data);
    });

    render(<AdminDoctorsPage />);
    await screen.findByText("Amina Bennani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Vérifier" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/doctors/doc-1/verify", { method: "PATCH" });
    expect(await screen.findByText(/Médecin vérifié/)).toBeInTheDocument();
  });

  it("demande confirmation avant de rejeter un médecin, et n'appelle pas l'API si annulé", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const data: PaginatedAdminDoctors = { doctors: [makeDoctor()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminDoctorsPage />);
    await screen.findByText("Amina Bennani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Rejeter" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/reject"), expect.anything());
  });

  it("demande confirmation avant de suspendre un médecin, et appelle l'API si confirmé", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    const verifiedDoctor = makeDoctor({ verificationStatus: "VERIFIED" });
    const data: PaginatedAdminDoctors = { doctors: [verifiedDoctor], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/suspend")) {
        return Promise.resolve({ doctor: makeDoctor({ verificationStatus: "SUSPENDED" }) });
      }
      return Promise.resolve(data);
    });

    render(<AdminDoctorsPage />);
    await screen.findByText("Amina Bennani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Suspendre" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/doctors/doc-1/suspend", { method: "PATCH" });
    expect(await screen.findByText(/Médecin suspendu/)).toBeInTheDocument();
  });

  it("affiche une erreur 409 si l'action échoue côté API", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    const data: PaginatedAdminDoctors = { doctors: [makeDoctor()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/reject")) {
        return Promise.reject(new ApiError(409, "Conflit lors du rejet.", null));
      }
      return Promise.resolve(data);
    });

    render(<AdminDoctorsPage />);
    await screen.findByText("Amina Bennani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Rejeter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Conflit lors du rejet.");
  });

  it("filtre par statut relance le chargement avec le bon paramètre", async () => {
    const data: PaginatedAdminDoctors = { doctors: [], total: 0, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminDoctorsPage />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/admin/doctors?limit=100"));

    await userEvent.setup().click(screen.getByRole("button", { name: "En attente" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/admin/doctors?limit=100&status=PENDING"));
  });
});
