"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { SearchForm, type SearchValues } from "@/components/SearchForm";
import { DoctorCard } from "@/components/DoctorCard";
import { StatusMessage } from "@/components/StatusMessage";
import type { PaginatedDoctors } from "@/lib/types";
import fr from "@/locales/fr";

function DoctorsSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const specialty = searchParams.get("specialty") ?? "";
  const city = searchParams.get("city") ?? "";
  const search = searchParams.get("search") ?? "";

  const [result, setResult] = useState<PaginatedDoctors | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (specialty) params.set("specialty", specialty);
    if (city) params.set("city", city);
    if (search) params.set("search", search);

    apiFetch<PaginatedDoctors>(`/api/doctors${params.toString() ? `?${params.toString()}` : ""}`)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : fr.common.genericError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [specialty, city, search]);

  function handleSearch(values: SearchValues) {
    const params = new URLSearchParams();
    if (values.specialty) params.set("specialty", values.specialty);
    if (values.city) params.set("city", values.city);
    if (values.search) params.set("search", values.search);
    router.push(`/doctors${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <SearchForm initial={{ specialty, city, search }} onSearch={handleSearch} />

      <h2 className="text-lg font-semibold text-slate-900">{fr.search.resultsTitle}</h2>

      {loading && <StatusMessage type="loading" message={fr.common.loading} />}
      {!loading && error && <StatusMessage type="error" message={error} />}
      {!loading && !error && result && result.doctors.length === 0 && (
        <StatusMessage type="empty" message={fr.search.noResults} />
      )}

      {!loading && !error && result && result.doctors.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {result.doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
      )}
    </main>
  );
}

export default function DoctorsSearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-8">{fr.common.loading}</main>}>
      <DoctorsSearchContent />
    </Suspense>
  );
}
