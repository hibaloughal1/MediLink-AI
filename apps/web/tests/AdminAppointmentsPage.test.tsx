import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminAppointmentsPage from "@/app/admin/appointments/page";
import type { AdminAppointment, PaginatedAdminAppointments } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/appointments",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "admin-1", role: "ADMIN" }, status: "authenticated" }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeAppointment(overrides: Partial<AdminAppointment> = {}): AdminAppointment {
  return {
    id: "appt-1",
    startAt: new Date(Date.now() + 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000 + 1_800_000).toISOString(),
    status: "CONFIRMED",
    doctorId: "doc-1",
    doctorName: "Youssef Bennani",
    patientId: "patient-1",
    patientName: "Sara Alaoui",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AdminAppointmentsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("affiche les rendez-vous avec le nom du médecin et du patient, dans une table à défilement horizontal", async () => {
    const data: PaginatedAdminAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    const { container } = render(<AdminAppointmentsPage />);

    expect(await screen.findByText("Youssef Bennani")).toBeInTheDocument();
    expect(screen.getByText("Sara Alaoui")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });

  it("est strictement en lecture seule : aucun bouton d'annulation, modification ou suppression", async () => {
    const data: PaginatedAdminAppointments = { appointments: [makeAppointment()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminAppointmentsPage />);
    await screen.findByText("Youssef Bennani");

    expect(screen.queryByRole("button", { name: "Annuler" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });

  it("prévient plutôt que de présenter silencieusement une page partielle comme la liste complète", async () => {
    const data: PaginatedAdminAppointments = { appointments: [makeAppointment()], total: 5, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<AdminAppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Affichage des 1 rendez-vous les plus récents sur 5.")).toBeInTheDocument();
    });
  });
});
