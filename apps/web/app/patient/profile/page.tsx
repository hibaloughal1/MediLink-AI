"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/context/auth-context";
import { useRequirePatient } from "@/lib/use-require-patient";
import { apiFetch, ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import type { AuthUser } from "@/lib/types";
import fr from "@/locales/fr";

export default function MyProfilePage() {
  const { isReady, user } = useRequirePatient();
  const { refreshProfile } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setPhone(user.phone ?? "");
    }
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch<{ user: AuthUser }>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName, phone: phone || null }),
      });
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isReady || !user) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{fr.profile.title}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">{fr.profile.email}</span>
          <input type="email" disabled value={user.email} className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">{fr.profile.firstName}</span>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">{fr.profile.lastName}</span>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">{fr.profile.phone}</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error && <StatusMessage type="error" message={error} />}
        {success && <StatusMessage type="success" message={fr.profile.saveSuccess} />}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {fr.profile.save}
        </button>
      </form>
    </main>
  );
}
