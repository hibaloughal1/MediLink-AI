"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import type { AvailabilityType } from "@/lib/types";
import fr from "@/locales/fr";

export type RecurringFormValues = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  effectiveFrom: string;
  /** Chaîne vide = pas de date de fin (sera transmis comme `null`/omis par l'appelant). */
  effectiveTo: string;
};

export type OverrideFormValues = { specificDate: string };

export type AvailabilityRuleFormValues = RecurringFormValues | OverrideFormValues;

type AvailabilityRuleFormProps = {
  /** Fixe pour une édition (le type d'une règle existante n'est jamais
   * modifiable, cohérent avec le backend) ; choisi par le parent à la
   * création. */
  type: AvailabilityType;
  initial?: Partial<RecurringFormValues & OverrideFormValues>;
  onSubmit: (values: AvailabilityRuleFormValues) => Promise<void>;
  submitLabel: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AvailabilityRuleForm({ type, initial, onSubmit, submitLabel }: AvailabilityRuleFormProps) {
  const copy = fr.doctorDashboard.availability;

  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "12:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(initial?.slotDurationMinutes ?? 30);
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? todayIso());
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? "");
  const [specificDate, setSpecificDate] = useState(initial?.specificDate ?? todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (type === "RECURRING") {
        await onSubmit({ dayOfWeek, startTime, endTime, slotDurationMinutes, effectiveFrom, effectiveTo });
      } else {
        await onSubmit({ specificDate });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      {type === "RECURRING" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">{copy.dayOfWeek}</span>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {copy.days.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">{copy.startTime}</span>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">{copy.endTime}</span>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">{copy.slotDuration}</span>
            <input
              type="number"
              required
              min={5}
              max={240}
              value={slotDurationMinutes}
              onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">{copy.effectiveFrom}</span>
              <input
                type="date"
                required
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">{copy.effectiveTo}</span>
              <input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">{copy.specificDate}</span>
          <input
            type="date"
            required
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}

      {error && <StatusMessage type="error" message={error} />}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
