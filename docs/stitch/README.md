# Stitch UI reference

This directory preserves the generated Stitch design that informs the incident
workspace UI.

## Source

- Stitch project: `One Invoice — Track 3`
- Project ID: `12998814869838747878`
- Generated screen ID: `4f297df2ee3c4a998e03e1aa8d95f878`
- Design system: `Terminal Protocol`
- Design-system asset: `assets/1528ad31a7df4756a2e591bbadb05bcb`
- Generated screen size: `2560 × 3606`

## Files

- `incident-workspace.html` — the generated static Stitch screen. It uses the
  Tailwind CDN, Material Symbols, Inter, and JetBrains Mono, so it is a visual
  reference only and is not served by the application.
- `incident-workspace.png` — the generated screenshot used for comparison.

## Implementation note

The production React workspace uses CSS Modules and real fixture data. The
Stitch layout, palette, rail navigation, policy strip, card hierarchy, and
monospaced telemetry treatment were adapted into
`src/components/incident-workspace.tsx` and
`src/components/incident-workspace.module.css`. Approval, preparation,
execution, evidence-refresh, and demo-driver controls remain disabled. The only
enabled action is the fixture analyser's `Re-analyse complaint` request.
