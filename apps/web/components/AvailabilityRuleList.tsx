"use client";

import { useState } from "react";
import { AvailabilityRuleForm, type RecurringFormValues } from "@/components/AvailabilityRuleForm";
import { StatusMessage } from "@/components/StatusMessage";
import type { AvailabilityRule } from "@/lib/types";
import fr from "@/locales/fr";

type AvailabilityRuleListProps = {
  rules: AvailabilityRule[];
  onToggleActive: (id: string, isActive: boolean) => Promise<void>;
  onEditRecurring: (id: string, values: RecurringFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function AvailabilityRuleList({ rules, onToggleActive, onEditRecurring, onDelete }: AvailabilityRuleListProps) {
  const copy = fr.doctorDashboard.availability;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (rules.length === 0) {
    return <StatusMessage type="empty" message={copy.empty} />;
  }

  async function handleDelete(id: string) {
    if (!window.confirm(copy.deleteConfirm)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {rules.map((rule) => (
        <li key={rule.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              <span className="mr-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {rule.type === "RECURRING" ? copy.typeRecurring : copy.typeOverride}
              </span>
              {rule.type === "RECURRING" ? (
                <span>
                  {copy.days[rule.dayOfWeek ?? 0]} {rule.startTime}–{rule.endTime} ({rule.slotDurationMinutes} min)
                  {" · "}
                  {copy.effectiveFrom.toLowerCase()} {rule.effectiveFrom}
                  {rule.effectiveTo ? ` — ${copy.effectiveTo.toLowerCase()} ${rule.effectiveTo}` : ""}
                </span>
              ) : (
                <span>{rule.specificDate}</span>
              )}
              {!rule.isActive && <span className="ml-2 text-xs text-slate-400">({copy.inactive})</span>}
            </div>

            <div className="flex shrink-0 gap-3">
              {rule.type === "RECURRING" && (
                <button type="button" onClick={() => setEditingId(editingId === rule.id ? null : rule.id)} className="text-sm text-blue-700 hover:underline">
                  {copy.editAction}
                </button>
              )}
              <button type="button" onClick={() => onToggleActive(rule.id, !rule.isActive)} className="text-sm text-slate-600 hover:underline">
                {rule.isActive ? copy.toggleInactive : copy.toggleActive}
              </button>
              <button
                type="button"
                disabled={deletingId === rule.id}
                onClick={() => handleDelete(rule.id)}
                className="text-sm text-red-700 hover:underline disabled:opacity-50"
              >
                {copy.deleteAction}
              </button>
            </div>
          </div>

          {editingId === rule.id && rule.type === "RECURRING" && (
            <div className="mt-3">
              <AvailabilityRuleForm
                type="RECURRING"
                initial={{
                  dayOfWeek: rule.dayOfWeek ?? 0,
                  startTime: rule.startTime ?? "09:00",
                  endTime: rule.endTime ?? "10:00",
                  slotDurationMinutes: rule.slotDurationMinutes ?? 30,
                  effectiveFrom: rule.effectiveFrom ?? "",
                  effectiveTo: rule.effectiveTo ?? "",
                }}
                submitLabel={fr.doctorDashboard.profile.save}
                onSubmit={async (values) => {
                  await onEditRecurring(rule.id, values as RecurringFormValues);
                  setEditingId(null);
                }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
