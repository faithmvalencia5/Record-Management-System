import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, message: "Method not allowed." }, { status: 405, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("STORAGE_CLEANUP_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-cleanup-secret");
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return Response.json({ success: false, message: "Unauthorized webhook." }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, message: "Supabase service configuration is missing." }, { status: 500, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, message: "Invalid webhook payload." }, { status: 400, headers: corsHeaders });
  }

  const queueId = Number(payload?.record?.id);
  if (!Number.isSafeInteger(queueId) || queueId <= 0) {
    return Response.json({ success: false, message: "Cleanup queue ID is missing." }, { status: 400, headers: corsHeaders });
  }

  const { data: job, error: readError } = await admin
    .from("application_storage_cleanup_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();

  if (readError) {
    return Response.json({ success: false, message: readError.message }, { status: 500, headers: corsHeaders });
  }
  if (!job) {
    return Response.json({ success: false, message: "Cleanup job not found." }, { status: 404, headers: corsHeaders });
  }
  if (job.status === "completed") {
    return Response.json({ success: true, message: "Cleanup was already completed.", deleted: 0 }, { headers: corsHeaders });
  }

  const paths = Array.isArray(job.object_paths) ? job.object_paths : [];
  await admin.from("application_storage_cleanup_queue").update({
    status: "processing",
    attempt_count: Number(job.attempt_count || 0) + 1,
    last_error: null,
  }).eq("id", queueId);

  try {
    let deleted = 0;
    for (let offset = 0; offset < paths.length; offset += 100) {
      const batch = paths.slice(offset, offset + 100);
      const { data, error } = await admin.storage.from(job.bucket_id).remove(batch);
      if (error) throw error;
      deleted += Array.isArray(data) ? data.length : batch.length;
    }

    const { error: updateError } = await admin
      .from("application_storage_cleanup_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", queueId);

    if (updateError) throw updateError;

    return Response.json({
      success: true,
      applicationId: job.application_id,
      deleted,
    }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("application_storage_cleanup_queue").update({
      status: "failed",
      last_error: message.slice(0, 2000),
    }).eq("id", queueId);

    return Response.json({ success: false, applicationId: job.application_id, message }, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
