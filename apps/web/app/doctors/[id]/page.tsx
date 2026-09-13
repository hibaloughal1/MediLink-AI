"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { SlotPicker } from "@/components/SlotPicker";
import { StatusMessage } from "@/components/StatusMessage";
import { addDaysIsoDate, todayIsoDate } from "@/lib/format";
import type { AvailabilityResponse, PublicDoctor, Slot } from "@/lib/types";
import fr from "@/locales/fr";

const AVAILABILITY_RANGE_DAYS = 14;

export default function DoctorProfilePage() {
  const params = useParams<{ id: string }>();
  const doctorId = params.id;
  const router = useRouter();
  const { user, status: authStatus } = useAuth();

  const [doctor, setDoctor] = useState<PublicDoctor | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadAvailability = useCallback(async () => {
    const from = todayIsoDate();
    const to = addDaysIsoDate(from, AVAILABILITY_RANGE_DAYS);
    const availability = await apiFetch<AvailabilityResponse>(`/api/doctors/${doctorId}/availability?from=${from}&to=${to}`);
    setSlots(availability.slots);
  }, [doctorId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([apiFetch<{ doctor: PublicDoctor }>(`/api/doctors/${doctorId}`), loadAvailability()])
      .then(([doctorRes]) => {
        if (cancelled) return;
        setDoctor(doctorRes.doctor);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError(fr.doctor.notFound);
        } else {
          setError(err instanceof ApiError ? err.message : fr.common.genericError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doctorId, loadAvailability]);

  async function handleSelectSlot(slot: Slot) {
    if (authStatus === "unauthenticated") {
      router.push(`/login?next=${encodeURIComponent(`/doctors/${doctorId}`)}`);
      return;
    }
    if (user && user.role !== "PATIENT") {
      setBookingMessage({ type: "error", text: fr.doctor.bookNotPatient });
      return;
    }

    setBooking(true);
    setBookingMessage(null);
    try {
      // Le couple {startAt, endAt} est transmis EXACTEMENT tel que reçu de
      // l'API (aucun recalcul côté client) — voir SlotPicker.
      await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify({ doctorId, startAt: slot.startAt, endAt: slot.endAt }),
      });
      setBookingMessage({ type: "success", text: fr.doctor.bookSuccess });
      await loadAvailability();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBookingMessage({ type: "error", text: fr.doctor.slotTaken });
        await loadAvailability();
      } else {
        setBookingMessage({ type: "error", text: err instanceof ApiError ? err.message : fr.common.genericError });
      }
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  if (error || !doctor) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <StatusMessage type="error" message={error ?? fr.doctor.notFound} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Dr {doctor.firstName} {doctor.lastName}
        </h1>
        {doctor.specialties.length > 0 && (
          <p className="mt-1 text-blue-700">{doctor.specialties.map((s) => s.name).join(", ")}</p>
        )}
        {doctor.city && <p className="mt-1 text-slate-500">{doctor.city.name}</p>}
        {doctor.address && <p className="text-sm text-slate-500">{doctor.address}</p>}
        {doctor.bio && <p className="mt-3 text-sm text-slate-700">{doctor.bio}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{fr.doctor.availabilityTitle}</h2>

        {authStatus === "unauthenticated" && <p className="mb-3 text-sm text-slate-500">{fr.doctor.bookLoginPrompt}</p>}

        {bookingMessage && <div className="mb-3"><StatusMessage type={bookingMessage.type} message={bookingMessage.text} /></div>}

        <SlotPicker slots={slots} onSelect={handleSelectSlot} disabled={booking} />
      </div>
    </main>
  );
}
