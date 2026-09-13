import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DoctorsSearchPage from "@/app/doctors/page";
import { ApiError } from "@/lib/api-client";
import type { PaginatedDoctors } from "@/lib/types";

const push = vi.fn();
const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/use-filters", () => ({
  useFilters: () => ({
    specialties: [{ id: "s1", name: "Cardiologie" }],
    cities: [{ id: "c1", name: "Agadir" }],
    loading: false,
  }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("DoctorsSearchPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("affiche les médecins trouvés", async () => {
    const data: PaginatedDoctors = {
      doctors: [
        {
          id: "doc-1",
          firstName: "Youssef",
          lastName: "Bennani",
          bio: null,
          city: { id: "c1", name: "Casablanca" },
          address: null,
          specialties: [{ id: "s1", name: "Cardiologie" }],
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };
    apiFetch.mockResolvedValue(data);

    render(<DoctorsSearchPage />);

    expect(await screen.findByText(/Youssef Bennani/)).toBeInTheDocument();
  });

  it("affiche un message si aucun médecin ne correspond", async () => {
    const data: PaginatedDoctors = { doctors: [], total: 0, page: 1, limit: 20 };
    apiFetch.mockResolvedValue(data);

    render(<DoctorsSearchPage />);

    expect(await screen.findByText("Aucun médecin ne correspond à cette recherche.")).toBeInTheDocument();
  });

  it("affiche une erreur API en cas d'échec", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<DoctorsSearchPage />);

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });
});
