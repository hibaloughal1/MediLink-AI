import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorProfilePage from "@/app/doctors/[id]/page";
import { ApiError } from "@/lib/api-client";
import { formatTimeLabel } from "@/lib/format";
import type { AvailabilityResponse, PublicDoctor } from "@/lib/types";

const push = vi.fn();
const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "doc-1" }),
  useRouter: () => ({ push }),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "patient-1", role: "PATIENT" }, status: "authenticated" }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const doctor: PublicDoctor = {
  id: "doc-1",
  firstName: "Youssef",
  lastName: "Bennani",
  bio: null,
  city: { id: "c1", name: "Casablanca" },
  address: null,
  specialties: [{ id: "s1", name: "Cardiologie" }],
  createdAt: new Date().toISOString(),
};

const oneSlot: AvailabilityResponse = {
  doctorId: "doc-1",
  from: "2026-01-01",
  to: "2026-01-14",
  slots: [{ startAt: "2026-01-05T09:00:00.000Z", endAt: "2026-01-05T09:30:00.000Z" }],
};

const noSlots: AvailabilityResponse = { ...oneSlot, slots: [] };

describe("DoctorProfilePage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    push.mockReset();
  });

  it("affiche un message quand aucun créneau n'est disponible", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/availability")) return Promise.resolve(noSlots);
      return Promise.resolve({ doctor });
    });

    render(<DoctorProfilePage />);

    expect(await screen.findByText(/Dr Youssef Bennani/)).toBeInTheDocument();
    expect(screen.getByText("Aucun créneau disponible pour le moment sur cette période.")).toBeInTheDocument();
  });

  it("gère le 409 (créneau déjà pris) en réactualisant les disponibilités", async () => {
    let availabilityCallCount = 0;
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/appointments") {
        return Promise.reject(new ApiError(409, "Ce créneau vient d'être réservé, veuillez en choisir un autre.", null));
      }
      if (path.includes("/availability")) {
        availabilityCallCount += 1;
        // Le 2e appel (après le 409) simule un planning déjà actualisé (créneau disparu).
        return Promise.resolve(availabilityCallCount === 1 ? oneSlot : noSlots);
      }
      return Promise.resolve({ doctor });
    });

    render(<DoctorProfilePage />);

    // Le libellé affiché dépend du fuseau d'exécution (conversion locale de
    // l'UTC renvoyé par l'API) : on le calcule avec la même fonction que le
    // composant plutôt que de supposer un fuseau particulier.
    const expectedLabel = formatTimeLabel(oneSlot.slots[0].startAt);
    const slotButton = await screen.findByRole("button", { name: expectedLabel });
    await userEvent.setup().click(slotButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce créneau vient d'être réservé par un autre patient. Les disponibilités ont été actualisées.",
    );

    // Les disponibilités ont bien été rechargées après le 409 (2 appels : initial + après échec).
    await waitFor(() => expect(availabilityCallCount).toBe(2));
    expect(screen.getByText("Aucun créneau disponible pour le moment sur cette période.")).toBeInTheDocument();
  });
});
