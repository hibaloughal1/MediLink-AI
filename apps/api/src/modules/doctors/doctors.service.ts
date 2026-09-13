import type { City, Doctor, DoctorSpecialty, DoctorVerificationStatus, PrismaClient, Specialty, User } from "@prisma/client";
import type { CreateDoctorProfileInput, SearchDoctorsQuery, UpdateDoctorProfileInput } from "./doctors.schemas.js";

export class DoctorProfileAlreadyExistsError extends Error {
  constructor() {
    super("Ce compte a déjà un profil médecin.");
    this.name = "DoctorProfileAlreadyExistsError";
  }
}

export class CityNotFoundError extends Error {
  constructor() {
    super("Ville introuvable.");
    this.name = "CityNotFoundError";
  }
}

export class SpecialtyNotFoundError extends Error {
  constructor() {
    super("Une ou plusieurs spécialités sont introuvables.");
    this.name = "SpecialtyNotFoundError";
  }
}

type DoctorWithRelations = Doctor & {
  user: User;
  city: City | null;
  specialties: (DoctorSpecialty & { specialty: Specialty })[];
};

const fullInclude = {
  user: true,
  city: true,
  specialties: { include: { specialty: true } },
} as const;

/** Vue publique : uniquement ce qu'un patient peut voir d'un médecin vérifié. */
export function toPublicDoctor(doctor: DoctorWithRelations) {
  return {
    id: doctor.id,
    firstName: doctor.user.firstName,
    lastName: doctor.user.lastName,
    bio: doctor.bio,
    city: doctor.city ? { id: doctor.city.id, name: doctor.city.name } : null,
    address: doctor.address,
    specialties: doctor.specialties.map((ds) => ({ id: ds.specialty.id, name: ds.specialty.name })),
    createdAt: doctor.createdAt,
  };
}

/** Vue complète : pour le médecin lui-même ou l'administrateur. */
export function toDetailedDoctor(doctor: DoctorWithRelations) {
  return {
    id: doctor.id,
    userId: doctor.userId,
    email: doctor.user.email,
    firstName: doctor.user.firstName,
    lastName: doctor.user.lastName,
    licenseNumber: doctor.licenseNumber,
    bio: doctor.bio,
    professionalPhone: doctor.professionalPhone,
    city: doctor.city ? { id: doctor.city.id, name: doctor.city.name } : null,
    address: doctor.address,
    verificationStatus: doctor.verificationStatus,
    verifiedAt: doctor.verifiedAt,
    specialties: doctor.specialties.map((ds) => ({ id: ds.specialty.id, name: ds.specialty.name })),
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt,
  };
}

async function assertCityAndSpecialtiesExist(prisma: PrismaClient, cityId: string | undefined, specialtyIds: string[] | undefined) {
  if (cityId) {
    const city = await prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new CityNotFoundError();
  }
  if (specialtyIds) {
    const count = await prisma.specialty.count({ where: { id: { in: specialtyIds } } });
    if (count !== specialtyIds.length) throw new SpecialtyNotFoundError();
  }
}

export async function findDoctorByUserId(prisma: PrismaClient, userId: string) {
  return prisma.doctor.findUnique({ where: { userId }, include: fullInclude });
}

export async function findDoctorById(prisma: PrismaClient, id: string) {
  return prisma.doctor.findUnique({ where: { id }, include: fullInclude });
}

export async function createDoctorProfile(prisma: PrismaClient, userId: string, input: CreateDoctorProfileInput) {
  const existing = await prisma.doctor.findUnique({ where: { userId } });
  if (existing) {
    throw new DoctorProfileAlreadyExistsError();
  }

  await assertCityAndSpecialtiesExist(prisma, input.cityId, input.specialtyIds);

  return prisma.doctor.create({
    data: {
      userId,
      cityId: input.cityId,
      address: input.address,
      bio: input.bio,
      professionalPhone: input.professionalPhone,
      licenseNumber: input.licenseNumber,
      specialties: {
        create: input.specialtyIds.map((specialtyId) => ({ specialtyId })),
      },
    },
    include: fullInclude,
  });
}

export async function updateDoctorProfile(prisma: PrismaClient, doctorId: string, input: UpdateDoctorProfileInput) {
  await assertCityAndSpecialtiesExist(prisma, input.cityId, input.specialtyIds);

  return prisma.$transaction(async (tx) => {
    if (input.specialtyIds) {
      await tx.doctorSpecialty.deleteMany({ where: { doctorId } });
      await tx.doctorSpecialty.createMany({
        data: input.specialtyIds.map((specialtyId) => ({ doctorId, specialtyId })),
      });
    }

    return tx.doctor.update({
      where: { id: doctorId },
      data: {
        ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.professionalPhone !== undefined ? { professionalPhone: input.professionalPhone } : {}),
        ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
      },
      include: fullInclude,
    });
  });
}

export async function setDoctorVerificationStatus(
  prisma: PrismaClient,
  doctorId: string,
  status: "VERIFIED" | "REJECTED" | "SUSPENDED",
) {
  return prisma.doctor.update({
    where: { id: doctorId },
    data: {
      verificationStatus: status,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
    },
    include: fullInclude,
  });
}

export async function searchPublicDoctors(prisma: PrismaClient, query: SearchDoctorsQuery) {
  const where = {
    verificationStatus: "VERIFIED" as const,
    user: { status: "ACTIVE" as const },
    ...(query.city ? { city: { name: { equals: query.city, mode: "insensitive" as const } } } : {}),
    ...(query.specialty
      ? { specialties: { some: { specialty: { name: { equals: query.specialty, mode: "insensitive" as const } } } } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { user: { firstName: { contains: query.search, mode: "insensitive" as const } } },
            { user: { lastName: { contains: query.search, mode: "insensitive" as const } } },
            { bio: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      include: fullInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.doctor.count({ where }),
  ]);

  return { items, total };
}

export async function listAllDoctorsForAdmin(
  prisma: PrismaClient,
  params: { skip: number; take: number; status?: DoctorVerificationStatus },
) {
  const where = params.status ? { verificationStatus: params.status } : {};

  const [items, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      include: fullInclude,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.doctor.count({ where }),
  ]);

  return { items, total };
}
