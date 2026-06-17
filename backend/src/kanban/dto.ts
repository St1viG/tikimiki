import { z } from "zod";

/** POST /teams/:teamId/kanban/cards */
export const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

/** PATCH /kanban/cards/:cardId */
export const updateCardSchema = z
  .object({
    columnId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10000).optional(),
    position: z.number().min(0).optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
