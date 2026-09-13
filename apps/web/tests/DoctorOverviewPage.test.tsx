import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DoctorOverviewPage from "@/app/doctor/page";
import { ApiError } from "@/lib/api-client";
import type { DetailedDoctor } from "@/lib/types";

const apiFetch = vi.fn();

vi.mock("@/lib/use-require-doctor", () => ({
  useRequireDoctor: () => ({ isReady: true, user: { id: "doc-user-1", role: "DOCTOR" } }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("DoctorOverviewPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("propose de créer le profil si aucun n'existe (404)", async () => {
    apiFetch.mockRejectedValue(new ApiError(404, "Profil médecin non créé.", null));

    render(<DoctorOverviewPage />);

    expect(await screen.findByText("Vous n'avez pas encore complété votre profil professionnel.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compléter mon profil professionnel" })).toHaveAttribute("href", "/doctor/profile");
  });

  it("affiche le statut de vérification si le profil existe", async () => {
    const doctor: DetailedDoctor = {
      id: "doc-1",
      userId: "doc-user-1",
      email: "doc@medilink.local",
      firstName: "Amina",
      lastName: "Bennani",
      licenseNumber: null,
      bio: null,
      professionalPhone: null,
      city: null,
      address: "12 rue de la Santé",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date().toISOString(),
      specialties: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    apiFetch.mockResolvedValue({ doctor });

    render(<DoctorOverviewPage />);

    expect(await screen.findByText("Vérifié")).toBeInTheDocument();
  });

  it("affiche les liens de navigation vers les 3 sections", async () => {
    apiFetch.mockRejectedValue(new ApiError(404, "Profil médecin non créé.", null));

    render(<DoctorOverviewPage />);
    await screen.findByText("Vous n'avez pas encore complété votre profil professionnel.");

    expect(screen.getByRole("link", { name: "Mon profil professionnel" })).toHaveAttribute("href", "/doctor/profile");
    expect(screen.getByRole("link", { name: "Mes disponibilités" })).toHaveAttribute("href", "/doctor/availability");
    expect(screen.getByRole("link", { name: "Mon agenda" })).toHaveAttribute("href", "/doctor/appointments");
  });
});
