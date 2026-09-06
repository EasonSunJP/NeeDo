import { z } from "zod";

export const operationsMemberCreateSchema = z.object({
  username: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]+$/),
  reason: z.string().trim().min(1).max(500)
}).strict();

export type OperationsMemberCreateInput = z.infer<typeof operationsMemberCreateSchema>;
