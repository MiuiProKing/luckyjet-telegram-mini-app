# Public artifact: Rolandsih/PredixBot

Source: https://github.com/Rolandsih/PredixBot/blob/cdebaaf8de67cf04c1c21351d03b4b5da9b40759/index.html

Verified public artifact discovered during BABEL/Lucky Jet V2 lineage research.

## Confirmed facts

- Public HTML/JS utility titled `Crash Gateway JSON → Liste horodatée`.
- Default public history URL embedded in the page:
  `https://crash-gateway-cc-cr.gamedev-tech.cc/history?id_n=1play_luckyjet&id_i=1&round_id=3439a721-161a-402d-b15a-f9227d25fef4`
- The page fetches the supplied URL with browser `fetch(..., {mode: "cors"})`.
- Coefficient extraction prefers `top_coefficient`, then `final_values[0]`.
- If an initial date is found, the converter emits `YYYY-MM-DDTHH:mm:ss | coefficient` rows.
- The converter advances the synthetic timestamp by exactly one minute for each history item.
- This artifact is a history converter / formatter, not a verified BABEL Predictor V2 prediction algorithm.

## Relevance to analysis reconstruction

This independently confirms a public Lucky Jet implementation using the same `crash-gateway-cc-cr.gamedev-tech.cc/history` surface seen in `Michee229/Luckyjet_prediction`. It also confirms field names `top_coefficient` and `final_values` in a second public repository.

No credentials, Telegram tokens, passwords, API keys, or session secrets were copied into this manifest.
