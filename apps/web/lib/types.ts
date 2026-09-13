// Types locaux au frontend patient (étape 11). Reflètent les DTOs déjà
// renvoyés par l'API (apps/api) sans les importer depuis un package
// partagé — décision explicite de cette étape : packages/types n'est pas
// utilisé pour le moment (voir docs/architecture/README.md).

export type Role = "PATIENT" | "DOCTOR" | "ADMIN";
export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
};

export type Specialty = { id: string; name: string };
export type City = { id: string; name: string };

export type PublicDoctor = {
  id: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  city: City | null;
  address: string | null;
  specialties: Specialty[];
  createdAt: string;
};

export type Slot = { startAt: string; endAt: string };

export type AppointmentDoctorSummary = {
  id: string;
  firstName: string;
  lastName: string;
  address: string | null;
  city: City | null;
  specialties: Specialty[];
};

export type PatientAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  doctor: AppointmentDoctorSummary;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedDoctors = { doctors: PublicDoctor[]; total: number; page: number; limit: number };
export type PaginatedAppointments = { appointments: PatientAppointment[]; total: number; page: number; limit: number };
export type AvailabilityResponse = { doctorId: string; from: string; to: string; slots: Slot[] };

// --- Étape 12 : Dashboard Médecin ---

export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

/** Vue complète du profil médecin (GET/POST/PATCH /api/doctors/me), réservée
 * au médecin lui-même — jamais exposée publiquement. */
export type DetailedDoctor = {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  bio: string | null;
  professionalPhone: string | null;
  city: City | null;
  address: string | null;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  specialties: Specialty[];
  createdAt: string;
  updatedAt: string;
};

export type AvailabilityType = "RECURRING" | "DATE_OVERRIDE";

/** Reflète exactement le modèle backend (une seule table, discriminée par
 * `type`) — pas de système de créneau exceptionnel partiel inventé côté
 * frontend. */
export type AvailabilityRule = {
  id: string;
  doctorId: string;
  type: AvailabilityType;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  slotDurationMinutes: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  specificDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorAppointmentPatientSummary = {
  firstName: string;
  lastName: string;
  phone: string | null;
};

/** Vue médecin d'un rendez-vous (GET /api/doctors/me/appointments) — forme
 * différente de `PatientAppointment` (expose `patient`, pas `doctor`). */
export type DoctorAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  patient: DoctorAppointmentPatientSummary;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedDoctorAppointments = { appointments: DoctorAppointment[]; total: number; page: number; limit: number };

// --- Étape 13 : Dashboard Admin ---

/** Vue admin d'un rendez-vous (GET /api/admin/appointments) — lecture seule,
 * expose directement doctorName/patientName (pas de jointure à refaire côté
 * frontend). Forme différente de `PatientAppointment`/`DoctorAppointment`. */
export type AdminAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  doctorId: string;
  doctorName: string;
  patientId: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedAdminDoctors = { doctors: DetailedDoctor[]; total: number; page: number; limit: number };
export type PaginatedAdminUsers = { users: AuthUser[]; total: number; page: number; pageSize: number };
export type PaginatedAdminAppointments = { appointments: AdminAppointment[]; total: number; page: number; limit: number };

// --- Étape 14 : Notifications ---

export type NotificationType = "APPOINTMENT_BOOKED" | "APPOINTMENT_CANCELLED" | "APPOINTMENT_REMINDER";

/** Vue exposée par `GET/PATCH /api/notifications/me*` — jamais d'email,
 * uniquement les notifications IN_APP de l'appelant (les lignes EMAIL sont
 * un journal technique interne, jamais renvoyées ici). */
export type AppNotification = {
  id: string;
  type: NotificationType;
  appointmentId: string;
  appointmentStartAt: string;
  doctorName: string;
  patientName: string;
  readAt: string | null;
  createdAt: string;
};

export type PaginatedNotifications = { notifications: AppNotification[]; total: number; page: number; limit: number };
