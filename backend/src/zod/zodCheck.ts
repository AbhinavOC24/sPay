import z from "zod";

export const paymentSchema = z.object({
  amount: z.number().gt(0, { message: "number should be greater than 0" }),
  order_id: z.string(),
  webhookDelivery: z.boolean().optional(),
  success_url: z.string(),
  cancel_url: z.string(),
});

export const merchantSignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const merchantLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
