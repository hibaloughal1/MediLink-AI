import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { localToUtc, utcToCalendarDate, CLINIC_TIME_ZONE } from "../src/lib/timezone";

/**
 * Trouve dynamiquement, à partir d'une date donnée, la prochaine date où le
 * décalage UTC d'Africa/Casablanca change (transition Ramadan <-> hors
 * Ramadan) — jamais une date en dur : le Ramadan avance chaque année dans
 * le calendrier grégorien, une date fixée aujourd'hui deviendrait fausse
 * dans le futur. Le test reste ainsi valide indéfiniment et vérifie le
 * comportement RÉEL de la base tzdata du système, pas une hypothèse.
 */
function findNextOffsetTransition(fromIso: string, maxDays = 400): { date: string; before: string; after: string } {
  let previousOffset = formatInTimeZone(`${fromIso}T12:00:00Z`, CLINIC_TIME_ZONE, "XXX");
  let cursor = new Date(`${fromIso}T00:00:00Z`);

  for (let i = 0; i < maxDays; i += 1) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const iso = cursor.toISOString().slice(0, 10);
    const offset = formatInTimeZone(`${iso}T12:00:00Z`, CLINIC_TIME_ZONE, "XXX");
    if (offset !== previousOffset) {
      return { date: iso, before: previousOffset, after: offset };
    }
    previousOffset = offset;
  }

  throw new Error(`Aucune transition de décalage UTC trouvée pour ${CLINIC_TIME_ZONE} dans les ${maxDays} jours suivant ${fromIso}.`);
}

describe("Timezone (Africa/Casablanca) — piège Ramadan", () => {
  const today = new Date().toISOString().slice(0, 10);
  const transition = findNextOffsetTransition(today);

  // Une date confortablement à l'intérieur de chaque côté de la transition
  // (pas immédiatement adjacente, pour ne jamais dépendre d'un éventuel
  // jour de battement autour du changement lui-même).
  const dateBeforeTransition = new Date(new Date(`${transition.date}T00:00:00Z`).getTime() - 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dateAfterTransition = new Date(new Date(`${transition.date}T00:00:00Z`).getTime() + 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  it("une transition de décalage UTC existe bien dans l'année à venir (confirme que le test porte sur un vrai piège, pas une hypothèse)", () => {
    expect(["Z", "+00:00", "+01:00"]).toContain(transition.before);
    expect(["Z", "+00:00", "+01:00"]).toContain(transition.after);
    expect(transition.before).not.toBe(transition.after);
  });

  it(`convertit 09:00 heure locale en UTC correctement avant la transition (${transition.before})`, () => {
    const expectedOffsetHours = transition.before === "+01:00" ? 1 : 0;
    const result = localToUtc(dateBeforeTransition, "09:00");
    expect(result.toISOString()).toBe(`${dateBeforeTransition}T${String(9 - expectedOffsetHours).padStart(2, "0")}:00:00.000Z`);
  });

  it(`convertit 09:00 heure locale en UTC correctement après la transition (${transition.after})`, () => {
    const expectedOffsetHours = transition.after === "+01:00" ? 1 : 0;
    const result = localToUtc(dateAfterTransition, "09:00");
    expect(result.toISOString()).toBe(`${dateAfterTransition}T${String(9 - expectedOffsetHours).padStart(2, "0")}:00:00.000Z`);
  });

  it("utcToCalendarDate reste cohérent avec localToUtc de part et d'autre de la transition (jamais d'accesseur Date brut dépendant du fuseau système)", () => {
    const beforeUtc = localToUtc(dateBeforeTransition, "23:30");
    expect(utcToCalendarDate(beforeUtc)).toBe(dateBeforeTransition);

    const afterUtc = localToUtc(dateAfterTransition, "23:30");
    expect(utcToCalendarDate(afterUtc)).toBe(dateAfterTransition);
  });

  it("un horaire proche de minuit ne bascule pas sur le mauvais jour calendaire, des deux côtés de la transition", () => {
    // 23:45 heure locale Maroc, converti en UTC puis reconverti : doit
    // retomber exactement sur la même date calendaire locale, quel que
    // soit le décalage en vigueur ce jour-là (+00:00 ou +01:00).
    for (const date of [dateBeforeTransition, dateAfterTransition]) {
      const utcInstant = localToUtc(date, "23:45");
      expect(utcToCalendarDate(utcInstant)).toBe(date);
    }
  });
});
