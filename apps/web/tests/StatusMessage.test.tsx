import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusMessage } from "@/components/StatusMessage";

describe("StatusMessage", () => {
  it("affiche le message fourni", () => {
    render(<StatusMessage type="empty" message="Aucun résultat" />);
    expect(screen.getByText("Aucun résultat")).toBeInTheDocument();
  });

  it("utilise role=alert pour une erreur", () => {
    render(<StatusMessage type="error" message="Erreur serveur" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Erreur serveur");
  });
});
