# Gilded Ace cinematic opening

Status: generated through Higgsfield's signed-in browser interface and integrated into the existing dashboard. The native plugin endpoints returned `Unknown tool`, so the browser workflow supplied the assets. Only the account's included Free Plan credits were used; no subscription, credit purchase, or upgrade was made. The account displayed 10 credits before generation and 4 remaining afterward (displayed whole-credit balance).

## Creative direction

A 5.37-second generated shot shows a fictional adult card illusionist handling and releasing an ace toward the viewer. Scrolling turns an original native 3D card and lifts a gold spade from its face, ending in the dashboard's visual identity. The footage belongs in the opening; the analytical views retain their readable navy surfaces. The native overlay supplies a controlled, sharp reveal; it is not part of the generated footage.

The palette is midnight navy `#070b18`, soft gold `#f4c66b`, and restrained cyan rim light. Keep the performer, hands and card center-safe for mobile. A dark background and gradient masking provide visual blending; this is not a promise of an alpha-channel video.

## Prepared generation prompt

One continuous premium cinematic shot for a dark navy and gold casino analytics website. A fictional adult card illusionist in a tailored black suit, centered in a seamless dark midnight-navy studio, elegantly flourishes a single ivory ace-of-spades card, then gently throws that card toward the camera in slow motion. The camera follows the spinning card until it floats front-facing. Its gold spade suit symbol extrudes out of the card into a luminous solid gold emblem, suspended in the air. The card and performer recede into darkness while the gold spade rotates slowly, creating a clear final beauty state. First third: human card flourish. Middle third: thrown card flight toward the lens. Final third: gold spade emerges. Black/navy seamless background #070b18, gold #f4c66b and subtle cyan rim lighting. Clean negative space, focal action center-safe for mobile crop, shallow depth of field, anatomically correct hands, realistic card physics, polished luxury film lighting. Slow continuous movement, no cuts, no camera shake, locked exposure, minimal motion blur. No captions, logos, watermarks or sound.

## Integration contract

- The person and throw come from the generated film. Native SVG/CSS supplies a sharp final card and spade transition.
- Use a sticky opening section, without scroll locking or mandatory viewing. Keep skip, pause and replay controls available.
- Feed the existing motion preference into the opening. System reduced motion uses a static composition and removes the extended scroll distance.
- Pause video when hidden or outside the viewport. Dispose event listeners, animation frames and observers on unmount.
- Keep the seven investigation views and all analytical calculations intact.
- Use relative `media/...` paths for assets so the downloadable `site/offline.html` can use companion media files. Missing media must have a visible fallback.
- Start the film independently while dashboard data loads. Route changes dismiss the introduction, and the topbar replay control reopens it on desktop and mobile. Skip transfers keyboard focus to the dashboard.

## Asset provenance

Both assets were generated for this project on November 7, 2026, with the user's Higgsfield Free Plan. The original files are retained without raster editing. Navy CSS masking blends the frame into the opening and covers incidental generated lettering in its left margin.

| Asset | Model | File | Size |
| --- | --- | --- | --- |
| Performer starting frame | Higgsfield Soul Cinema, 16:9, 2K | `web/public/media/ace-illusionist-poster.png` | 1,356,236 bytes; 2048×1152 |
| Card motion | Wan 2.2 Fast, General preset | `web/public/media/ace-illusionist.mp4` | 5,369,700 bytes; decoded 1280×720; 5.366667 seconds |

Higgsfield asset IDs: image `50f2fc64-0303-420e-b6fb-7324770d0f2b`; film `f6f13cf6-de30-4f75-b4e1-05e94791e301`. Displayed generation costs were 0.125 for the image and 5 for the film; the account remained on the Free Plan. An initial video attempt without the required starting image was rejected and produced no video.

The film prompt was shortened to a single card flourish and throw. The gold emblem emergence is implemented in SVG/CSS. Assets use local relative paths; the delivered website does not call Higgsfield or consume generation credits when viewed.

## Delivery checks

Completed checks: TypeScript and production build; seven-route interaction regression including introduction skip/reopen and keyboard focus; focused cinematic tests for pause/play/replay, inert chapters, failed media, hidden-tab pause and cleanup; production offline startup with embedded official totals. Browser inspection at 1440×1000 and 390×844 verified real MP4 decoding, the performer/card motion, scroll-driven gold spade emergence, readable text, no horizontal overflow, skip/replay, and motion-off with no video element. The existing hosted audience is preserved.
