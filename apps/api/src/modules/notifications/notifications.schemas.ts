import { z } from "zod";

// `unreadOnly` accepté comme chaîne "true"/"false" (comme tout paramètre de
// query string) plutôt que `z.coerce.boolean()`, qui coercerait la chaîne
// "false" (non vide) en `true` — piège classique évité explicitement.
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
