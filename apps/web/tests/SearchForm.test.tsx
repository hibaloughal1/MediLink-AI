import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchForm } from "@/components/SearchForm";

vi.mock("@/lib/use-filters", () => ({
  useFilters: () => ({
    specialties: [{ id: "s1", name: "Cardiologie" }],
    cities: [{ id: "c1", name: "Agadir" }],
    loading: false,
  }),
}));

describe("SearchForm", () => {
  it("appelle onSearch avec les valeurs saisies", async () => {
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Spécialité"), "Cardiologie");
    await user.selectOptions(screen.getByLabelText("Ville"), "Agadir");
    await user.type(screen.getByLabelText("Nom du médecin"), "Bennani");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    expect(onSearch).toHaveBeenCalledWith({ specialty: "Cardiologie", city: "Agadir", search: "Bennani" });
  });

  it("pré-remplit les champs à partir de `initial`", () => {
    render(<SearchForm initial={{ specialty: "Cardiologie", city: "", search: "Test" }} onSearch={vi.fn()} />);
    expect(screen.getByLabelText("Nom du médecin")).toHaveValue("Test");
  });
});
