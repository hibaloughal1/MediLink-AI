import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationStatusBanner } from "@/components/VerificationStatusBanner";
import fr from "@/locales/fr";
import type { VerificationStatus } from "@/lib/types";

describe("VerificationStatusBanner", () => {
  const statuses: VerificationStatus[] = ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"];

  it.each(statuses)("affiche le libellé et le message associés au statut %s", (status) => {
    render(<VerificationStatusBanner status={status} />);
    const copy = fr.doctorDashboard.status[status];
    expect(screen.getByRole("status")).toHaveTextContent(copy.label);
    expect(screen.getByRole("status")).toHaveTextContent(copy.message);
  });
});
