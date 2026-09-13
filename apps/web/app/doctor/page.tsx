"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRequireDoctor } from "@/lib/use-require-doctor";
import { apiFetch, ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import { VerificationStatusBanner } from "@/components/VerificationStatusBanner";
import type { DetailedDoctor } from "@/lib/types";
import fr from "@/locales/fr";

export default function DoctorOverviewPage() {
  const { isReady } = useRequireDoctor();

  const [doctor, setDoctor] = useState<DetailedDoctor | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const { doctor: me } = await apiFetch<{ doctor: DetailedDoctor }>("/api/doctors/me");
      setDoctor(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : fr.common.genericError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.doctorDashboard;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.dashboardTitle}</h1>

      {error && <StatusMessage type="error" message={error} />}

      {notFound ? (
        <>
          <StatusMessage type="empty" message={copy.profile.notCreatedYet} />
          <Link href="/doctor/profile" className="self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            {copy.profile.createTitle}
          </Link>
        </>
      ) : (
        doctor && <VerificationStatusBanner status={doctor.verificationStatus} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/doctor/profile" className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300">
          {copy.nav.profile}
        </Link>
        <Link
          href="/doctor/availability"
          className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300"
        >
          {copy.nav.availability}
        </Link>
        <Link
          href="/doctor/appointments"
          className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300"
        >
          {copy.nav.appointments}
        </Link>
      </div>
    </main>
  );
}
