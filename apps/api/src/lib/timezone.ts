import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Fuseau de référence pour toute la logique de disponibilité/rendez-vous.
 * Le Maroc applique en permanence UTC+1 (WEST) SAUF pendant le Ramadan, où
 * il repasse temporairement à UTC+0 (décision gouvernementale, encodée
 * dans la base IANA tzdata). Ne jamais coder un offset en dur (+01:00 ou
 * +00:00) : passer systématiquement par ce fuseau nommé et par une
 * bibliothèque timezone-aware (date-fns-tz), qui résout le bon offset pour
 * chaque date via tzdata.
 */
export const CLINIC_TIME_ZONE = "Africa/Casablanca";

/** "YYYY-MM-DD" */
export type CalendarDate = string;

/** "HH:mm" (24h) */
export type ClockTime = string;

/**
 * Jour de la semaine (0 = dimanche .. 6 = samedi) d'une date calendaire.
 * Calcul purement calendaire (indépendant du fuseau horaire, ne nécessite
 * pas de conversion timezone-aware).
 */
export function dayOfWeekOf(date: CalendarDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Combine une date calendaire et une heure d'horloge murale (toutes deux
 * exprimées en heure locale Africa/Casablanca) en un instant UTC concret.
 * C'est le seul point de conversion heure-locale -> UTC de tout le module
 * Availability.
 */
export function localToUtc(date: CalendarDate, time: ClockTime): Date {
  return fromZonedTime(`${date}T${time}:00`, CLINIC_TIME_ZONE);
}

/**
 * Date calendaire (heure locale Africa/Casablanca) contenant un instant
 * UTC donné. Utilise `formatInTimeZone`, qui ne dépend jamais du fuseau
 * horaire du système d'exécution — contrairement aux accesseurs bruts
 * d'un objet Date, dont le comportement varie selon `TZ` (piège vérifié :
 * la machine de développement locale a elle-même `Africa/Casablanca`
 * comme fuseau système, ce qui masquerait silencieusement un bug de ce
 * type dans un environnement où le serveur tourne, lui, en UTC).
 */
export function utcToCalendarDate(instant: Date): CalendarDate {
  return formatInTimeZone(instant, CLINIC_TIME_ZONE, "yyyy-MM-dd");
}

/** Ajoute `days` jours à une date calendaire "YYYY-MM-DD" (arithmétique calendaire pure). */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/** Nombre de jours (inclusif) entre deux dates calendaires "YYYY-MM-DD". */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)) + 1;
}

/** Convertit "HH:mm" en minutes depuis minuit, pour comparer/additionner des heures d'horloge. */
export function clockTimeToMinutes(time: ClockTime): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToClockTime(totalMinutes: number): ClockTime {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
