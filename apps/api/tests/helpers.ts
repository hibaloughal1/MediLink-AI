import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { hashPassword } from "../src/modules/auth/password";
import { addCalendarDays } from "../src/lib/timezone";
import { TEST_CITY_NAME_PREFIXES, TEST_EMAIL_DOMAIN, TEST_SPECIALTY_NAME_PREFIXES } from "./test-data-cleanup.js";

// Réexportés pour que les fichiers de test qui les utilisent (ex.
// `tests/doctors.test.ts`) puissent tout importer depuis `./helpers`
// comme avant — la logique elle-même vit dans `test-data-cleanup.ts`
// (dépourvu de tout import "vitest") pour rester utilisable depuis
// `tests/global-teardown.ts`, un contexte Vitest "globalSetup" où l'API de
// test n'est pas disponible.
export { cleanupTestData, TEST_CITY_NAME_PREFIXES, TEST_SPECIALTY_NAME_PREFIXES } from "./test-data-cleanup.js";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
}

export async function registerAndLogin(
  app: FastifyInstance,
  overrides: Partial<{ email: string; password: string; role: "PATIENT" | "DOCTOR" }> = {},
) {
  const email = overrides.email ?? uniqueEmail("user");
  const password = overrides.password ?? "correct-horse-battery";
  const role = overrides.role ?? "PATIENT";

  const registerRes = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password, firstName: "Test", lastName: "User", role },
  });
  expect(registerRes.statusCode).toBe(201);

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  expect(loginRes.statusCode).toBe(200);

  const body = loginRes.json() as { accessToken: string; user: { id: string; role: string } };
  const refreshCookie = loginRes.cookies.find((c) => c.name === "medilink_refresh")?.value;

  return { email, password, accessToken: body.accessToken, user: body.user, refreshCookie };
}

export async function createAdmin(app: FastifyInstance) {
  const email = uniqueEmail("admin");
  const password = "admin-super-secret";
  await app.prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Admin",
      lastName: "Root",
      role: "ADMIN",
    },
  });

  const loginRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expect(loginRes.statusCode).toBe(200);
  const body = loginRes.json() as { accessToken: string; user: { id: string } };
  return { email, password, accessToken: body.accessToken, user: body.user };
}

export async function createCityAndSpecialty(app: FastifyInstance) {
  const city = await app.prisma.city.create({ data: { name: `${TEST_CITY_NAME_PREFIXES[0]}${randomUUID()}` } });
  const specialty = await app.prisma.specialty.create({ data: { name: `${TEST_SPECIALTY_NAME_PREFIXES[0]}${randomUUID()}` } });
  return { city, specialty };
}

/** Enregistre un DOCTOR, crée son profil professionnel, et (optionnellement) fait transitionner son statut via un ADMIN. */
export async function createDoctorProfile(
  app: FastifyInstance,
  options: { verify?: boolean; status?: "VERIFIED" | "REJECTED" | "SUSPENDED" } = {},
) {
  const { city, specialty } = await createCityAndSpecialty(app);
  const doctorAuth = await registerAndLogin(app, { role: "DOCTOR" });

  const createRes = await app.inject({
    method: "POST",
    url: "/api/doctors",
    headers: { authorization: `Bearer ${doctorAuth.accessToken}` },
    payload: { cityId: city.id, address: "12 rue de la Santé", specialtyIds: [specialty.id] },
  });
  expect(createRes.statusCode).toBe(201);
  const doctorId = createRes.json().doctor.id as string;

  if (options.verify || options.status) {
    const admin = await createAdmin(app);
    const action = options.status === "REJECTED" ? "reject" : options.status === "SUSPENDED" ? "suspend" : "verify";
    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/doctors/${doctorId}/${action}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  }

  return { ...doctorAuth, doctorId, city, specialty };
}

/** Prochain jour de semaine (0=dimanche..6=samedi) à partir d'aujourd'hui, en excluant aujourd'hui même. */
export function nextDateForDayOfWeek(dayOfWeek: number): string {
  const today = new Date().toISOString().slice(0, 10);
  let date = addCalendarDays(today, 1);
  while (new Date(`${date}T00:00:00.000Z`).getUTCDay() !== dayOfWeek) {
    date = addCalendarDays(date, 1);
  }
  return date;
}

/** Médecin VERIFIED avec une disponibilité récurrente prête à être réservée. */
export async function createVerifiedDoctorWithAvailability(
  app: FastifyInstance,
  overrides: Partial<{ dayOfWeek: number; startTime: string; endTime: string; slotDurationMinutes: number }> = {},
) {
  const doctor = await createDoctorProfile(app, { verify: true });
  const dayOfWeek = overrides.dayOfWeek ?? 1;

  const res = await app.inject({
    method: "POST",
    url: "/api/doctors/me/availability",
    headers: { authorization: `Bearer ${doctor.accessToken}` },
    payload: {
      type: "RECURRING",
      dayOfWeek,
      startTime: overrides.startTime ?? "09:00",
      endTime: overrides.endTime ?? "12:00",
      slotDurationMinutes: overrides.slotDurationMinutes ?? 30,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  expect(res.statusCode).toBe(201);

  return { ...doctor, dayOfWeek };
}

export type ApiSlot = { startAt: string; endAt: string };

export async function getSlots(app: FastifyInstance, doctorId: string, date: string): Promise<ApiSlot[]> {
  const res = await app.inject({ method: "GET", url: `/api/doctors/${doctorId}/availability?from=${date}&to=${date}` });
  expect(res.statusCode).toBe(200);
  return res.json().slots as ApiSlot[];
}
