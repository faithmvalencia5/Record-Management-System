const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Supabase has had hosted PostgREST versions that can intermittently reject
// otherwise valid requests with PGRST303 / "JWT issued at future". Retry only
// safe read requests for this exact transient response; never retry writes.
const nativeFetch = globalThis.fetch.bind(globalThis);
const JWT_CLOCK_RETRY_DELAYS_MS = [300, 800, 1500];

async function fetchWithPostgrestClockRetry(input, init) {
  const method = String(init?.method || input?.method || "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD";

  for (let attempt = 0; ; attempt += 1) {
    const response = await nativeFetch(input, init);
    if (!canRetry || ![401, 500].includes(response.status) || attempt >= JWT_CLOCK_RETRY_DELAYS_MS.length) {
      return response;
    }

    let payload;
    try {
      payload = await response.clone().json();
    } catch (_) {
      return response;
    }

    const isPostgrestClockError =
      payload?.code === "PGRST303" ||
      /JWT issued at future/i.test(String(payload?.message || ""));

    if (!isPostgrestClockError) return response;

    const delay = JWT_CLOCK_RETRY_DELAYS_MS[attempt];
    console.warn(
      "[Supabase] PostgREST rejected a read with PGRST303; retrying in " + delay + "ms (" +
      (attempt + 1) + "/" + JWT_CLOCK_RETRY_DELAYS_MS.length + ")."
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    global: {
      fetch: fetchWithPostgrestClockRetry,
    },
  }
);

module.exports = supabase;
