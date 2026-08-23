# Early Lucky Jet code-family artifacts — 2024

## Status
Public comparative artifacts only. No proof of BABEL/AllPredictor ownership or backend linkage.

## Artifact A — Lucky Jet Signal V5
Public source: https://www.mycompiler.io/view/6qnsp2Q0AwS
Date shown publicly: 2024-06-01

Observed structure:
- `minutesAvancees = 3`
- time gate: `16 <= hour < 17` => analysis/pause message
- minute gate: `13 <= minute < 14` => `/interval`
- target branch uses `random.uniform(12.00, 20.00)`
- output label: `Lucky Jet Signal V5`
- Assurance = target / 2
- Fiable = Assurance / 2
- output includes `LUCKY JET GROSSE CÔTE`

## Artifact B — anonymous July 2024 variant
Public source: https://www.mycompiler.io/view/GwiG403UWiZ
Date shown publicly: 2024-07-09

Observed structure:
- `minutesAvancees = 3`
- target range uses `hack=12.25`, `max=20.62`
- Assurance = target / 2
- Fiable = Assurance / 2
- still uses `random.uniform`

## Artifact C — mistercedric Lucky jet
Public source: https://www.mycompiler.io/view/6VBfTsArA4R

Observed trigger text:
- `Analyse des côtes en cours...`
- `/interval`
- instruction to run again after a completed 2X–10X+ round

## Related public GitHub copy
https://github.com/CedricOpoh/MISTERCEDRIC-SIGNALS/blob/2c701b19c18808c03f8e58f82a9b4e91f0222688/main%20(2).py

The GitHub copy is Aviator-labelled and uses the same template family (`Analyse...`, `/interval`, future-minute offset, target/Assurance/Fiable), but remains random-based.

## Assessment
These artifacts push the public template lineage back to at least June 2024 and show an explicit `V5` label. They do not provide the sought original deterministic BABEL V2 chain `history/API -> trigger -> GRAND/PETIT -> confidence`.

Any fake/commented API-looking strings from the public samples are intentionally omitted from this manifest.
