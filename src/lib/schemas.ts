import { z } from "zod";

/**
 * Wire schemas shared by every module. The error body is uniform across the
 * whole API: `{ "message": "..." }` — produced only by the error-handler
 * plugin, documented here for route response schemas.
 */
export const errorResponseSchema = z.object({
    message: z.string(),
});
