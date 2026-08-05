import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

/**
 * Testing helper: set a password directly for an account, no email round-trip.
 * Gated behind the ALLOW_TEST_PASSWORD_RESET env flag — remove that flag to
 * disable this endpoint entirely before going live.
 */
export const setPasswordDirect = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SetPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    if (process.env["ALLOW_TEST_PASSWORD_RESET"] !== "true") {
      throw new Error("Direct password reset is disabled.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();
    let page = 1;
    let target: { id: string } | null = null;
    while (page <= 20 && !target) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) target = { id: found.id };
      if (list.users.length < 200) break;
      page += 1;
    }

    if (!target) {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      return { ok: true as const, created: true as const };
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, created: false as const };
  });
