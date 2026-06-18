# Intelligent Concrete Plan Reader

Open `index.html` in a browser.

## What it does

- Upload a PDF plan.
- Render PDF pages in the browser.
- Set scale by drawing a known-distance line.
- Mark concrete works using rectangle, polygon, or wall-line tools.
- Classify each markup as slab, isolated footing, pad footing, wall, column/round, or beam.
- Calculate measured area, length, concrete volume, formwork area, waste allowance, and totals.
- Estimate reinforcement weight and steel price for each element.
- Match reinforcement by tag if the uploaded PDF contains selectable schedule text such as `S1 SL82` or `F1 N12-200`.
- Use editable minimum reinforcement assumptions when no schedule/tag reinforcement is found.
- Estimate minimum manpower using editable concrete and reinforcement productivity assumptions.
- If a required parameter is missing, the app asks for it before saving the BOQ line.
- Export the BOQ as CSV.

## Reinforcement and manpower assumptions

The app is set up with editable defaults:

- Minimum slab assumption: N12 bars at 200 mm spacing, 1 layer.
- Non-slab fallback: 80 kg/m3.
- Common mesh weights are included for SL62, SL72, SL82, SL92, and SL102.
- Steel price default is an editable estimate. Update `$ / kg` to your supplier rate before relying on pricing.
- Minimum manpower uses concrete m3 per worker-day plus reinforcement kg per worker-day, then applies the minimum crew size.

## Market pricing

The app includes editable Australian market allowance fields for steel, concrete, formwork, and margin. A static GitHub Pages app cannot automatically scrape live supplier prices or commodity feeds. To keep steel price truly live, connect the app to a backend or pricing API. Until then, update the steel `$ / kg` field from your latest supplier quote or preferred Australian market source before issuing a quotation.

## Quotation

The quotation section calculates concrete, formwork, reinforcement, subtotal, safe margin, and suggested total. It also includes editable scope inclusions and exclusions. Once you upload the exact quotation form/template, the layout can be adjusted to mimic that form.

## Important limitation

This is an assisted intelligent plan reader, not a paid AI plan recognition service. It can extract concrete-related text from selectable PDF text, but scanned/image-only drawings need manual markup. Full automatic concrete detection from scanned construction plans requires an AI/OCR backend.

## Internet requirement

The app uses PDF.js from a CDN to render uploaded PDFs. It needs internet access when opening the app unless PDF.js is bundled locally in a later version.
