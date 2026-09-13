import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useRequirePatient } from "@/lib/use-require-patient";

const replace = vi.fn();
let mockStatus: "loading" | "authenticated" | "unauthenticated" = "loading";
let mockUser: { role: string } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/patient/appointments",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ status: mockStatus, user: mockUser }),
}));

function TestComponent() {
  useRequirePatient();
  return null;
}

describe("useRequirePatient", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirige vers /login si non authentifié", () => {
    mockStatus = "unauthenticated";
    mockUser = null;
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fpatient%2Fappointments");
  });

  it("redirige hors de la page si le compte n'est pas PATIENT", () => {
    mockStatus = "authenticated";
    mockUser = { role: "DOCTOR" };
    render(<TestComponent />);
    expect(replace).toHaveBeenCalledWith("/?notPatient=1");
  });

  it("ne redirige pas pour un patient authentifié", () => {
    mockStatus = "authenticated";
    mockUser = { role: "PATIENT" };
    render(<TestComponent />);
    expect(replace).not.toHaveBeenCalled();
  });
});
