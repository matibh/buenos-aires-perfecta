# Urban fidelity and performance plan

## Target

Build Buenos Aires Perfecta as a geographically faithful, walkable reconstruction. The source of truth is the measured city geometry and individually verified places, not procedural blocks or guessed street layouts.

## Evidence levels

Every world feature should carry its source and evidence class:

- **Official geometry:** CABA parcels, Tejido Urbano volumes, street centerlines, public-space polygons and official geospatial services.
- **Mapped feature:** OpenStreetMap building/road/POI geometry and tags. OSM is useful but community-maintained and unevenly complete.
- **Visual reference:** licensed street-level or aerial imagery, recorded with source, date, and usage terms.
- **Manual reconstruction:** measured against visual references; never label as official or verified unless it is.

A missing feature must remain marked as unknown instead of silently becoming an invented exact detail.

## Commercial places

The Obelisco extractor now requests OSM shop, office, tourism, craft, healthcare and selected commercial amenity features. It preserves coordinates, name/brand, category, cuisine, operator, opening-hours, address and website where mapped. The extracted feature count and named-feature count are emitted separately.

This is a discovery layer, not a completeness guarantee. The CABA Locales Census is the authoritative lead for commercial stock, but its public information page describes field collection and does not itself provide a downloadable georeferenced establishment list. The official interactive map provides facade photographs and parcel context; its terms and technical access must be checked before any imagery is reused in a game.

## Visual reconstruction pipeline

1. Lock the street network, parcel footprints, public-space boundaries and measured heights.
2. Build a per-block inventory of named businesses and street addresses.
3. Attach each business to the correct parcel and street-facing frontage; resolve duplicate POIs.
4. Gather permitted facade references for each frontage. Record date and provenance.
5. Reconstruct individual facade modules: doors, windows, shutters, awnings, signs, materials, colors and lighting.
6. Manually model landmarks and distinctive corners against measured references.
7. Compare in-game screenshots from fixed camera positions with the reference imagery and record deviations.

Brand marks and photographs must only be used where the source and licence/permission allow it.

## Runtime performance budget

- Use instancing for repeated street furniture and facade elements.
- Merge static geometry by material and spatial chunk, not into one city-wide mesh.
- Frustum-cull chunks and use distance-based facade detail (full storefront near the player, simplified silhouettes farther away).
- Avoid expensive real-time shadow maps across the entire city; reserve baked or local shadows for landmarks and near-field objects.
- Adapt render resolution to sustained frame time rather than rendering at maximum device pixel ratio unconditionally.
- Keep collision queries spatially indexed and use simple collision proxies, not render meshes.
- Load city chunks progressively and dispose geometry/materials when chunks leave the active region.
- Profile draw calls, triangles, memory and frame-time on desktop and mobile before claiming an FPS target.

## Current implementation notes

- The renderer now caps device pixel ratio at 1.5, adapts resolution based on sustained frame time, disables global shadow maps, and does not run a continuous render loop on the title screen.
- Commercial POIs are being captured as georeferenced data, but they are not yet a verified facade reconstruction.
- Existing procedural facade windows, guessed road widths and any manually added street elements remain provisional until checked against visual references.
