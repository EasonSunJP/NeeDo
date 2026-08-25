import { z } from "zod";

export const merchantPreviewShopHeaderSchema = z.coerce.number().int().positive();
