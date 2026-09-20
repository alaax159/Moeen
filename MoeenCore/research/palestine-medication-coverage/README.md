# Palestine Medication Search Coverage Dataset

Retrieved on: 2026-08-28

## Acquired public sources

### Palestinian registered products

- Official source: https://www.pharmacy.moh.ps/service/getRegisterProducts
- Full registry: `palestine-registered-products.json`
- Human medicines only: `palestine-human-drug-products.json`
- Human medicines CSV: `palestine-human-drug-products.csv`
- Full registry records: 14,837
- Records classified as `Human Drug Products`: 2,510

The human-medicine files contain:

- product name
- manufacturer
- dosage form
- category
- local/imported classification
- Palestinian registry product ID

### Palestinian Essential Medicines List 2022

- Official source: https://site.moh.ps/Content/app/durg.pdf
- Original document: `palestinian-essential-medicines-list-2022.pdf`
- Searchable text: `palestinian-essential-medicines-list-2022.txt`
- Published scope: 458 active pharmaceutical ingredients and 647 pharmaceutical products

### Palestinian Health Annual Report 2024

- Original document: `palestinian-health-annual-report-2024.pdf`
- Searchable text: `palestinian-health-annual-report-2024.txt`

The report contains aggregate information such as pharmaceutical institutions and expenditure. It does not provide a public medicine-level table of prescription, dispensing, procurement, or sales volumes.

## Coverage metrics

Two public coverage metrics can be measured now:

1. Registry coverage = searchable registered human products / 2,510.
2. Essential-list coverage = searchable essential products / 647.

The target `>= 90% of commonly used Palestinian human medications` requires an additional weighted usage dataset:

`weighted coverage = usage volume of searchable medicines / total medicine usage volume`

That dataset must contain at least:

- medicine name or local code
- prescription, dispensing, procurement, or sales count/quantity
- reporting period
- source institution or sector

Without medicine-level usage volumes, the public sources can measure registered and essential-medicine coverage, but cannot objectively define or prove "commonly used" coverage.
