import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { EmailAlreadyUsedError, InvalidCredentialsError } from "../modules/auth/auth.service.js";
import {
  CityNotFoundError,
  DoctorProfileAlreadyExistsError,
  SpecialtyNotFoundError,
} from "../modules/doctors/doctors.service.js";
import {
  AvailabilityOverlapError,
  AvailabilityValidationError,
  DateOverrideAlreadyExistsError,
} from "../modules/availability/availability.service.js";
import {
  AppointmentAlreadyFinalizedError,
  SlotAlreadyBookedError,
  SlotNotBookableError,
} from "../modules/appointments/appointments.service.js";
import { UserAlreadyActiveError, UserAlreadySuspendedError } from "../modules/users/users.service.js";

/**
 * Traduit les erreurs connues du domaine en réponses HTTP propres, sans
 * jamais renvoyer de stack trace ou de détail interne au client.
 */
export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "ValidationError",
        message: "Données invalides.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    if (error instanceof EmailAlreadyUsedError) {
      reply.code(409).send({ error: "Conflict", message: error.message });
      return;
    }

    if (error instanceof InvalidCredentialsError) {
      reply.code(401).send({ error: "Unauthorized", message: error.message });
      return;
    }

    if (error instanceof DoctorProfileAlreadyExistsError) {
      reply.code(409).send({ error: "Conflict", message: error.message });
      return;
    }

    if (error instanceof CityNotFoundError || error instanceof SpecialtyNotFoundError) {
      reply.code(400).send({ error: "ValidationError", message: error.message });
      return;
    }

    if (error instanceof AvailabilityOverlapError || error instanceof DateOverrideAlreadyExistsError) {
      reply.code(409).send({ error: "Conflict", message: error.message });
      return;
    }

    if (error instanceof AvailabilityValidationError) {
      reply.code(400).send({ error: "ValidationError", message: error.message });
      return;
    }

    if (
      error instanceof SlotNotBookableError ||
      error instanceof SlotAlreadyBookedError ||
      error instanceof AppointmentAlreadyFinalizedError
    ) {
      reply.code(409).send({ error: "Conflict", message: error.message });
      return;
    }

    if (error instanceof UserAlreadySuspendedError || error instanceof UserAlreadyActiveError) {
      reply.code(409).send({ error: "Conflict", message: error.message });
      return;
    }

    const statusCode = "statusCode" in error ? error.statusCode : undefined;
    if (statusCode && statusCode < 500) {
      reply.code(statusCode).send({ error: error.name, message: error.message });
      return;
    }

    request.log.error(error);
    reply.code(500).send({ error: "InternalServerError", message: "Une erreur inattendue est survenue." });
  });
});
