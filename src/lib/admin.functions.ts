import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, buildOverview } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    return buildOverview();
  });

const SetRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetRoleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, setRole } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    return setRole(data.userId, data.role, context.userId);
  });
