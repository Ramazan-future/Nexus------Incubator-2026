import { z } from "zod";

export const RegisterSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(1).max(128),
});

export type LoginDto = z.infer<typeof LoginSchema>;

