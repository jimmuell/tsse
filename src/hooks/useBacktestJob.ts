import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type JobRow = {
  id: string;
  status: string;
  error: string | null;
  run_id: string | null;
  engine_version: string | null;
};

/**
 * Watches an engine job. Live updates are the fast path; a poll is the fallback
 * so a broken subscription can never leave the screen spinning forever.
 */
export function useBacktestJob(jobId: string | null): {
  job: JobRow | null;
  delivery: "live" | "poll" | null;
} {
  const [job, setJob] = useState<JobRow | null>(null);
  const [delivery, setDelivery] = useState<"live" | "poll" | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setDelivery(null);
      return;
    }
    settled.current = false;
    let cancelled = false;

    const finish = (row: JobRow, how: "live" | "poll") => {
      if (cancelled) return;
      setJob(row);
      if ((row.status === "done" || row.status === "failed") && !settled.current) {
        settled.current = true;
        setDelivery(how);
        console.log(`[backtest] job ${row.id} result delivered via ${how} (status ${row.status})`);
      }
    };

    const channel = supabase
      .channel(`backtest-job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "backtest_jobs", filter: `id=eq.${jobId}` },
        (payload) => finish(payload.new as JobRow, "live"),
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void (async () => {
        const { data } = await supabase
          .from("backtest_jobs")
          .select("id, status, error, run_id, engine_version")
          .eq("id", jobId)
          .maybeSingle();
        if (data) finish(data as JobRow, "poll");
      })();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, delivery };
}
