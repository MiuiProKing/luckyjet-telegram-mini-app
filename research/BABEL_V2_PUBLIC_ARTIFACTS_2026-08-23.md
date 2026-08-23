# BABEL V2 / Lucky Jet — verified public artifacts (2026-08-23)

This manifest records public-only artifacts. No credentials, tokens, session IDs, private endpoints, or access-control bypass material is included.

## Confirmed BABEL/BBSY artifacts

### PRO4 round-count rule
Public Telemetr archive of BABEL SEY contains the explicit instruction:

> Dans 5 à 7 jeux sur lucky jet chercher côté 10X à 30X

Source: https://telemetr.io/uz/cc/1YaeiK

Interpretation: this is a confirmed published heuristic/output instruction tied to BABEL SEY. It says to look for 10X–30X within 5–7 Lucky Jet games. It is not source code and does not prove how the window is calculated.

### PRO4 target / insurance / time-window examples
Same public archive family exposes examples including:

- 14X target / 3X assurance / 19:03–19:04
- 15X target / 3X assurance / 19:12–19:13
- 15X target / 3X assurance / 19:34–19:35
- 15X target / 3X assurance / 19:45–19:46
- 20X target / 4X assurance / 20:00–20:01
- 20X target / 4X assurance / 20:10–20:11
- 50–70X target / 10–20X assurance / 19:27–19:30
- 50–70X target / 10–20X assurance / 19:40–19:43
- 50–70X target / 10–20X assurance / 19:52–19:54
- 50–100X target / 10–20X assurance / 19:59–20:01

Sources:
- https://telemetr.io/uz/cc/1YaeiK
- https://telemetr.io/ar/channels/1824595312-babelseypro235
- https://telemetr.io/en/channels/1824595312-babelseypro235

These are published signal outputs, not recovered source formulas.

### Current V2 navigation post IDs
Public Telemetr redirect metadata resolves the current BABEL tutorial/navigation links to exact Telegram post IDs:

- View all robots: https://t.me/babelseyy/30125
- Activate Lucky Jet grosse-cote bot: https://t.me/babelseyy/30976
- Activate app: https://t.me/babelseyy/31025
- Create 1WIN/1XBET account: https://t.me/babelseyy/30962
- How to play predictions: https://t.me/babelseyy/31037
- How to use Telegram bots: https://t.me/babelseyy/30912

Archive surface: https://tlmtr.io/en/channels/1824595312-babelseypro235/posts

### V2 public lineage statement
Current public archive states `NOUVEAU ROBOT DE PRÉDICTION 1WIN V2` and says the new V2 exposes more than six bots for free.

Source: https://tlmtr.io/en/channels/1824595312-babelseypro235/posts

### Website/app feature parity statement
A public BABEL SEY archive contains the announcement `LA MISE A JOUR DU SITE EST TERMINÉE` followed by the explicit statement that there are more functions/new features and that **what is in the application is also on the website** (`ce qui se trouve dans l’application se trouve sur le site`). It names the public site as `allpredictor.com`.

Source: https://telemetr.io/uz/cc/1YaeiK

Why it matters: this is direct public lineage evidence that at least one AllPredictor release intentionally mirrored app functionality onto the public website. It strengthens the case for recovering prediction UI/client logic from public site assets/history rather than assuming it existed only inside the Android/iOS package. It does **not** prove that every server-side algorithm or private service was exposed client-side.

### Automatic-prediction channel announcement
The same public BABEL SEY archive contains an announcement that regular predictions would be sent three times per week, and that a **new channel** had been created for `prédictions automatique tous les jours` (automatic predictions every day). The indexed archive does not expose a reliable destination handle for that new channel in the text currently retrievable, so no unverified handle is recorded here.

Source: https://telemetr.io/uz/cc/1YaeiK

Interpretation: confirms a separate automatic-prediction distribution branch existed publicly in the BABEL lineage, but its exact channel identity is not yet verified.

## Related but NOT confirmed BABEL source code

A public myCompiler Python artifact titled `Lucky jet predictor` was found with deterministic history handling plus random target generation. It uses a saved history of up to 50 values, moving average logic, dynamic bounds `max(2.0, avg*0.8)` / `min(25.0, avg*1.5)`, a random uniform target, assurance `target*0.75`, and a trend detector using ±20% around the moving average.

Source: https://www.mycompiler.io/view/BzFpu4fW4s2

Important: no public evidence currently links this anonymous code to BABEL SEY / AllPredictor. Treat it only as a related public Lucky Jet predictor artifact, not original BABEL logic.
