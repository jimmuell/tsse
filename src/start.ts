import { createStart } from "@tanstack/react-start";

import { csrfMiddleware } from "./lib/csrf-middleware";
import { errorMiddleware } from "./lib/error-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
