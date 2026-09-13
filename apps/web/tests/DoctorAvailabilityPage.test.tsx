import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorAvailabilityPage from "@/app/doctor/availability/page";
import { ApiError } from "@/lib/api-client";
import type { AvailabilityRule } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("@/lib/use-require-doctor", () => ({
  useRequireDoctor: () => ({ isReady: true, user: { id: "doc-user-1", role: "DOCTOR" } }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule-1",
    doctorId: "doc-1",
    type: "RECURRING",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMinutes: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    specificDate: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DoctorAvailabilityPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche un état vide si aucune disponibilité", async () => {
    apiFetch.mockResolvedValue({ availability: [] });

    render(<DoctorAvailabilityPage />);

    expect(await screen.findByText("Aucune disponibilité définie pour le moment.")).toBeInTheDocument();
  });

  it("affiche les règles existantes", async () => {
    apiFetch.mockResolvedValue({ availability: [makeRule()] });

    render(<DoctorAvailabilityPage />);

    expect(await screen.findByText("Récurrente")).toBeInTheDocument();
  });

  it("ouvre le formulaire de création récurrente et affiche un succès après création", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/availability") && init?.method === "POST") {
        return Promise.resolve({ availability: makeRule() });
      }
      return Promise.resolve({ availability: [] });
    });

    render(<DoctorAvailabilityPage />);
    await screen.findByText("Aucune disponibilité définie pour le moment.");

    await userEvent.setup().click(screen.getByRole("button", { name: "Ajouter une disponibilité récurrente" }));
    expect(screen.getByLabelText("Jour de la semaine")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText("Disponibilité créée.")).toBeInTheDocument();
  });

  it("supprime une règle après confirmation", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/rule-1") && init?.method === "DELETE") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({ availability: [makeRule()] });
    });

    render(<DoctorAvailabilityPage />);
    await screen.findByText("Récurrente");

    await userEvent.setup().click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.getByText("Règle supprimée.")).toBeInTheDocument());
  });

  it("affiche une erreur API en cas d'échec de chargement", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<DoctorAvailabilityPage />);

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });
});
