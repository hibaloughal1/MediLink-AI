"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";
import type { City, Specialty } from "./types";

/** Charge les listes de spécialités/villes pour les filtres de recherche. */
export function useFilters() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([apiFetch<{ specialties: Specialty[] }>("/api/specialties"), apiFetch<{ cities: City[] }>("/api/cities")])
      .then(([specialtiesRes, citiesRes]) => {
        if (cancelled) return;
        setSpecialties(specialtiesRes.specialties);
        setCities(citiesRes.cities);
      })
      .catch(() => {
        // Filtres non bloquants : en cas d'échec, le formulaire reste
        // utilisable (recherche libre par ville/nom en texte simple).
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { specialties, cities, loading };
}
