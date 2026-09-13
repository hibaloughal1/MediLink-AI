import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useRequireDoctor } from "@/lib/use-require-doctor";

const replace = vi.fn();
let mockStatus: "loading" | "authenticated" | "unauthenticated" = "loading";
let mockUser: { role: string } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/doctor/availability",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ status: mockStatus, user: mockUser }),
}));

function TestComponent() {
  useRequireDoctor();
  return null;
}

describe("useRequireDoctor", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirige vers /login si non authentifié", () => {
    mockStatus = "unauthenticated";
    mockUser = null;
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fdoctor%2Favailability");
  });

  it("redirige hors de la page si le compte n'est pas DOCTOR", () => {
    mockStatus = "authenticated";
    mockUser = { role: "PATIENT" };
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/?notDoctor=1");
  });

  it("ne redirige pas pour un médecin authentifié", () => {
    mockStatus = "authenticated";
    mockUser = { role: "DOCTOR" };
    render(<TestComponent />);
    expect(replace).not.toHaveBeenCalled();
  });
});
