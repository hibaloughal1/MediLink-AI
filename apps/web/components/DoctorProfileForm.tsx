"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import type { City, Specialty } from "@/lib/types";
import fr from "@/locales/fr";

export type DoctorProfileFormValues = {
  cityId: string;
  address: string;
  bio: string;
  professionalPhone: string;
  licenseNumber: string;
  specialtyIds: string[];
};

type DoctorProfileFormProps = {
  mode: "create" | "edit";
  initial?: Partial<DoctorProfileFormValues>;
  cities: City[];
  specialties: Specialty[];
  onSubmit: (values: DoctorProfileFormValues) => Promise<void>;
};

/**
 * Ne comporte AUCUN champ pour `verificationStatus`/`verifiedAt` : ces
 * champs sont structurellement absents des schémas backend pour cette
 * route et ne peuvent être modifiés que par un ADMIN via des routes
 * dédiées. Ce n'est pas une omission — c'est intentionnel.
 */
export function DoctorProfileForm({ mode, initial, cities, specialties, onSubmit }: DoctorProfileFormProps) {
  const [cityId, setCityId] = useState(initial?.cityId ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [professionalPhone, setProfessionalPhone] = useState(initial?.professionalPhone ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber ?? "");
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(initial?.specialtyIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSpecialty(id: string) {
    setSpecialtyIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (specialtyIds.length === 0) {
      setError(fr.doctorDashboard.profile.selectAtLeastOneSpecialty);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ cityId, address, bio, professionalPhone, licenseNumber, specialtyIds });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  const copy = fr.doctorDashboard.profile;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">{copy.cityLabel}</span>
        <select required value={cityId} onChange={(e) => setCityId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="" disabled>
            —
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">{copy.addressLabel}</span>
        <input
          required
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="text-slate-700">{copy.specialtiesLabel}</legend>
        <div className="flex flex-wrap gap-3">
          {specialties.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={specialtyIds.includes(s.id)} onChange={() => toggleSpecialty(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">{copy.phoneLabel}</span>
        <input
          type="tel"
          value={professionalPhone}
          onChange={(e) => setProfessionalPhone(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">{copy.licenseLabel}</span>
        <input
          type="text"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">{copy.bioLabel}</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>

      {error && <StatusMessage type="error" message={error} />}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mode === "create" ? copy.createSubmit : copy.save}
      </button>
    </form>
  );
}
