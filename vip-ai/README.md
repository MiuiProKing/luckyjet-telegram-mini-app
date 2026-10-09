# VIP AI · Lucky Jet

Separate experimental branch. Open `vip-ai/index.html` through raw.githack; the personal BeeAI access fragment is provided privately and is never committed.

The feed reads only current cloud LIVE rows from the new Supabase project. Historical archived rounds remain available on the original page. The original classic calculation blocks are unchanged; `classic.js` contains the same pure evaluator used by the deployed BeeAI service. Numeric inference uses the frozen Logistic/CatBoost/LightGBM/XGBoost artifacts for targets 10, 20, 50 and horizons 1, 3. Target/horizon pairs cannot be substituted for each other. The artifacts remain unpromoted because source order and advantage are not certified.

The VIP panel reuses the deployed `luckyjet-beeai` endpoint. Gemini's API key stays in the existing Supabase server secret. No browser Gemini API call, game credential, personal access code, or management token is committed. Shared BeeAI settings apply to existing pages too.

“Enable VIP AI” preserves existing user knowledge, adds a bounded anchored model context, and enables the existing server scheduler. It does not launch a second collector or a second worker. Auto-sync writes at most once per 30 seconds after a changed anchor while this tab is visible. Server classic analysis and Gemini continue without the PC after enabling. Browser-provided model snapshots stop updating when the page closes; the AI is instructed to ignore a snapshot if its anchor differs. This instruction is supplied as context, not a server-enforced guarantee that Gemini used a model.

Main targets may be 10× or greater over 1–3 future rounds. The smaller “insurance” exit target is chosen by Gemini from 1.5, 2, 3, 5 using historical frequencies and the classic formula. It is displayed only if explicitly present in the recorded AI explanation and below the main target; otherwise the panel reports no lower target. It is not a guarantee or an independently registered successful prediction. No stake amount or financial action is generated.

Registration and rule-window times use Europe/Kyiv. The rule window is an approximate calculation, separate from the AI's next-round horizon. Expired windows, already reached targets, lost anchors, stale reports, gaps, errors and incomplete warmup suppress future signals. The journal keeps cloud hits, misses, unknown and late outcomes with IDs and actual coefficients. No re-scoring historical results as future hits.

Checks: `node vip-ai/tests/vip-ai.test.cjs` (pure calculations, gates, model anchoring, knowledge preservation, secret exclusion and browser fixture); `node vip-ai/tests/cloud-read.cjs` (read-only public cloud API). These do not verify Gemini quota or authenticated inference and do not prove predictive accuracy.
