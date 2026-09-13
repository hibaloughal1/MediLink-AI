import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/password.js";
import { createAppointment, cancelAppointment } from "../src/modules/appointments/appointments.service.js";
import { generateAvailableSlots } from "../src/modules/availability/availability.service.js";

// IMPORTANT (étape 15) : ce script n'importe et n'appelle JAMAIS
// `notifyAppointmentBooked`/`notifyAppointmentCancelled`
// (`src/modules/notifications/notifications.service.ts`) ni le plugin de
// transport email (`src/plugins/email-transport.ts`). `createAppointment`/
// `cancelAppointment` eux-mêmes ne déclenchent aucune notification — ce
// déclenchement vit exclusivement dans les routes HTTP
// (`appointments.routes.ts`/`appointments.doctor.routes.ts`), jamais dans
// le service — donc les appeler ici ne peut structurellement envoyer aucun
// email, quelle que soit la configuration SMTP de l'environnement
// (`SMTP_HOST` inclus). Les notifications de démonstration visibles dans
// la cloche sont créées plus bas par une simple ligne Prisma directe
// (canal IN_APP uniquement, jamais EMAIL) : pas de règle métier à dupliquer
// pour un simple enregistrement d'affichage.

const prisma = new PrismaClient();

// Mot de passe commun à tous les comptes de démonstration. Usage local
// uniquement — aucune de ces données n'est réelle.
const DEMO_PASSWORD = "Password123!";

const CITY_NAMES = ["Agadir", "Casablanca", "Rabat", "Marrakech", "Tanger", "Fès"];

const SPECIALTY_NAMES = [
  "Médecine générale",
  "Cardiologie",
  "Dermatologie",
  "Pédiatrie",
  "Gynécologie",
  "Ophtalmologie",
  "Dentisterie",
  "ORL",
  "Neurologie",
  "Psychiatrie",
];

// Médecins fictifs couvrant les 4 statuts de vérification, pour pouvoir
// tester réellement la recherche publique (seuls VERIFIED doivent
// apparaître).
// Disponibilités de démonstration : uniquement pertinentes pour les
// médecins VERIFIED (seuls réservables), mais sans effet pour les autres.
type SeedAvailability = { dayOfWeek: number; startTime: string; endTime: string; slotDurationMinutes: number };

const DOCTORS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  specialties: string[];
  status: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  availability?: SeedAvailability[];
}> = [
  {
    email: "dr.bennani@medilink.local",
    firstName: "Youssef",
    lastName: "Bennani",
    city: "Casablanca",
    specialties: ["Cardiologie"],
    status: "VERIFIED",
    availability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", slotDurationMinutes: 30 }, // lundi
      { dayOfWeek: 3, startTime: "09:00", endTime: "13:00", slotDurationMinutes: 30 }, // mercredi
    ],
  },
  {
    email: "dr.elfassi@medilink.local",
    firstName: "Amina",
    lastName: "El Fassi",
    city: "Agadir",
    specialties: ["Dermatologie", "Médecine générale"],
    status: "VERIFIED",
    availability: [
      { dayOfWeek: 2, startTime: "10:00", endTime: "16:00", slotDurationMinutes: 45 }, // mardi
      { dayOfWeek: 4, startTime: "10:00", endTime: "16:00", slotDurationMinutes: 45 }, // jeudi
    ],
  },
  {
    email: "dr.idrissi@medilink.local",
    firstName: "Sara",
    lastName: "Idrissi",
    city: "Rabat",
    specialties: ["Pédiatrie"],
    status: "PENDING" as const,
  },
  {
    email: "dr.tazi@medilink.local",
    firstName: "Karim",
    lastName: "Tazi",
    city: "Marrakech",
    specialties: ["ORL"],
    status: "REJECTED" as const,
  },
  {
    email: "dr.chraibi@medilink.local",
    firstName: "Nadia",
    lastName: "Chraibi",
    city: "Tanger",
    specialties: ["Gynécologie"],
    status: "SUSPENDED" as const,
  },
];

const PATIENT_FIRST_LAST_NAMES: [string, string][] = [
  ["Fatima Zahra", "Alaoui"],
  ["Omar", "Benjelloun"],
  ["Khadija", "Zahiri"],
  ["Hamza", "Squalli"],
  ["Salma", "Ouazzani"],
  ["Yassine", "Berrada"],
  ["Imane", "Cherkaoui"],
  ["Mehdi", "Lahlou"],
  ["Rania", "Guessous"],
  ["Anas", "Fassi Fihri"],
];

