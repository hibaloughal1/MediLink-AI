import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyAppointmentsPage from "@/app/patient/appointments/page";
import { ApiError } from "@/lib/api-client";
import type { PaginatedAppointments, PatientAppointment } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("@/lib/use-require-patient", () => ({
  useRequirePatient: () => ({ isReady: true, user: { id: "patient-1", role: "PATIENT" } }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeAppointment(overrides: Partial<PatientAppointment> = {}): PatientAppointment {
  return {
    id: "appt-1",
    startAt: new Date(Date.now() + 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000 + 1_800_000).toISOString(),
    status: "CONFIRMED",
    doctor: {
      id: "doc-1",
      firstName: "Youssef",
      lastName: "Bennani",
      address: null,
      city: { id: "c1", name: "Casablanca" },
      specialties: [{ id: "s1", name: "Cardiologie" }],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PatientAppointmentsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("affiche un état vide si aucun rendez-vous", async () => {
    const data: PaginatedAppointments = { appointments: [], total: 0, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<MyAppointmentsPage />);

    expect(await screen.findByText("Vous n'avez pas encore de rendez-vous.")).toBeInTheDocument();
  });

  it("affiche les rendez-vous et permet l'annulation", async () => {
    const data: PaginatedAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/cancel")) {
        return Promise.resolve({ appointment: makeAppointment({ status: "CANCELLED" }) });
      }
      return Promise.resolve(data);
    });

    render(<MyAppointmentsPage />);
    await screen.findByText(/Youssef Bennani/);

    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByText("Rendez-vous annulé.")).toBeInTheDocument();
  });

  it("affiche une erreur API en cas d'échec de chargement", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<MyAppointmentsPage />);

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });
});
