"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireDoctor } from "@/lib/use-require-doctor";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  AvailabilityRuleForm,
  type RecurringFormValues,
  type OverrideFormValues,
} from "@/components/AvailabilityRuleForm";
import { AvailabilityRuleList } from "@/components/AvailabilityRuleList";
import { StatusMessage } from "@/components/StatusMessage";
import type { AvailabilityRule, AvailabilityType } from "@/lib/types";
import fr from "@/locales/fr";

export default function DoctorAvailabilityPage() {
  const { isReady } = useRequireDoctor();

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<AvailabilityType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { availability } = await apiFetch<{ availability: AvailabilityRule[] }>("/api/doctors/me/availability");
      setRules(availability);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  async function handleCreate(type: AvailabilityType, values: RecurringFormValues | OverrideFormValues) {
    setError(null);
    setNotice(null);
    const payload =
      type === "RECURRING"
        ? {
            type,
            dayOfWeek: (values as RecurringFormValues).dayOfWeek,
            startTime: (values as RecurringFormValues).startTime,
            endTime: (values as RecurringFormValues).endTime,
            slotDurationMinutes: (values as RecurringFormValues).slotDurationMinutes,
            effectiveFrom: (values as RecurringFormValues).effectiveFrom,
            effectiveTo: (values as RecurringFormValues).effectiveTo || undefined,
          }
        : { type, specificDate: (values as OverrideFormValues).specificDate };

    await apiFetch<{ availability: AvailabilityRule }>("/api/doctors/me/availability", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setCreatingType(null);
    setNotice(fr.doctorDashboard.availability.createSuccess);
    await load();
  }

  async function handleEditRecurring(id: string, values: RecurringFormValues) {
    await apiFetch<{ availability: AvailabilityRule }>(`/api/doctors/me/availability/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        dayOfWeek: values.dayOfWeek,
        startTime: values.startTime,
        endTime: values.endTime,
        slotDurationMinutes: values.slotDurationMinutes,
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo || undefined,
      }),
    });
    setNotice(fr.doctorDashboard.availability.updateSuccess);
    await load();
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch<{ availability: AvailabilityRule }>(`/api/doctors/me/availability/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      setNotice(fr.doctorDashboard.availability.updateSuccess);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch<void>(`/api/doctors/me/availability/${id}`, { method: "DELETE" });
      setNotice(fr.doctorDashboard.availability.deleteSuccess);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    }
  }

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.doctorDashboard.availability;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>

      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setCreatingType(creatingType === "RECURRING" ? null : "RECURRING")}
          className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          {copy.addRecurring}
        </button>
        <button
          type="button"
          onClick={() => setCreatingType(creatingType === "DATE_OVERRIDE" ? null : "DATE_OVERRIDE")}
          className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          {copy.addOverride}
        </button>
      </div>

      {creatingType && (
        <AvailabilityRuleForm
          type={creatingType}
          submitLabel={copy.createAction}
          onSubmit={(values) => handleCreate(creatingType, values)}
        />
      )}

      <AvailabilityRuleList
        rules={rules}
        onToggleActive={handleToggleActive}
        onEditRecurring={handleEditRecurring}
        onDelete={handleDelete}
      />
    </main>
  );
}
