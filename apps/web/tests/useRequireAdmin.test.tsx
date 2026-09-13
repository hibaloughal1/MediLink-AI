import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useRequireAdmin } from "@/lib/use-require-admin";

const replace = vi.fn();
let mockStatus: "loading" | "authenticated" | "unauthenticated" = "loading";
let mockUser: { role: string } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin/users",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ status: mockStatus, user: mockUser }),
}));

function TestComponent() {
  useRequireAdmin();
  return null;
}

describe("useRequireAdmin", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirige vers /login si non authentifié", () => {
    mockStatus = "unauthenticated";
    mockUser = null;
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fusers");
  });

  it("redirige hors de la page si le compte n'est pas ADMIN", () => {
    mockStatus = "authenticated";
    mockUser = { role: "DOCTOR" };
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/?notAdmin=1");
  });

  it("ne redirige pas pour un admin authentifié", () => {
    mockStatus = "authenticated";
    mockUser = { role: "ADMIN" };
    render(<TestComponent />);
    expect(replace).not.toHaveBeenCalled();
  });
});
