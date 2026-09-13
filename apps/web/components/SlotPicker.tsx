import type { Slot } from "@/lib/types";
import { formatDateLabel, formatTimeLabel } from "@/lib/format";
import fr from "@/locales/fr";

type SlotPickerProps = {
  slots: Slot[];
  onSelect: (slot: Slot) => void;
  disabled?: boolean;
};

/**
 * N'affiche et ne transmet que des créneaux exactement tels que renvoyés
 * par l'API (`GET /api/doctors/:id/availability`). Aucun startAt/endAt
 * n'est jamais recalculé ou reconstruit côté client : `onSelect` reçoit
 * l'objet `slot` d'origine, inchangé.
 */
export function SlotPicker({ slots, onSelect, disabled }: SlotPickerProps) {
  if (slots.length === 0) {
    return <p className="text-sm text-slate-500">{fr.doctor.noSlots}</p>;
  }

  const byDate = new Map<string, Slot[]>();
  for (const slot of slots) {
    const label = formatDateLabel(slot.startAt);
    const existing = byDate.get(label) ?? [];
    existing.push(slot);
    byDate.set(label, existing);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(byDate.entries()).map(([dateLabel, daySlots]) => (
        <div key={dateLabel}>
          <p className="mb-2 text-sm font-medium capitalize text-slate-700">{dateLabel}</p>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(slot)}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {formatTimeLabel(slot.startAt)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
