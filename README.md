# Intelligent Concrete Plan Reader

Open `index.html` in a browser.

## What it does

- Upload a PDF plan.
- Render PDF pages in the browser.
- Set scale by either drawing a grid/dimension arrow between two known points or entering a printed ratio such as `1:100` or `1/100`.
- Mark concrete works using rectangle, polygon, or wall-line tools.
- Use the curved/messy freehand markup tool for irregular geometry without clean edges.
- Override the measured quantity basis to use auto geometry, marked area, marked length, or a manual quantity.
- Insert common tender notes from a quick note selector to save typing.
- Classify each markup as slab, isolated footing, pad footing, wall, column/round, or beam.
- Calculate measured area, length, concrete volume, formwork area, waste allowance, and totals.
- Estimate reinforcement weight and steel price for each element.
- Choose one-way or two-way reinforcement for manual/minimum bar assumptions.
- Optionally apply editable AS 3600 tender-stage minimum reinforcement allowances when no reinforcement is shown.
- Add dowels with bar diameter, length, embedment depth, spacing c/c, epoxy brand, and epoxy allowance.
- Include saw-cut length/rate for infill slab works and add saw-cut worker-days into manpower.
- Add minimum tools and equipment allowances including tie wire, small tools, and equipment wear/damage.
- Match reinforcement by tag if the uploaded PDF contains selectable schedule text such as `S1 SL82` or `F1 N12-200`.
- Use editable minimum reinforcement assumptions when no schedule/tag reinforcement is found.
- Estimate minimum manpower using editable concrete and reinforcement productivity assumptions.
- If a required parameter is missing, the app asks for it before saving the BOQ line.
- Export the BOQ as CSV.

## Reinforcement and manpower assumptions

The app is set up with editable defaults:

- Australian concrete design basis: AS 3600 Concrete structures. Engineers Australia is a professional body; project design compliance must still be checked and certified by the structural engineer.
- The optional Australian tender minimum only applies when reinforcement is not provided by the drawing schedule or manual input.
- Default tender minimum reinforcement ratios are editable by element: slab/footing 0.15%, wall 0.25%, beam 0.25%, and column 1.00% Asteel/Aconcrete.
- Minimum slab assumption: N12 bars at 200 mm spacing, 1 layer.
- Non-slab fallback: 80 kg/m3.
- Common mesh weights are included for SL62, SL72, SL82, SL92, and SL102.
- Steel price default is an editable estimate. Update `$ / kg` to your supplier rate before relying on pricing.
- Minimum manpower uses concrete m3 per worker-day plus reinforcement kg per worker-day, then applies the minimum crew size.

## Market pricing

The app includes editable Australian market allowance fields for steel, concrete, formwork, and margin. A static GitHub Pages app cannot automatically scrape live supplier prices or commodity feeds. To keep steel price truly live, connect the app to a backend or pricing API. Until then, update the steel `$ / kg` field from your latest supplier quote or preferred Australian market source before issuing a quotation.

## Scale

Scale can be set in two ways:

- `Grid dimension`: enter the real distance between two grid lines or known dimension points, choose metres or millimetres, then draw the scale arrow on the plan.
- `Plan ratio`: enter the printed plan scale as either `1:100` or `1/100`. Both formats are read the same way.

When a PDF has selectable text, the app also scans for printed scales automatically. Plan/floor/site scales are preferred over section/elevation/detail scales when both are shown. Section/detail scales remain available in the detected scale selector so they can be used separately when measuring sections. If a line scale has selectable numeric labels, the app attempts to set scale from that bar as well.

## Quotation

The quotation section calculates concrete, formwork, reinforcement, subtotal, safe margin, and suggested total. It also includes editable scope inclusions and exclusions. Once you upload the exact quotation form/template, the layout can be adjusted to mimic that form.

## Important limitation

This is an assisted intelligent plan reader, not a paid AI plan recognition service. It can extract concrete-related text from selectable PDF text, but scanned/image-only drawings need manual markup. Full automatic concrete detection from scanned construction plans requires an AI/OCR backend.

The Australian minimum reinforcement feature is a tender-stage estimating allowance only. It is not a substitute for AS 3600 structural design, fire/durability checks, exposure classification, crack control, detailing, lap/splice rules, cover, load combinations, or engineer certification.

## Internet requirement

The app uses PDF.js from a CDN to render uploaded PDFs. It needs internet access when opening the app unless PDF.js is bundled locally in a later version.
