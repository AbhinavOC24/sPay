import z from "zod";

export const paymentSchema = z.object({
  amount: z.number().gt(0, { message: "number should be greater than 0" }),
  order_id: z.string(),
  description: z.string(),
  success_url: z.string(),
  cancel_url: z.string(),
});
