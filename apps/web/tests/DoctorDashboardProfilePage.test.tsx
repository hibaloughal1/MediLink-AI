import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorDashboardProfilePage from "@/app/doctor/profile/page";
import { ApiError } from "@/lib/api-client";
import type { DetailedDoctor } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/doctor/profile",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "doc-user-1", role: "DOCTOR" }, status: "authenticated" }),
}));

vi.mock("@/lib/use-filters", () => ({
  useFilters: () => ({
    specialties: [{ id: "s1", name: "Cardiologie" }],
    cities: [{ id: "c1", name: "Casablanca" }],
    loading: false,
  }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeDoctor(overrides: Partial<DetailedDoctor> = {}): DetailedDoctor {
  return {
    id: "doc-1",
    userId: "doc-user-1",
    email: "doc@medilink.local",
    firstName: "Amina",
    lastName: "Bennani",
    licenseNumber: null,
    bio: null,
    professionalPhone: null,
    city: { id: "c1", name: "Casablanca" },
    address: "12 rue des Fleurs",
    verificationStatus: "PENDING",
    verifiedAt: null,
    specialties: [{ id: "s1", name: "Cardiologie" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DoctorDashboardProfilePage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("création : affiche le message de succès après création (ne disparaît pas avec le formulaire démonté)", async () => {
    const created = makeDoctor();
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/doctors/me") return Promise.reject(new ApiError(404, "Profil médecin non créé.", null));
      if (path === "/api/doctors" && init?.method === "POST") return Promise.resolve({ doctor: created });
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    render(<DoctorDashboardProfilePage />);

    await screen.findByText("Compléter mon profil professionnel");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ville"), "c1");
    await user.type(screen.getByLabelText("Adresse du cabinet"), "12 rue des Fleurs");
    await user.click(screen.getByLabelText("Cardiologie"));
    await user.click(screen.getByRole("button", { name: "Créer mon profil" }));

    expect(await screen.findByText("Profil créé avec succès.")).toBeInTheDocument();
    expect(screen.getByText("En attente de validation")).toBeInTheDocument();
  });

  it("édition : pré-remplit le formulaire à partir du profil existant et affiche le succès de mise à jour", async () => {
    const existing = makeDoctor({ verificationStatus: "VERIFIED" });
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/doctors/me" && (!init || init.method === undefined)) return Promise.resolve({ doctor: existing });
      if (path === "/api/doctors/me" && init?.method === "PATCH") return Promise.resolve({ doctor: existing });
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    render(<DoctorDashboardProfilePage />);

    await screen.findByText("Mon profil professionnel");
    expect(screen.getByLabelText("Adresse du cabinet")).toHaveValue("12 rue des Fleurs");

    await userEvent.setup().click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Profil mis à jour.")).toBeInTheDocument();
  });

  it("affiche l'erreur API renvoyée lors de la création (ex. 409)", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/doctors/me") return Promise.reject(new ApiError(404, "Profil médecin non créé.", null));
      if (path === "/api/doctors" && init?.method === "POST") {
        return Promise.reject(new ApiError(409, "Un profil existe déjà pour ce compte.", null));
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    render(<DoctorDashboardProfilePage />);
    await screen.findByText("Compléter mon profil professionnel");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ville"), "c1");
    await user.type(screen.getByLabelText("Adresse du cabinet"), "12 rue des Fleurs");
    await user.click(screen.getByLabelText("Cardiologie"));
    await user.click(screen.getByRole("button", { name: "Créer mon profil" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Un profil existe déjà pour ce compte.");
  });
});
