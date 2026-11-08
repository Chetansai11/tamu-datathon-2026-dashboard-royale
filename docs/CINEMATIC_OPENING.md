# Gilded Ace cinematic opening

## Current opening: the royal deal

An original native SVG/CSS deck falls through a dark graphite stage. The king and joker remain readable in the foreground; the ace emerges from behind them, then dissolves into the same inflated particle spade used in the overview. The particles mix approximately 70% warm gold with 30% silver-white, and the camera zoom blends directly into “Read the floor. Find the signal.” No scrolling or media download is required.

The full active sequence lasts **4.8 seconds**, with the dashboard blend beginning at 3.55 seconds. The stage uses existing local IBM Plex typography and preserves the approved desktop layout. All artwork and particle geometry are native code; this revision uses no generation service or paid assets.

The surrounding deck contains **24 two-sided cards on desktop and 16 on narrow screens**, with mixed ranks and all four suits. Independent pitch, yaw, roll, depth, drift and fall speed create an irregular tumble; fixed seeds keep replay consistent. The king and joker retain readable portraits at stronger oblique angles, while the surrounding cards alternate between their faces, edges and patterned backs. Side lanes leave the central ace reveal clear, and the extra cards do not extend the opening.

Each card uses two independent flat face planes with matching browser-managed transform tracks and opposite normals. This avoids expensive animated nested 3D groups; hidden reverse faces still flip correctly. Shared SVG symbols reuse the patterned back and twelve rank/suit combinations, reducing duplicated artwork in the document. There are no per-frame face swaps or new external assets.

## Interaction and motion

- Homepage and `#verdict` open automatically. Analytical deep links bypass the introduction.
- The dashboard loads underneath. Its particle spade remains formed through the final blend; headline and metric cards enter during the reveal.
- A small close icon replaces the prominent “Skip to dashboard” button. Escape, pause/play and replay remain available.
- System reduced motion and the saved motion-off preference enter the dashboard immediately.
- Manual pause and hidden tabs suspend the active timeline. Completion, close and route changes release the overlay, scroll lock and keyboard focus.
- Native SVG particle artwork remains available without WebGL. No video, poster, autoplay permission or network media readiness is required.
- All seven analytical views, data and recommendations are unchanged.

## Historical generated assets

The earlier performer opening was replaced at the user's request. Its original assets remain recoverable in Git history; they are excluded from the current public build and submission bundle. The following records document that earlier revision, rather than the currently displayed animation.

## Prepared generation prompt

One continuous premium cinematic shot for a dark navy and gold casino analytics website. A fictional adult card illusionist in a tailored black suit, centered in a seamless dark midnight-navy studio, elegantly flourishes a single ivory ace-of-spades card, then gently throws that card toward the camera in slow motion. The camera follows the spinning card until it floats front-facing. Its gold spade suit symbol extrudes out of the card into a luminous solid gold emblem, suspended in the air. The card and performer recede into darkness while the gold spade rotates slowly, creating a clear final beauty state. First third: human card flourish. Middle third: thrown card flight toward the lens. Final third: gold spade emerges. Black/navy seamless background #070b18, gold #f4c66b and subtle cyan rim lighting. Clean negative space, focal action center-safe for mobile crop, shallow depth of field, anatomically correct hands, realistic card physics, polished luxury film lighting. Slow continuous movement, no cuts, no camera shake, locked exposure, minimal motion blur. No captions, logos, watermarks or sound.

## Asset provenance

Both assets were generated for this project on November 7, 2026, with the user's Higgsfield Free Plan. The original files are retained without raster editing. Dark CSS masking blends the frame into the opening and covers incidental generated lettering in its left margin.

| Asset | Model | File | Size |
| --- | --- | --- | --- |
| Performer starting frame | Higgsfield Soul Cinema, 16:9, 2K | `web/public/media/ace-illusionist-poster.png` (Git history) | 1,356,236 bytes; 2048×1152 |
| Card motion | Wan 2.2 Fast, General preset | `web/public/media/ace-illusionist.mp4` (Git history) | 5,369,700 bytes; decoded 1280×720; 5.366667 seconds |

Higgsfield asset IDs: image `50f2fc64-0303-420e-b6fb-7324770d0f2b`; film `f6f13cf6-de30-4f75-b4e1-05e94791e301`. Displayed generation costs were 0.125 for the image and 5 for the film; the account remained on the Free Plan. An initial video attempt without the required starting image was rejected and produced no video.

The film prompt was shortened to a single card flourish and throw. The gold emblem emergence is implemented in SVG/CSS. Assets use local relative paths; the delivered website does not call Higgsfield or consume generation credits when viewed.

## Delivery checks

Checks cover the bounded 4.8-second sequence, keyboard access, pause/resume, hidden-tab suspension, replay, reduced motion, cleanup, concurrent data loading and focus handoff. Browser review covers actual particle rendering, desktop/mobile composition and automatic entry. Production and offline checks remain part of publication; the existing hosted audience is preserved.

## Smoothness revision

The original production opening showed a 666.8 ms maximum requestAnimationFrame gap on a cold desktop load and a 266.7 ms maximum gap on replay in the local browser check at 1440×1000. These are main-thread frame intervals, not a direct measurement of compositor presentation.

The revision uses browser-managed transform/opacity animation tracks for the cards, continuous falling paths without delayed starts, persistent particle GPU resources, cached geometry, and no GPU drawing while the cinematic particles are invisible. The dashboard hero alone responds to the opening handoff; unrelated analytical charts do not rerender for that transition.

Location lookup during aggregation now uses an index while retaining first-match semantics. In three alternating warmed Node 24 runs, full-period plus six monthly aggregates had a median of 719.14 ms before and 428.95 ms after (40.4% less CPU). Exact complete-output comparisons passed for 72 real-data selections and five location edge cases. This is an aggregation benchmark, not a browser frame-rate guarantee.

`web/performance.html` is a local Vite profiling entry, excluded from the normal production build. Its hidden `cinema-frame-report` output records frame intervals by phase and long tasks without changing application clocks. `web/tests/particles.mjs` verifies resource persistence through pause, hidden tabs, replay, hero handoff and WebGL context recovery. The standard cinematic and dashboard interaction checks remain required.

After the revision, the same production-browser check measured a 66.6 ms maximum main-thread interval on replay (previously 266.7 ms), with no long tasks on that replay. Its reveal phase had a 17 ms maximum interval (previously 250 ms). Initial data loading still produced a 450.2 ms main-thread interval, reduced from 666.8 ms; the card tracks run independently on the browser animation timeline during that work. Desktop and mobile browser checks confirmed the native animation path, frozen pause position, resumed handoff and no horizontal overflow. These local observations do not guarantee identical performance on every device.

The later 24-card expansion was checked separately at 1440×1000. Its final production replay measured a 16.7 ms median frame interval, 16.9 ms at the 95th percentile, and 183.4 ms maximum during initial setup; the ace, zoom and reveal phases had no intervals above 33.4 ms. A same-session replay of the preceding 10-card release measured 16.7 ms median, 16.8 ms at the 95th percentile and 166.7 ms maximum. Brief setup spikes remain; these local main-thread observations are not a universal frame-rate guarantee. Build, offline boot and cinematic lifecycle checks passed after the expanded deck changes.
