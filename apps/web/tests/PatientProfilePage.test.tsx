import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyProfilePage from "@/app/patient/profile/page";
import { ApiError } from "@/lib/api-client";

const apiFetch = vi.fn();
const refreshProfile = vi.fn();

const mockUser = {
  id: "patient-1",
  email: "fatima@medilink.local",
  firstName: "Fatima",
  lastName: "Alaoui",
  phone: null,
  role: "PATIENT",
  status: "ACTIVE",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("@/lib/use-require-patient", () => ({
  useRequirePatient: () => ({ isReady: true, user: mockUser }),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ refreshProfile }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

describe("PatientProfilePage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    refreshProfile.mockReset().mockResolvedValue(undefined);
  });

  it("pré-remplit le formulaire avec le profil courant", () => {
    render(<MyProfilePage />);
    expect(screen.getByLabelText("Prénom")).toHaveValue("Fatima");
    expect(screen.getByLabelText("Nom")).toHaveValue("Alaoui");
    expect(screen.getByLabelText("E-mail")).toHaveValue("fatima@medilink.local");
    expect(screen.getByLabelText("E-mail")).toBeDisabled();
  });

  it("enregistre les modifications et affiche un message de succès", async () => {
    apiFetch.mockResolvedValue({ user: mockUser });

    render(<MyProfilePage />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Téléphone"));
    await user.type(screen.getByLabelText("Téléphone"), "0600000000");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ firstName: "Fatima", lastName: "Alaoui", phone: "0600000000" }) }),
    );
    expect(await screen.findByText("Profil mis à jour.")).toBeInTheDocument();
    expect(refreshProfile).toHaveBeenCalled();
  });

  it("affiche une erreur API en cas d'échec", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    render(<MyProfilePage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Erreur serveur.")).toBeInTheDocument();
  });
});
