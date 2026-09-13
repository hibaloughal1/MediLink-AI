import Link from "next/link";
import type { PublicDoctor } from "@/lib/types";

export function DoctorCard({ doctor }: { doctor: PublicDoctor }) {
  return (
    <Link
      href={`/doctors/${doctor.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <p className="text-base font-semibold text-slate-900">
        Dr {doctor.firstName} {doctor.lastName}
      </p>
      {doctor.specialties.length > 0 && (
        <p className="mt-1 text-sm text-blue-700">{doctor.specialties.map((s) => s.name).join(", ")}</p>
      )}
      {doctor.city && <p className="mt-1 text-sm text-slate-500">{doctor.city.name}</p>}
      {doctor.bio && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{doctor.bio}</p>}
    </Link>
  );
}
