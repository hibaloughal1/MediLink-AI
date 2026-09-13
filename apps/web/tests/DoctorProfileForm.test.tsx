import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorProfileForm } from "@/components/DoctorProfileForm";
import { ApiError } from "@/lib/api-client";
import type { City, Specialty } from "@/lib/types";

const cities: City[] = [{ id: "c1", name: "Casablanca" }];
const specialties: Specialty[] = [
  { id: "s1", name: "Cardiologie" },
  { id: "s2", name: "Dermatologie" },
];

describe("DoctorProfileForm", () => {
  it("création : bloque la soumission tant qu'aucune spécialité n'est cochée", async () => {
    const onSubmit = vi.fn();
    render(<DoctorProfileForm mode="create" cities={cities} specialties={specialties} onSubmit={onSubmit} />);

    await userEvent.setup().selectOptions(screen.getByLabelText("Ville"), "c1");
    await userEvent.setup().type(screen.getByLabelText("Adresse du cabinet"), "12 rue des Fleurs");
    await userEvent.setup().click(screen.getByRole("button", { name: "Créer mon profil" }));

    expect(screen.getByText("Sélectionnez au moins une spécialité.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("création : soumet les champs saisis avec les spécialités cochées", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<DoctorProfileForm mode="create" cities={cities} specialties={specialties} onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ville"), "c1");
    await user.type(screen.getByLabelText("Adresse du cabinet"), "12 rue des Fleurs");
    await user.click(screen.getByLabelText("Cardiologie"));
    await user.click(screen.getByRole("button", { name: "Créer mon profil" }));

    expect(onSubmit).toHaveBeenCalledWith({
      cityId: "c1",
      address: "12 rue des Fleurs",
      bio: "",
      professionalPhone: "",
      licenseNumber: "",
      specialtyIds: ["s1"],
    });
  });

  it("édition : pré-remplit les champs à partir de `initial`", () => {
    render(
      <DoctorProfileForm
        mode="edit"
        cities={cities}
        specialties={specialties}
        initial={{
          cityId: "c1",
          address: "12 rue des Fleurs",
          bio: "Bio",
          professionalPhone: "0600000000",
          licenseNumber: "LIC-1",
          specialtyIds: ["s2"],
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Adresse du cabinet")).toHaveValue("12 rue des Fleurs");
    expect(screen.getByLabelText("Dermatologie")).toBeChecked();
    expect(screen.getByLabelText("Cardiologie")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });

  it("n'affiche aucun champ de contrôle du statut de vérification", () => {
    render(<DoctorProfileForm mode="create" cities={cities} specialties={specialties} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/vérification/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verifié|vérifié/i)).not.toBeInTheDocument();
  });

  it("affiche le message d'erreur renvoyé par l'API", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "Un profil existe déjà pour ce compte.", null));
    render(<DoctorProfileForm mode="create" cities={cities} specialties={specialties} onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ville"), "c1");
    await user.type(screen.getByLabelText("Adresse du cabinet"), "12 rue des Fleurs");
    await user.click(screen.getByLabelText("Cardiologie"));
    await user.click(screen.getByRole("button", { name: "Créer mon profil" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Un profil existe déjà pour ce compte.");
  });
});
