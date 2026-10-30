# ID Maker Queue Analytics: Capstone Notes

## Purpose and scope

The page provides **descriptive analytics**: it reports the current queue state and recorded completions, with short AI-generated natural-language summaries. Code calculates every count, percentage, ranking, age bucket, comparison, and status label. Gemini only rewrites the supplied statistics into a short description. It does not discover patterns, make decisions, diagnose causes, predict future output, or recommend actions. Diagnostic, predictive, and prescriptive analytics are outside this release and may be considered as future work after the underlying data and evaluation method are established.

The analytics source is the successful `GET /api/id-maker-queue` response. Browser local-storage records are deliberately excluded from analytics. The operational queue may continue to merge local records for its existing workflow.

## Shared totals and denominators

| Measure | Definition |
| --- | --- |
| Total applications | Number of records returned from `id_maker_queue` for the ID Maker table. |
| Active queue | Queued + In Production. Printed, In Transit, and Completed are not active. |
| Stage count | Number of records whose current `print_status` equals that stage. An unrecognized status is displayed separately so the donut still sums to total applications. |
| Stage share | Stage count divided by total applications, rounded to the nearest whole percent. |
| Barangay share | Barangay application count divided by total applications, rounded to the nearest whole percent. |
| Aging share | Aging bucket count divided by active queue, rounded to the nearest whole percent. |

The page computes one analytics snapshot per successful queue refresh and reuses it for all four cards, status labels, and insight payloads.

## Status rules and configurable thresholds

The values are application configuration constants in `idmaker.js`. They are operational display thresholds for this project, not a published government SLA or policy; the ID Maker team should confirm them before presenting them as service commitments.

| Card | Code-set status rule |
| --- | --- |
| Production Queue Status | Elevated when Queued is **over 60%** of total applications; otherwise Normal. |
| Queue by Barangay | Elevated when the top barangay is **over 15%** of total applications; otherwise Normal. |
| Queue Aging / SLA | High when over 48 hours is **over 50%** of active queue; Elevated when it is **over 25%**; otherwise Normal. |
| Monthly ID Output | Elevated when the latest month is lower than the previous month; otherwise Normal. |

Missing or incomplete data is labelled Incomplete and does not receive a Normal/Elevated/High claim. These labels are set by code; Gemini does not choose them.

## Statistics supplied to Gemini

Only aggregate card statistics are sent. Applicant names, application IDs, addresses, photos, signatures, birth dates, and other applicant-level fields are not included. The backend also rejects payloads containing sensitive applicant field names.

| Card | Precomputed values supplied |
| --- | --- |
| Production Queue Status | Total, active total, per-stage counts and shares, queued share, unrecognized-status count, configured elevated threshold, code-set status label, expected bold lead, and the fixed fallback text. No historical period comparison is available. |
| Queue by Barangay | Total, top-ten barangay ranking (barangay label, count, share), top-three share, missing-barangay count, configured threshold, code-set status label, expected bold lead, and fallback text. No historical period comparison is available. |
| Queue Aging / SLA | Active count; within-24h, 24–48h, over-48h, and unknown-timestamp counts and shares; oldest known age; 24/48-hour thresholds; configured Elevated/High thresholds; code-set status label; expected bold lead; and fallback text. No historical period comparison is available. |
| Monthly ID Output | Six month labels and counts; latest and previous month/count; direction; six-month total and average; number of completed records missing a reliable completion timestamp; configured status rule; code-set status label; expected bold lead; and fallback text. |

For the first three cards, the previous-period comparison is null because the application does not retain historical dashboard snapshots. Monthly output compares the latest month with the previous month because the queue stores a completion timestamp.

## Queue age, SLA, and refresh behavior

Queue age is computed from the database `sent_at` timestamp returned by the queue endpoint, parsed as a date, then measured as `(refresh time - sent_at) / 3,600,000` hours. It is not inferred from application registration time or `updated_at`.

The age buckets are mutually exclusive: **within 24 hours** (`age <= 24`), **24–48 hours** (`24 < age <= 48`), and **over 48 hours** (`age > 48`). Records with a missing, invalid, or future `sent_at` are placed in a separate Unknown segment; the three age buckets plus Unknown always add up to the active queue. If any active timestamp is unknown, the aging insight is suppressed and reports that data is unavailable rather than treating unknown records as on time.

The queue is fetched on portal load and when staff refresh the queue. “Last updated” is the browser’s local time immediately after a successful queue response. Insights are requested once per card after a successful refresh when that card has complete data. Re-rendering unchanged statistics does not repeat Gemini calls. A changed queue status recomputes the statistics and summaries.

To inspect source timestamp quality without changing records, run a read-only query in Supabase SQL Editor:

```sql
SELECT
  COUNT(*) FILTER (WHERE print_status IN ('Queued', 'In Production')) AS active_count,
  COUNT(*) FILTER (
    WHERE print_status IN ('Queued', 'In Production') AND sent_at IS NULL
  ) AS active_missing_sent_at,
  COUNT(*) FILTER (
    WHERE print_status IN ('Queued', 'In Production') AND sent_at > NOW()
  ) AS active_future_sent_at,
  MIN(sent_at) FILTER (WHERE print_status IN ('Queued', 'In Production')) AS oldest_active_sent_at
FROM public.id_maker_queue;
```

No production rows were queried or altered as part of this code change, so the live missing/future timestamp counts still need to be checked against Supabase and ID Maker staff records.

## Monthly completion timestamps

