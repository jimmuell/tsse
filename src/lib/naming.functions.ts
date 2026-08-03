import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SuggestNameInput = z.object({
  sourceUrl: z.string().optional(),
  sourceContent: z.string().optional(),
});

export const suggestStrategyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestNameInput.parse(input))
  .handler(async ({ data }) => {
    const { suggestName } = await import("./naming.server");
    return (await suggestName(data)) ?? { name: "", from: null };
  });
