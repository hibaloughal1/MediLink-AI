"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireDoctor } from "@/lib/use-require-doctor";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useFilters } from "@/lib/use-filters";
import { DoctorProfileForm, type DoctorProfileFormValues } from "@/components/DoctorProfileForm";
import { VerificationStatusBanner } from "@/components/VerificationStatusBanner";
import { StatusMessage } from "@/components/StatusMessage";
import type { DetailedDoctor } from "@/lib/types";
import fr from "@/locales/fr";

// `verificationStatus`/`verifiedAt` ne sont JAMAIS envoyés dans ce payload :
// ils sont absents du type `DoctorProfileFormValues` et ne peuvent donc pas
// l'être accidentellement.
function toPayload(values: DoctorProfileFormValues) {
  return {
    cityId: values.cityId,
    address: values.address,
    specialtyIds: values.specialtyIds,
    bio: values.bio || undefined,
    professionalPhone: values.professionalPhone || undefined,
    licenseNumber: values.licenseNumber || undefined,
  };
}

export default function DoctorProfilePage() {
  const { isReady } = useRequireDoctor();
  const { specialties, cities } = useFilters();

  const [doctor, setDoctor] = useState<DetailedDoctor | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function handleCreate(values: DoctorProfileFormValues) {
    const { doctor: created } = await apiFetch<{ doctor: DetailedDoctor }>("/api/doctors", {
      method: "POST",
      body: JSON.stringify(toPayload(values)),
    });
    // Le formulaire de création est démonté dès que `notFound` repasse à
    // false (bascule vers le formulaire d'édition) : le message de succès
    // doit donc vivre au niveau de la page, pas dans l'état interne du
    // formulaire, sous peine de ne jamais être visible à l'écran.
    setDoctor(created);
    setNotFound(false);
    setNotice(fr.doctorDashboard.profile.createSuccess);
  }

  async function handleUpdate(values: DoctorProfileFormValues) {
    const { doctor: updated } = await apiFetch<{ doctor: DetailedDoctor }>("/api/doctors/me", {
      method: "PATCH",
      body: JSON.stringify(toPayload(values)),
    });
    setDoctor(updated);
    setNotice(fr.doctorDashboard.profile.saveSuccess);
  }

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.doctorDashboard.profile;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{notFound ? copy.createTitle : copy.editTitle}</h1>

      {doctor && <VerificationStatusBanner status={doctor.verificationStatus} />}
      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}

      {notFound && <DoctorProfileForm mode="create" cities={cities} specialties={specialties} onSubmit={handleCreate} />}

      {doctor && (
        <DoctorProfileForm
          mode="edit"
          cities={cities}
          specialties={specialties}
          initial={{
            cityId: doctor.city?.id ?? "",
            address: doctor.address ?? "",
            bio: doctor.bio ?? "",
            professionalPhone: doctor.professionalPhone ?? "",
            licenseNumber: doctor.licenseNumber ?? "",
            specialtyIds: doctor.specialties.map((s) => s.id),
          }}
          onSubmit={handleUpdate}
        />
      )}
    </main>
  );
}
