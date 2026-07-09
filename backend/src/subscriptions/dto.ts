import { z } from "zod";

export const activateSubscriptionSchema = z.object({
  billingCycle: z.enum(["monthly", "annual"]),
});
export type ActivateSubscriptionInput = z.infer<typeof activateSubscriptionSchema>;
