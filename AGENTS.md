# Buenos Aires Perfecta — Agent Instructions

## Mission
Build a convincing, geographically faithful, performant 3D reconstruction of the Obelisco and its immediate surroundings in Buenos Aires. The project is not a generic city sandbox.

## Non-negotiable geographic scope
- Work ONLY on the Obelisco and its immediate surroundings: Plaza de la República, Avenida 9 de Julio, Avenida Corrientes, and directly surrounding blocks/streets.
- Palermo is explicitly out of scope. Never add Palermo or expand the world to other neighborhoods.
- Preserve the current coordinate origin, map extent, and verified source coverage unless a task explicitly requires a carefully justified correction within this same area.

## Accuracy and provenance
- Prefer official Buenos Aires Ciudad/CABA GIS data and verified OpenStreetMap data already used by the project.
- Never invent a business, pizzeria, brand, address, sign, facade, building height, street, or landmark and present it as real.
- Distinguish verified real-world data from procedural visual approximation. Label or document approximations honestly.
- Do not replace local businesses with fabricated generic names. If evidence is missing, omit the claim or keep the visual generic and unnamed.
- Preserve required attribution and source licensing.

## Performance
- The current FPS is reported by the user as excellent. Treat performance as a protected acceptance criterion.
- Preserve chunk rendering, distance culling, fog, instancing, collision spatial hashing, and current pixel-ratio controls.
- Avoid per-frame allocations, excessive draw calls, high-poly meshes, large uncompressed textures, and unnecessary shadows.
- Every visual improvement must be chunk-aware and should reuse geometry/materials/instances where practical.
- Do not claim a measured FPS improvement unless an actual repeatable benchmark was run.

## Engineering workflow
- Inspect the existing implementation and data model before editing.
- Make one coherent, limited improvement per autonomous iteration. Do not perform broad refactors.
- Prefer measurable improvements to geometry accuracy, facade detail, street-level authenticity, lighting/material realism, and interaction polish.
- Preserve working behavior and existing data contracts.
- Do not modify .github/workflows/, .github/codex/, or this AGENTS.md.
- Do not change dependency versions or add packages unless absolutely necessary; explain why in the final report.
- Never commit secrets, credentials, generated logs, caches, or temporary artifacts.
- Do not overwrite or regenerate public/data/obelisco-world.json manually. The GIS workflow owns this generated file.
- Never bypass failing tests or weaken validations merely to get a green build.

## Validation required before a change is eligible
- Run `npm run build`.
- Run `python -m compileall -q map-generator/src` when Python files are changed.
- Run any relevant existing tests or data validators discovered in the repository.
- Inspect `git diff --check` and review the complete diff for scope and accidental changes.
- If a task cannot be validated safely, do not force a patch; report the blocker.

## Visual quality priorities
1. Correct urban scale, building footprints, heights, block layout, sidewalks, and street widths from verified data.
2. Authentic Obelisco, Plaza de la República, 9 de Julio and Corrientes visual landmarks and street furniture.
3. Convincing Buenos Aires facades: varied but evidence-based window rhythm, balconies, shutters, cornices, awnings, shopfronts, signage and materials.
4. Real, verified commercial points of interest and signage only where source data supports them.
5. Natural lighting, atmospheric depth, pavement/road detail, vegetation and small environmental details.
6. Player movement, camera feel, navigation and accessibility polish.

The goal is a believable Buenos Aires place, not a colorful toy-like model. Restraint and geographic truth are more important than decorative density.
