# Worlds theatre implementation

## Visual organization
The original six actor/planet GLBs remain real 3D models. The fixed theatre adds depth-separated cardboard clouds, hanging stars, worn navy painted backdrop, wooden floor and pleated red fabric geometry. DOM captions remain outside depth of field, placed in the left reading area.

The moving actors now travel left to right through the same stage. Three themed props per actor enter vertically, accompany the actor, and retract before its exit. Themes: royal pennant, applause hands, bottles, accounting chart, lantern and map. Five supplied PNG types are reused alongside six generated PNG types. All eleven have verified alpha channels. The curtain uses physical fabric geometry/material, not a cardboard sprite.

## Continuous transitions
The existing single detached 3D rose petal retains its drop, rise, rotation and full-frame coverage. Its close-up warms into curtain burgundy before the curtain opens. After the last actor, a warm sphere remains on stage; camera push-in leads to a warm light cover and the existing Fox environment.

Fox has its own Suspense boundary so its resource loading cannot erase the outgoing theatre. The timeline waits under the nearly full warm cover only if Fox assets have not mounted. This is resource readiness, not a new reading pause.

## Files and controls
- src/three/stageMotion.ts: curtain interval 5.18–5.38; first actor 5.43; spacing .47; passage .60; prop entrance .19, retreat .72–.85 in actor progress; star 8.24; push-in 8.64–9.
- src/three/StageAssets.tsx: shared sprite materials, alphaTest and aspect ratios.
- src/three/StageCurtain.tsx: pleats, swags, cloth weave, fabric and gold edge.
- src/three/WorldPropBurst.tsx: themed sprite selection, stagger, vertical travel.
- src/three/WorldsScene.tsx: stage layout, lighting, backdrop, floor, camera, warm-star bridge and 3D depth of field.
- src/three/WorldModel.tsx and worldModelCache.ts: original GLBs and bounded residency, now staged as a parade.
- src/three/RosePetalTransition.tsx: petal-to-curtain color handoff.
- src/ui/Chrome.tsx: removes obsolete duplicate gold CSS wash.
- src/narrative.ts: actor captions shifted to the left reading area.
- src/three/Experience.tsx: Fox loading isolation and readiness gate.

## Assets
asset/worlds-theatre/brief.txt and originals/ retain the supplied brief and reference images.
asset/worlds-theatre/generated/ retains the six selected generation outputs.
asset/worlds-theatre/prompts.md contains generation prompts; manifest.json records dimensions, alpha checks and hashes.
public/textures/worlds-stage/ holds runtime copies.
asset/worlds-theatre/before/ contains backups of the principal replaced components.

## Verification
Production Vite build passes. Desktop Chrome/Playwright screenshots cover closed curtain, established stage, all six actors, warm star, push-in, warm cover and Fox.
Rose regression checks passed: cursor yaw, exactly one detached petal, rising motion, 25/25 frame sample rays covered before and after the scene boundary, replay restoration, sidebar bypass and cleanup.
Screenshots use software WebGL and are visual/behavioral verification, not a hardware performance benchmark.

The reference remains the art direction, not a claim of pixel-equivalent rendering. Current fabric folds and light treatment are procedural and simpler than the reference's photographed velvet and detailed lighting.

Final stage regression checks passed: props holding/retraction, left-to-right actor travel with a fixed stage/camera, scene/cache cleanup, actual sidebar re-entry and no console errors. TypeScript no-emit check also passed. Verification reports are in asset/worlds-theatre/verification/.
