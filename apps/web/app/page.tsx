"use client";

import { useRouter } from "next/navigation";
import { SearchForm, type SearchValues } from "@/components/SearchForm";
import fr from "@/locales/fr";

export default function HomePage() {
  const router = useRouter();

  function handleSearch(values: SearchValues) {
    const params = new URLSearchParams();
    if (values.specialty) params.set("specialty", values.specialty);
    if (values.city) params.set("city", values.city);
    if (values.search) params.set("search", values.search);
    router.push(`/doctors${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">{fr.home.title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">{fr.home.subtitle}</p>
      </div>

      <SearchForm onSearch={handleSearch} />
    </main>
  );
}