async function main() {
  console.log("Seed: villes...");
  const cities = await Promise.all(
    CITY_NAMES.map((name) => prisma.city.upsert({ where: { name }, update: {}, create: { name } })),
  );

  console.log("Seed: spécialités...");
  const specialties = await Promise.all(
    SPECIALTY_NAMES.map((name) => prisma.specialty.upsert({ where: { name }, update: {}, create: { name } })),
  );
  const specialtyIdByName = new Map(specialties.map((s) => [s.name, s.id]));
  const cityIdByName = new Map(cities.map((c) => [c.name, c.id]));

  console.log("Seed: admin...");
  await prisma.user.upsert({
    where: { email: "admin@medilink.local" },
    update: {},
    create: {
      email: "admin@medilink.local",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role: "ADMIN",
      firstName: "Admin",
      lastName: "MediLink",
    },
  });

  console.log("Seed: médecins...");
  const doctorIdByEmail = new Map<string, string>();
  for (const doctorData of DOCTORS) {
    const user = await prisma.user.upsert({
      where: { email: doctorData.email },
      update: {},
      create: {
        email: doctorData.email,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        role: "DOCTOR",
        firstName: doctorData.firstName,
        lastName: doctorData.lastName,
      },
    });

    const cityId = cityIdByName.get(doctorData.city);
    if (!cityId) throw new Error(`Ville inconnue dans le seed: ${doctorData.city}`);

    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {
        cityId,
        verificationStatus: doctorData.status,
        verifiedAt: doctorData.status === "VERIFIED" ? new Date() : null,
      },
      create: {
        userId: user.id,
        cityId,
        address: `Cabinet médical, ${doctorData.city}`,
        bio: `Dr ${doctorData.firstName} ${doctorData.lastName} — données de démonstration.`,
        verificationStatus: doctorData.status,
        verifiedAt: doctorData.status === "VERIFIED" ? new Date() : null,
      },
    });

    await prisma.doctorSpecialty.deleteMany({ where: { doctorId: doctor.id } });
    for (const specialtyName of doctorData.specialties) {
      const specialtyId = specialtyIdByName.get(specialtyName);
      if (!specialtyId) throw new Error(`Spécialité inconnue dans le seed: ${specialtyName}`);
      await prisma.doctorSpecialty.create({ data: { doctorId: doctor.id, specialtyId } });
    }

    // Recrée les disponibilités récurrentes à chaque exécution du seed
    // (idempotent) ; sans date de fin, effective à partir d'aujourd'hui.
    await prisma.availability.deleteMany({ where: { doctorId: doctor.id, type: "RECURRING" } });
    for (const rule of doctorData.availability ?? []) {
      await prisma.availability.create({
        data: {
          doctorId: doctor.id,
          type: "RECURRING",
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
          slotDurationMinutes: rule.slotDurationMinutes,
          effectiveFrom: new Date(new Date().toISOString().slice(0, 10)),
        },
      });
    }

    doctorIdByEmail.set(doctorData.email, doctor.id);
  }

  console.log("Seed: patients...");
  const patientUserIdByEmail = new Map<string, string>();
  for (let i = 0; i < PATIENT_FIRST_LAST_NAMES.length; i += 1) {
    const [firstName, lastName] = PATIENT_FIRST_LAST_NAMES[i];
    const email = `patient${i + 1}@medilink.local`;
    const patientUser = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        role: "PATIENT",
        firstName,
        lastName,
      },
    });
    patientUserIdByEmail.set(email, patientUser.id);
  }

  console.log("Seed: rendez-vous de démonstration...");
  await seedDemoAppointments(doctorIdByEmail, patientUserIdByEmail);

  console.log("Seed terminé.");
  console.log(`Mot de passe pour tous les comptes de démonstration : ${DEMO_PASSWORD}`);
}

