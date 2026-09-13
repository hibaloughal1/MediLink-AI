import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { ApiError } from "@/lib/api-client";

const push = vi.fn();
const login = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ login }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    push.mockReset();
    login.mockReset();
  });

  it("connecte l'utilisateur et redirige en cas de succès", async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "patient@medilink.local");
    await user.type(screen.getByLabelText("Mot de passe"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("patient@medilink.local", "correct-horse-battery"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("affiche un message générique sur identifiants invalides (401)", async () => {
    login.mockRejectedValueOnce(new ApiError(401, "Identifiants invalides.", null));
    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "patient@medilink.local");
    await user.type(screen.getByLabelText("Mot de passe"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Identifiants invalides.");
    expect(push).not.toHaveBeenCalled();
  });
});
