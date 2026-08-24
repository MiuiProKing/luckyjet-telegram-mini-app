# BABEL V2 public artifact delta — 2026-08-24 10:40 Europe/Kyiv

## Newly verified public artifact

Source: public Telemetr archive of BABEL SEY / @couponfiablexbet

Public source:
- https://telemetr.io/uz/cc/1YaeiK/
- Mirror: https://telemetr.io/ar/cc/1YaeiK/

### Confirmed GRAND/PETIT signal sequence

The archive exposes a contiguous sequence of Lucky Jet GRAND/PETIT outputs associated with a bot update/demo:

- GRAND: target 21.97x, assurance 5.38x, confidence 75%, time 08:54-08:55
- PETIT: target 1.88x, confidence 57%, time 09:02
- GRAND: target 25.48x, assurance 4.43x, confidence 62%, time 09:06-09:07
- GRAND: target 16.50x, assurance 4.51x, confidence 66%, time 09:31-09:32
- GRAND: target 49.54x, assurance 5.18x, confidence 73%, time 10:15-10:16
- GRAND: target 39.68x, assurance 4.86x, confidence 76%, time 10:24-10:25

The same archive also exposes validation/result messages:

- target 25.48x not reached; assurance 4.43x validated; Lucky Jet crash 13.07x
- target 16.50x not reached; assurance 4.51x validated; Lucky Jet crash 7.67x
- target 49.54x not reached; assurance 5.18x validated; Lucky Jet crash 10.86x
- target 39.68x not reached; assurance 4.86x validated; Lucky Jet crash 12.87x

### Structural observations

Confirmed from output format only:

1. GRAND emits four fields: target, assurance, confidence percentage, and a 1-minute time window.
2. PETIT in this sample emits target, confidence percentage, and a single minute.
3. GRAND validation is two-tiered: if the principal target is missed but the crash exceeds assurance, the result is explicitly classified as assurance validated / partial gain.
4. GRAND targets vary widely (16.50x–49.54x here), while assurance remains clustered near roughly 4.4x–5.4x.
5. Confidence varies independently of target magnitude in this sample; therefore the visible output does not support a simple monotonic `higher target = higher/lower confidence` rule.

### Inference — not confirmed formula

The data is consistent with separate target and insurance selection layers rather than a fixed insurance percentage. For example, insurance/target ratios vary strongly across the sample, so a constant multiplier is unlikely. This is an inference from published outputs, not recovered source code.

No original BABEL prediction function, weights, thresholds, or /predict endpoint were recovered in this pass.

## Safety

No credentials, Telegram bot tokens, session IDs, customer IDs, passwords, or private endpoints are stored in this manifest.