/** Prochaine occurrence (à partir de demain) d'un jour de semaine donné (0=dimanche..6=samedi), au format "YYYY-MM-DD". */
function nextDateForDayOfWeek(dayOfWeek: number, afterDaysFromToday = 1): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + afterDaysFromToday);
  while (date.getUTCDay() !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Rendez-vous de démonstration entre les 2 médecins VERIFIED du seed
 * (dr.bennani, dr.elfassi) et deux patients, pour que le seed produise un
 * jeu de données réaliste (dashboards, agenda, cloche de notifications non
 * vides dès la première connexion) plutôt que des écrans vides.
 *
 * Utilise les vraies fonctions de service de réservation/annulation
 * (`createAppointment`/`cancelAppointment`) — jamais de duplication des
 * règles métier (anti-double-réservation, validité du créneau) — mais NE
 * PASSE JAMAIS par les routes HTTP, donc ne déclenche structurellement
 * aucune notification/email (voir le commentaire en tête de fichier).
 *
 * Idempotent : les rendez-vous de démonstration précédemment créés pour ces
 * paires médecin/patient précises sont supprimés puis recréés à chaque
 * exécution (même principe que les disponibilités ci-dessus) — jamais une
 * suppression touchant d'autres données.
 */
async function seedDemoAppointments(doctorIdByEmail: Map<string, string>, patientUserIdByEmail: Map<string, string>) {
  const bennaniId = doctorIdByEmail.get("dr.bennani@medilink.local");
  const elfassiId = doctorIdByEmail.get("dr.elfassi@medilink.local");
  const patient1Id = patientUserIdByEmail.get("patient1@medilink.local");
  const patient2Id = patientUserIdByEmail.get("patient2@medilink.local");

  if (!bennaniId || !elfassiId || !patient1Id || !patient2Id) {
    throw new Error("Seed de démonstration : médecin ou patient de référence introuvable.");
  }

  // Nettoyage ciblé : uniquement les rendez-vous précédemment créés par le
  // seed pour ces paires exactes (jamais une suppression plus large) — les
  // notifications associées disparaissent avec (cascade `Appointment ->
  // Notification` déjà définie dans le schéma).
  await prisma.appointment.deleteMany({ where: { doctorId: bennaniId, patientId: patient1Id } });
  await prisma.appointment.deleteMany({ where: { doctorId: elfassiId, patientId: patient2Id } });

  async function bookDemoSlot(doctorId: string, dayOfWeek: number, patientId: string) {
    const date = nextDateForDayOfWeek(dayOfWeek);
    const slots = await generateAvailableSlots(prisma, doctorId, date, date);
    if (slots.length === 0) {
      throw new Error(`Seed de démonstration : aucun créneau généré pour le médecin ${doctorId} le ${date}.`);
    }
    return createAppointment(prisma, { doctorId, patientId, startAt: slots[0].startAt, endAt: slots[0].endAt });
  }

  async function createInAppNotification(userId: string, appointmentId: string, type: "APPOINTMENT_BOOKED" | "APPOINTMENT_CANCELLED") {
    // Canal IN_APP uniquement, jamais EMAIL : purement un enregistrement
    // d'affichage pour la cloche de démonstration, aucune règle métier à
    // dupliquer. `upsert` sur la contrainte unique du schéma pour rester
    // idempotent même si l'appointmentId était réutilisé.
    await prisma.notification.upsert({
      where: { userId_appointmentId_type_channel: { userId, appointmentId, type, channel: "IN_APP" } },
      update: {},
      create: { userId, appointmentId, type, channel: "IN_APP", status: "SENT", sentAt: new Date() },
    });
  }

  // dr.bennani + patient1 : un rendez-vous confirmé à venir.
  // `createAppointment` renvoie déjà `doctor.userId` via son `include`
  // (doctorSummaryInclude) — pas besoin d'une requête séparée.
  const bennaniAppointment = await bookDemoSlot(bennaniId, 1, patient1Id); // lundi
  const bennaniUserId = bennaniAppointment.doctor.userId;
  await createInAppNotification(patient1Id, bennaniAppointment.id, "APPOINTMENT_BOOKED");
  await createInAppNotification(bennaniUserId, bennaniAppointment.id, "APPOINTMENT_BOOKED");

  // dr.elfassi + patient2 : un rendez-vous confirmé à venir.
  const elfassiAppointment = await bookDemoSlot(elfassiId, 2, patient2Id); // mardi
  const elfassiUserId = elfassiAppointment.doctor.userId;
  await createInAppNotification(patient2Id, elfassiAppointment.id, "APPOINTMENT_BOOKED");
  await createInAppNotification(elfassiUserId, elfassiAppointment.id, "APPOINTMENT_BOOKED");

  // dr.bennani + patient1 : un second rendez-vous, annulé — pour illustrer
  // l'historique et une notification d'annulation (canal IN_APP) côté médecin.
  const cancelledSlotDate = nextDateForDayOfWeek(3); // mercredi (différent du lundi ci-dessus)
  const slotsForCancellation = await generateAvailableSlots(prisma, bennaniId, cancelledSlotDate, cancelledSlotDate);
  if (slotsForCancellation.length > 1) {
    const created = await createAppointment(prisma, {
      doctorId: bennaniId,
      patientId: patient1Id,
      startAt: slotsForCancellation[1].startAt,
      endAt: slotsForCancellation[1].endAt,
    });
    const cancelled = await cancelAppointment(prisma, created);
    await createInAppNotification(patient1Id, cancelled.id, "APPOINTMENT_BOOKED");
    await createInAppNotification(bennaniUserId, cancelled.id, "APPOINTMENT_BOOKED");
    await createInAppNotification(bennaniUserId, cancelled.id, "APPOINTMENT_CANCELLED");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
