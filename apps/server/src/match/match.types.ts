import { z } from "zod";

export const DropActionSchema = z.object({
  type: z.literal("DROP"),
  column: z.number().int().min(0),
});

export type DropAction = z.infer<typeof DropActionSchema>;

