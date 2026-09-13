import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "@/app/register/page";
import { ApiError } from "@/lib/api-client";

const push = vi.fn();
const register = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ register }),
}));

describe("RegisterPage", () => {
  beforeEach(() => {
    push.mockReset();
    register.mockReset();
  });

  it("inscrit le patient et redirige vers l'accueil en cas de succès", async () => {
    register.mockResolvedValueOnce(undefined);
    render(<RegisterPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Prénom"), "Fatima");
    await user.type(screen.getByLabelText("Nom", { exact: true }), "Alaoui");
    await user.type(screen.getByLabelText("E-mail"), "fatima@medilink.local");
    await user.type(screen.getByLabelText("Mot de passe", { exact: true }), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        firstName: "Fatima",
        lastName: "Alaoui",
        email: "fatima@medilink.local",
        password: "correct-horse-battery",
        phone: undefined,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("affiche une erreur API en cas d'échec (ex. email déjà utilisé)", async () => {
    register.mockRejectedValueOnce(new ApiError(409, "Cette adresse e-mail est déjà utilisée.", null));
    render(<RegisterPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Prénom"), "Fatima");
    await user.type(screen.getByLabelText("Nom", { exact: true }), "Alaoui");
    await user.type(screen.getByLabelText("E-mail"), "fatima@medilink.local");
    await user.type(screen.getByLabelText("Mot de passe", { exact: true }), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText("Cette adresse e-mail est déjà utilisée.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
