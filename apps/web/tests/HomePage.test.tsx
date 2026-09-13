import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomePage from "@/app/page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/use-filters", () => ({
  useFilters: () => ({
    specialties: [{ id: "s1", name: "Cardiologie" }],
    cities: [{ id: "c1", name: "Agadir" }],
    loading: false,
  }),
}));

describe("HomePage", () => {
  it("affiche le titre et le formulaire de recherche", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechercher" })).toBeInTheDocument();
  });

  it("redirige vers /doctors avec les paramètres de recherche saisis", async () => {
    render(<HomePage />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Spécialité"), "Cardiologie");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    expect(push).toHaveBeenCalledWith(expect.stringContaining("/doctors?"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("specialty=Cardiologie"));
  });

  it("redirige vers /doctors sans paramètre si la recherche est vide", async () => {
    render(<HomePage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Rechercher" }));
    expect(push).toHaveBeenCalledWith("/doctors");
  });
});
