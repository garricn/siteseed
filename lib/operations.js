import { z } from "zod";

/**
 * Define an operation — single source of truth for all API surfaces.
 */
function defineOp({ name, description, type, input, handler }) {
  return { name, description, type, input, handler };
}

export const healthOp = defineOp({
  name: "health",
  description: "Health check",
  type: "query",
  input: z.object({}),
  handler: async () => ({ ok: true }),
});
