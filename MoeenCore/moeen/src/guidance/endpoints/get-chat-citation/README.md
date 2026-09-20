# Chat citation read endpoint

`GET /chat/citations/:citationId`

This endpoint resolves the stable citation identifiers emitted by the guidance
retriever, for example `label-chunk-42`.

It returns only public medication-label evidence:

- citationId
- DailyMed setId
- label section
- the exact cited chunk text
- the corresponding DailyMed label URL

The endpoint does not return patient data and does not modify the frozen
guidance contracts.

The Expo chat client uses this endpoint when the patient taps a citation so
the citation opens with the actual source section and excerpt rather than
treating an opaque `label-chunk-*` identifier as a URL.
