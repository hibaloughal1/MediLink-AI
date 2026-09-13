import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppointmentCard } from "@/components/AppointmentCard";
import type { PatientAppointment } from "@/lib/types";

function makeAppointment(overrides: Partial<PatientAppointment> = {}): PatientAppointment {
  return {
    id: "appt-1",
    startAt: new Date(Date.now() + 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000 + 1_800_000).toISOString(),
    status: "CONFIRMED",
    doctor: {
      id: "doc-1",
      firstName: "Youssef",
      lastName: "Bennani",
      address: null,
      city: { id: "c1", name: "Casablanca" },
      specialties: [{ id: "s1", name: "Cardiologie" }],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AppointmentCard", () => {
  it("affiche le bouton Annuler pour un rendez-vous CONFIRMED futur, et déclenche onCancel", async () => {
    const onCancel = vi.fn();
    render(<AppointmentCard appointment={makeAppointment()} onCancel={onCancel} />);

    const button = screen.getByRole("button", { name: "Annuler" });
    await userEvent.setup().click(button);
    expect(onCancel).toHaveBeenCalledWith("appt-1");
  });

  it("n'affiche pas le bouton Annuler pour un rendez-vous déjà annulé", () => {
    render(<AppointmentCard appointment={makeAppointment({ status: "CANCELLED" })} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Annuler" })).not.toBeInTheDocument();
  });

  it("n'affiche pas le bouton Annuler pour un rendez-vous déjà passé", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment({ startAt: new Date(Date.now() - 3_600_000).toISOString() })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Annuler" })).not.toBeInTheDocument();
  });
});
