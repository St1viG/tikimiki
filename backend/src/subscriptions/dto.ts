import { z } from "zod";

export const activateSubscriptionSchema = z.object({
  billingCycle: z.enum(["monthly", "annual"]),
});
export type ActivateSubscriptionInput = z.infer<typeof activateSubscriptionSchema>;

// Body is optional so legacy no-body calls keep the default (period-end) cancel.
export const cancelSubscriptionSchema = z
  .object({ immediate: z.boolean().default(false) })
  .default({ immediate: false });
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
