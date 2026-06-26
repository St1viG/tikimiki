import { z } from "zod";

/** Query for GET /notifications — filter by read state. */
export const listNotificationsSchema = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
