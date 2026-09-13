"use client";

import { useState, type FormEvent } from "react";
import { useFilters } from "@/lib/use-filters";
import fr from "@/locales/fr";

export type SearchValues = { specialty: string; city: string; search: string };

type SearchFormProps = {
  initial?: Partial<SearchValues>;
  onSearch: (values: SearchValues) => void;
};

export function SearchForm({ initial, onSearch }: SearchFormProps) {
  const { specialties, cities } = useFilters();
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [search, setSearch] = useState(initial?.search ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch({ specialty, city, search });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-slate-700">{fr.search.specialtyLabel}</span>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{fr.search.specialtyAll}</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-slate-700">{fr.search.cityLabel}</span>
        <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">{fr.search.cityAll}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-slate-700">{fr.search.queryLabel}</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={fr.search.queryPlaceholder}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <button type="submit" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
        {fr.search.submit}
      </button>
    </form>
  );
}
