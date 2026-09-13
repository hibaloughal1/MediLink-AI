import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DoctorCard } from "@/components/DoctorCard";
import type { PublicDoctor } from "@/lib/types";

const doctor: PublicDoctor = {
  id: "doc-1",
  firstName: "Youssef",
  lastName: "Bennani",
  bio: "Cardiologue expérimenté.",
  city: { id: "c1", name: "Casablanca" },
  address: "12 rue de la Santé",
  specialties: [{ id: "s1", name: "Cardiologie" }],
  createdAt: new Date().toISOString(),
};

describe("DoctorCard", () => {
  it("affiche le nom, la spécialité et la ville, avec un lien vers la fiche", () => {
    render(<DoctorCard doctor={doctor} />);
    expect(screen.getByText("Dr Youssef Bennani")).toBeInTheDocument();
    expect(screen.getByText("Cardiologie")).toBeInTheDocument();
    expect(screen.getByText("Casablanca")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/doctors/doc-1");
  });
});
