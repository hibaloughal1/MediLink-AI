import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorAppointmentsPage from "@/app/doctor/appointments/page";
import { ApiError } from "@/lib/api-client";
import type { DoctorAppointment, PaginatedDoctorAppointments } from "@/lib/types";

const replace = vi.fn();
const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/doctor/appointments",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "doc-user-1", role: "DOCTOR" }, status: "authenticated" }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeAppointment(overrides: Partial<DoctorAppointment> = {}): DoctorAppointment {
  return {
    id: "appt-1",
    startAt: new Date(Date.now() + 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000 + 1_800_000).toISOString(),
    status: "CONFIRMED",
    patient: { firstName: "Sara", lastName: "El Amrani", phone: "0611111111" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DoctorAppointmentsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("affiche les rendez-vous du médecin via les champs patient.*", async () => {
    const data: PaginatedDoctorAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<DoctorAppointmentsPage />);

    expect(await screen.findByText("Sara El Amrani")).toBeInTheDocument();
    expect(screen.getByText("0611111111")).toBeInTheDocument();
  });

  it("annule un rendez-vous et affiche le message de succès", async () => {
    const data: PaginatedDoctorAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/cancel")) {
        return Promise.resolve({ appointment: { ...makeAppointment(), status: "CANCELLED" } });
      }
      return Promise.resolve(data);
    });

    render(<DoctorAppointmentsPage />);
    await screen.findByText("Sara El Amrani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByText("Rendez-vous annulé.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/doctors/me/appointments/appt-1/cancel", { method: "PATCH" });
  });

  it("affiche l'erreur 409 si l'annulation échoue côté API", async () => {
    const data: PaginatedDoctorAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/cancel")) {
        return Promise.reject(new ApiError(409, "Ce rendez-vous ne peut plus être annulé.", null));
      }
      return Promise.resolve(data);
    });

    render(<DoctorAppointmentsPage />);
    await screen.findByText("Sara El Amrani");

    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ce rendez-vous ne peut plus être annulé.");
  });

  it("prévient plutôt que de présenter silencieusement une page partielle comme l'agenda complet", async () => {
    const data: PaginatedDoctorAppointments = { appointments: [makeAppointment()], total: 5, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<DoctorAppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Affichage des 1 rendez-vous les plus récents sur 5.")).toBeInTheDocument();
    });
  });
});
