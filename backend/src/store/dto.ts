import { z } from "zod";

export const createMerchOrderSchema = z.object({
  variantId: z.string().uuid().optional(),
  shippingName: z.string().trim().min(1).max(200),
  shippingAddress: z.string().trim().min(1).max(2000),
  shippingCity: z.string().trim().min(1).max(100),
  shippingCountry: z
    .string()
    .trim()
    .length(2, "shippingCountry must be a 2-letter country code")
    .toUpperCase(),
  shippingZip: z.string().trim().min(1).max(20),
});
export type CreateMerchOrderInput = z.infer<typeof createMerchOrderSchema>;
