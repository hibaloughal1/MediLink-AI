import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvailabilityRuleList } from "@/components/AvailabilityRuleList";
import type { AvailabilityRule } from "@/lib/types";

function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule-1",
    doctorId: "doc-1",
    type: "RECURRING",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMinutes: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    specificDate: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AvailabilityRuleList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche un message vide quand il n'y a aucune règle", () => {
    render(<AvailabilityRuleList rules={[]} onToggleActive={vi.fn()} onEditRecurring={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Aucune disponibilité définie pour le moment.")).toBeInTheDocument();
  });

  it("affiche les règles RECURRING et DATE_OVERRIDE avec leurs détails", () => {
    const rules = [
      makeRule(),
      makeRule({ id: "rule-2", type: "DATE_OVERRIDE", dayOfWeek: null, startTime: null, endTime: null, slotDurationMinutes: null, effectiveFrom: null, specificDate: "2026-03-15" }),
    ];
    render(<AvailabilityRuleList rules={rules} onToggleActive={vi.fn()} onEditRecurring={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("Récurrente")).toBeInTheDocument();
    expect(screen.getByText("Blocage ponctuel")).toBeInTheDocument();
    expect(screen.getByText("2026-03-15")).toBeInTheDocument();
  });

  describe("suppression", () => {
    beforeEach(() => {
      vi.spyOn(window, "confirm");
    });

    it("demande confirmation et appelle onDelete si confirmé", async () => {
      vi.mocked(window.confirm).mockReturnValue(true);
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<AvailabilityRuleList rules={[makeRule()]} onToggleActive={vi.fn()} onEditRecurring={vi.fn()} onDelete={onDelete} />);

      await userEvent.setup().click(screen.getByRole("button", { name: "Supprimer" }));

      expect(window.confirm).toHaveBeenCalledWith("Confirmer la suppression de cette règle de disponibilité ?");
      expect(onDelete).toHaveBeenCalledWith("rule-1");
    });

    it("n'appelle pas onDelete si l'utilisateur annule la confirmation", async () => {
      vi.mocked(window.confirm).mockReturnValue(false);
      const onDelete = vi.fn();
      render(<AvailabilityRuleList rules={[makeRule()]} onToggleActive={vi.fn()} onEditRecurring={vi.fn()} onDelete={onDelete} />);

      await userEvent.setup().click(screen.getByRole("button", { name: "Supprimer" }));

      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
