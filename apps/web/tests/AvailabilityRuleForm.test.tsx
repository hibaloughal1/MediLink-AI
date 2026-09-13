import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvailabilityRuleForm } from "@/components/AvailabilityRuleForm";
import { ApiError } from "@/lib/api-client";

describe("AvailabilityRuleForm", () => {
  it("RECURRING : soumet dayOfWeek/startTime/endTime/slotDurationMinutes/effectiveFrom/effectiveTo", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AvailabilityRuleForm type="RECURRING" submitLabel="Créer" onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Jour de la semaine"), "Lundi");
    await user.clear(screen.getByLabelText("Heure de début"));
    await user.type(screen.getByLabelText("Heure de début"), "09:00");
    await user.clear(screen.getByLabelText("Heure de fin"));
    await user.type(screen.getByLabelText("Heure de fin"), "13:00");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted).toMatchObject({ dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });
    expect(submitted).toHaveProperty("slotDurationMinutes");
    expect(submitted).toHaveProperty("effectiveFrom");
  });

  it("DATE_OVERRIDE : ne propose que la sélection d'une date, sans champ de créneau partiel", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AvailabilityRuleForm type="DATE_OVERRIDE" submitLabel="Bloquer" onSubmit={onSubmit} />);

    expect(screen.queryByLabelText("Heure de début")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Heure de fin")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date à bloquer")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Bloquer" }));
    expect(onSubmit).toHaveBeenCalledWith({ specificDate: expect.any(String) });
  });

  it("affiche une erreur 400 (validation) renvoyée par l'API", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, "Créneau invalide : l'heure de fin doit être après l'heure de début.", null));
    render(<AvailabilityRuleForm type="RECURRING" submitLabel="Créer" onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("l'heure de fin doit être après l'heure de début");
  });

  it("affiche une erreur 409 (chevauchement) renvoyée par l'API", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "Cette règle chevauche une disponibilité existante.", null));
    render(<AvailabilityRuleForm type="RECURRING" submitLabel="Créer" onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette règle chevauche une disponibilité existante.");
  });

  it("affiche une erreur 409 (date déjà bloquée) pour un DATE_OVERRIDE", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "Cette date est déjà bloquée.", null));
    render(<AvailabilityRuleForm type="DATE_OVERRIDE" submitLabel="Bloquer" onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Bloquer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette date est déjà bloquée.");
  });
});
