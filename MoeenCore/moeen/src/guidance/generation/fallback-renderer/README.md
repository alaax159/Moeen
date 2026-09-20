# fallback-renderer — GN-3 T2

The answer a patient receives when no generated answer may be shown.

No model, no database, no network, no clock, no randomness. The same finding
set always renders the same bytes.

## What it says

```
Here is a summary of your latest medication safety check.

Medicine interaction: the check flagged a possible interaction between medicines on your list (rated moderate).

Overall, this check is rated moderate.

Please contact your doctor or pharmacist about this check when you can.

Whether anything about your medicines should change is a decision for your doctor or pharmacist.
```

Three things, in order: **what was detected** (a fixed sentence per finding
type), **its severity** (the engine's resolved value, copied), and **the
referral line** (a lookup on that same severity).

Every sentence lives in `fallback-copy.ts`. Nothing is interpolated except
values the deterministic engine produced — a severity word, a finding type, a
count.

## Three rules for editing the copy

1. **Urgency is graded by severity, never by wording.** `REFERRAL_LINE` is a
   lookup table keyed on the value the engine resolved. Deciding how worried a
   patient should be is exactly what the validator's diagnosis rule stops a
   model from doing; doing it here by hand would be the same mistake with a
   nicer author.

2. **`SafetyFinding.rationale` is never rendered.** It is free text written for
   a clinical reader and it has not been through the response rules. Putting it
   in front of a patient would route unvalidated prose around the validator, on
   the exact path that exists because validation failed.

3. **The fallback has to pass GN-3's own validator.** Every rendering the
   lexicon can produce is run through the real rules in
   `fallback-renderer.validator-safe.spec.ts`, with zero citations — the
   strictest configuration those rules ever run in. A copy edit that reads well
   but says "take it as normal until you speak to your doctor" fails there, by
   name.

## Totality

Every input produces text: no safety check, no findings, several findings of
one type, a finding type the lexicon has never heard of, a severity value it
does not know, a severity that contradicts its own findings. Nothing throws and
nothing returns an empty string, because this is the code path that runs when
something has already gone wrong.

Grouping by finding type (not by finding) is what bounds the output: four types
is the ceiling, so the text cannot grow past the validator's length bound
however many findings the engine resolved.
