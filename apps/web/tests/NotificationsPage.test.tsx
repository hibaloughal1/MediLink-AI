import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "@/app/notifications/page";
import { ApiError } from "@/lib/api-client";
import type { AppNotification, PaginatedNotifications } from "@/lib/types";

const replace = vi.fn();
const apiFetch = vi.fn();
let mockUser: { id: string; role: string } | null = { id: "patient-1", role: "PATIENT" };
let mockStatus: "loading" | "authenticated" | "unauthenticated" = "authenticated";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: mockUser, status: mockStatus }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notif-1",
    type: "APPOINTMENT_BOOKED",
    appointmentId: "appt-1",
    appointmentStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    doctorName: "Youssef Bennani",
    patientName: "Sara Alaoui",
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
    mockUser = { id: "patient-1", role: "PATIENT" };
    mockStatus = "authenticated";
  });

  it("redirige vers /login si non authentifié", async () => {
    mockStatus = "unauthenticated";
    render(<NotificationsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fnotifications"));
  });

  it("affiche un état vide si aucune notification", async () => {
    const data: PaginatedNotifications = { notifications: [], total: 0, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationsPage />);

    expect(await screen.findByText("Aucune notification pour le moment.")).toBeInTheDocument();
  });

  it("affiche une notification pour un PATIENT avec le nom du médecin", async () => {
    const data: PaginatedNotifications = { notifications: [makeNotification()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationsPage />);

    expect(await screen.findByText("Rendez-vous confirmé")).toBeInTheDocument();
    expect(screen.getByText(/avec Dr Youssef Bennani/)).toBeInTheDocument();
  });

  it("affiche une notification pour un DOCTOR avec le nom du patient", async () => {
    mockUser = { id: "doctor-1", role: "DOCTOR" };
    const data: PaginatedNotifications = { notifications: [makeNotification()], total: 1, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationsPage />);

    expect(await screen.findByText(/avec Sara Alaoui/)).toBeInTheDocument();
  });

  it("marque une notification comme lue au clic", async () => {
    const data: PaginatedNotifications = { notifications: [makeNotification()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/read") && init?.method === "PATCH") {
        return Promise.resolve({ notification: makeNotification({ readAt: new Date().toISOString() }) });
      }
      return Promise.resolve(data);
    });

    render(<NotificationsPage />);
    await screen.findByText("Rendez-vous confirmé");

    await userEvent.setup().click(screen.getByRole("button", { name: "Marquer comme lue" }));

    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/me/notif-1/read", { method: "PATCH" });
  });

  it("tout marquer comme lu affiche un message de succès", async () => {
    const data: PaginatedNotifications = { notifications: [makeNotification()], total: 1, page: 1, limit: 100 };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/notifications/me/read-all") return Promise.resolve({ updated: 1 });
      return Promise.resolve(data);
    });

    render(<NotificationsPage />);
    await screen.findByText("Rendez-vous confirmé");

    await userEvent.setup().click(screen.getByRole("button", { name: "Tout marquer comme lu" }));

    expect(await screen.findByText("Toutes les notifications ont été marquées comme lues.")).toBeInTheDocument();
  });

  it("affiche une erreur API en cas d'échec de chargement", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<NotificationsPage />);

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });

  it("prévient plutôt que de présenter silencieusement une page partielle comme la liste complète", async () => {
    const data: PaginatedNotifications = { notifications: [makeNotification()], total: 5, page: 1, limit: 100 };
    apiFetch.mockResolvedValue(data);

    render(<NotificationsPage />);

    expect(await screen.findByText("Affichage des 1 notifications les plus récentes sur 5.")).toBeInTheDocument();
  });

  it("n'affiche pas le bouton \"Marquer comme lue\" pour une notification déjà lue", async () => {
    const data: PaginatedNotifications = {
      notifications: [makeNotification({ readAt: new Date().toISOString() })],
      total: 1,
      page: 1,
      limit: 100,
    };
    apiFetch.mockResolvedValue(data);

    render(<NotificationsPage />);
    await screen.findByText("Rendez-vous confirmé");

    expect(screen.queryByRole("button", { name: "Marquer comme lue" })).not.toBeInTheDocument();
  });
});