The queue previously had no reliable first-completion timestamp. Migration `backend/migrations/002_id_maker_completion_timestamp.sql` adds `completed_at`; it is recorded when an item first changes to Completed and preserved if later queue updates occur. Existing rows are deliberately not backfilled from `updated_at`, because that field does not prove when completion happened. Existing Completed rows without `completed_at` make the monthly insight display “No data available for this period” until the missing history is resolved; no historical completion date is guessed. Monthly output uses the six-month window ending in the current month.

Run that migration in Supabase SQL Editor to enable Monthly ID Output. The queue endpoint can still load and update records before the migration: it falls back to the existing columns, so Production Queue Status, Queue by Barangay, and Queue Aging / SLA remain available. Monthly ID Output clearly reports that the migration is needed until completion timestamps can be recorded. Historical Completed rows without timestamps remain excluded rather than assigned guessed dates.

## Multi-provider AI analytics

- **Provider order:** Groq is primary, followed by Cerebras and OpenRouter. If all configured providers fail or reach their limits, the dashboard displays its existing live-data fallback summaries.
- **Configuration:** Set `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `OPENROUTER_API_KEY` in the backend environment. Optional model overrides are `GROQ_MODEL`, `CEREBRAS_MODEL`, and `OPENROUTER_MODEL`. Defaults are `openai/gpt-oss-20b`, `gpt-oss-120b`, and `openrouter/free`, respectively. Never place API keys in browser code or commit them.
- **Data flow:** The browser posts precomputed aggregate analytics to the backend. The backend removes or rejects personal applicant fields as appropriate, then sends only the sanitized aggregate metrics to the first available AI provider. The providers return JSON insights which are validated before display.
- **Fallback behavior:** Provider failures, rate limits, timeouts, invalid JSON, and missing keys trigger the next provider in order. If no provider succeeds, the fixed live-data summaries remain visible.
- **Caching:** Successfully validated insights are cached for six hours per analytics snapshot in the running backend process.

## PDF report

The PDF report button opens the browser print dialog with an analytics-only print layout; staff select **Save as PDF**. The visible report contains the displayed validated AI text or its fixed live-data fallback.

## Test plan (not yet executed)

1. Compare the total and five status counts against a Supabase `GROUP BY print_status` query and a sample verified by ID Maker staff. Confirm the five counts plus Unrecognized equal Total applications.
2. Compare active total against Queued + In Production. Confirm Printed, In Transit, and Completed are excluded.
3. Verify stage shares and barangay shares divide by total applications; verify aging percentages divide by active queue.
4. Use controlled timestamps at 24 hours, just over 24 hours, 48 hours, and just over 48 hours. Confirm each record appears in exactly one bucket and the three age buckets plus Unknown equal active queue.
5. Run the read-only timestamp-quality query above; compare missing/future counts and oldest timestamp with staff’s Supabase records. Do not edit those records during this check.
6. Verify barangay ordering and top-three share against a manual grouped count. Confirm missing barangay data prevents a claim rather than appearing as a real barangay.
7. Verify six monthly counts against rows with `completed_at`; compare latest and previous month counts. Confirm old Completed records without timestamps cause a no-data/incomplete state, not a guessed month.
8. With Gemini configured, inspect one response per card and compare all numbers to the exact submitted JSON. Confirm code-set status labels do not come from Gemini.
9. Send controlled invalid responses to the validator: unsupported number (`**99% ...**` when 99 is absent), incorrect bold lead, the phrase `should increase`, and a 46-word output. Confirm each is rejected, fallback is displayed, and one backend rejection log is recorded for that card.
10. Test missing/invalid Gemini key, API error, malformed JSON, and timeout. Confirm fallback text remains visible, marked “Generated from live data,” and does not expose applicant data.
11. Verify Loading, empty, incomplete, and API-error states for all four cards and insights; verify dark/light contrast, mobile stacking, and PDF print output.
12. Have ID Maker staff compare a selected refresh’s displayed totals, rankings, ages, completion months, and summaries with their own records; record the date, sample size, disagreements, validation-failure count, and examples of rejected outputs.

No staff validation, live data audit, or test execution is claimed by this implementation note. The above is the planned evidence to collect before a capstone presentation.

## Likely panel questions

| Question | Suggested answer |
| --- | --- |
| Where do 24h/48h come from? | They are configurable project thresholds used to make age groups understandable. They are not represented as an official OSCA policy or contractual SLA; staff should approve them for the project. |
| How are totals computed? | One successful queue response is counted once. Each status count is grouped from `print_status`; active is exactly Queued plus In Production. Stage and barangay shares use total queue applications; aging shares use active queue. |
| How do you know AI did not invent a number? | The application computes the values first. The AI receives only those values. Before display, the backend rejects any number not in the submitted JSON and requires the bold lead to exactly match the computed lead. |
| Why use AI? | It makes precomputed figures easier to read as short natural-language summaries. It does not improve the calculation, detect causes, predict outcomes, or make workflow decisions. |
| What if Gemini is unavailable? | The card shows a fixed text template generated from the same computed data. If the data is incomplete, it shows “No data available for this period” instead of making a claim. |
| How were the insights validated with ID Maker staff? | The planned validation compares card figures and generated/fallback text with Supabase records and staff records for a documented sample. This review has not yet been completed and must be recorded before presenting it as validated. |

## References

- [Gemini Generate Content API](https://ai.google.dev/api/generate-content)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API key guidance](https://ai.google.dev/gemini-api/docs/generate-content/api-key)
