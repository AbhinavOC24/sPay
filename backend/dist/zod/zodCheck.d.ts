import z from "zod";
export declare const paymentSchema: z.ZodObject<{
    amount: z.ZodNumber;
    order_id: z.ZodString;
    description: z.ZodString;
    webhook_url: z.ZodString;
}, z.core.$strip>;
//# sourceMappingURL=zodCheck.d.ts.map