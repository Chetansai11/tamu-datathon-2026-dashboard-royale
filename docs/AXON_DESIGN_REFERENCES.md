# Gilded Ace: particle-stage design reference

Research date: November 7, 2026. This document records the design direction and its references; it is not a claim that the dashboard has won, or that every website on the internet was reviewed.

## Direction

Translate the supplied AXON brief into an original Gilded Ace opening: a dimensional spade assembled from warm ivory particles, a few brass highlights, and four real financial metrics floating in front of it. The opening should feel like an instrument revealing the casino floor. The analytical views remain clear, navigable and usable after the spectacle.

The supplied document is a reference, not a replacement specification. Its particle motion, quiet framing, generous negative space and technical typography are relevant. Its AXON name, torus logo, external videos, email, fixed no-scroll layout and mobile-hidden cards are not part of this product. The Gilded Ace identity, existing analysis, all four headline metrics and normal page scrolling take precedence.

## Primary references and the decisions they inform

| Reference | Relevant principle | Gilded Ace application |
| --- | --- | --- |
| [IBM Design Language: Typeface](https://www.ibm.com/design/language/typography/typeface/) | Plex provides coordinated Sans and Mono families, several weights and financial symbols. IBM points to its official GitHub distribution. | Use Plex Sans for readable headings, explanations and controls; Plex Mono for short labels, machine IDs, dates and figures. |
| [Linear: How we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | Linear describes reducing visual noise, aligning application chrome and improving hierarchy across sidebar, tabs, headers and panels. | Keep the side rail quiet, create one obvious selected state, align panel headings and reserve the strongest contrast for evidence and decisions. |
| [Carbon: Data visualization color palettes](https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes) | Carbon separates categorical, sequential and alert colors. Its dark sequential scales make larger values lighter; it discourages multiple decorative chart gradients. | Give colors stable meanings. Use a neutral-to-brass sequence for magnitude and a separate restrained status palette for loss, warning and recovery. Use labels, markers and line styles as well as color. |
| [Apple: AirPods Pro](https://www.apple.com/airpods-pro/) | The product page presents a central object, a small number of headline claims, a film entry and progressively more detailed sections. | Borrow this object-to-detail hierarchy: particle ace, four metrics, then the investigation. Keep the optional existing film separate from the primary evidence flow. This is a compositional inference, not a reuse of Apple assets or code. |

These references support different parts of the design. The particle concept comes from the supplied AXON brief; the information hierarchy and chart discipline come from the product and data-system references above.

## Color system

Use warm, almost neutral surfaces so the brass accent belongs to the casino identity rather than appearing as an unrelated glow. Avoid a global violet/cyan gradient, colored panel backgrounds and several competing accent colors. Use broad neutral areas, small deliberate brass details and status colors only where they convey analytical meaning.

| Role | Proposed color | Purpose |
| --- | --- | --- |
| Canvas | `#0a0a09` | Deep background and hero stage |
| Panel | `#171715` | Stable card and chart reading surface |
| Elevated panel | `#20201d` | Menus, tooltips and selected surface |
| Primary text | `#e9e5dc` | Warm ivory, headlines, figures and body copy |
| Secondary text | `#aba69d` | Explanations, chart labels and metadata |
| Brass | `#c4a77d` | Primary action, selected indicator and featured series |
| Boundary | `#373731` | Quiet borders; not a text color |

Calculated with the WCAG relative-luminance formula, primary text, secondary text and brass have contrast ratios of **14.28:1, 7.41:1 and 7.84:1** against the proposed panel. Against the canvas the ratios are **15.76:1, 8.18:1 and 8.65:1**. These are token calculations, not an audit of every rendered state. Blending, opacity and moving backgrounds can reduce actual contrast; keep copy on a sufficiently opaque panel. `#7e7c75` reaches only 4.30:1 against the panel and should not be the normal small-text token.

Preserve existing semantic chart roles when updating their hues. Direct-label important series, retain dashed expected-value lines and use symbols or words for status. Do not turn every chart series brass or remove the distinction between actual and expected results.

## Typography and hierarchy

- Use IBM Plex Sans Regular for body text at roughly 14–16 px, with 1.5 line height. Use Medium or SemiBold for controls and section headings.
- Give the opening one strong, short heading, approximately 56–88 px on desktop and 38–48 px on mobile. Keep long analysis titles smaller.
- Use IBM Plex Mono for compact metadata at 11–12 px, with moderate tracking. Avoid uppercase paragraphs.
- Keep the four monetary/percentage values large enough to read immediately, with tabular numerals and consistent alignment. Labels and units must remain visible as the cards move.
- Align charts and metrics to one spacing rhythm: 8, 16, 24, 32 and 48 px. Use fine borders and a clear title/subtitle relationship instead of adding more pill labels.

## Motion recipe

The ace is the main moving object. It assembles over approximately 2–3 seconds, rotates slowly through a shallow three-dimensional angle, and responds locally to the pointer before returning to its shape. Keep its brightest region away from headings and numerical values.

The metric cards enter from the ace in a short stagger, then float through only a few pixels over 7–11 seconds with different phases. Keep their layout positions and hit areas stable. Pause a card's decorative movement during hover or keyboard focus. Do not repeatedly animate financial numbers: they should change only when the underlying filter changes.

On mobile, keep all four cards in a readable grid or stack and reduce particle count and motion amplitude. The existing global motion setting and operating-system reduced-motion preference should stop the loop and show a composed static ace. Pause rendering when the hero is out of view or the tab is hidden.

This is an original visual adaptation. It does not require a paid template, a generated video, AXON's supplied video links, or reproducing a 262,144-particle fluid solver. A lighter native WebGL particle field can express the brief while preserving interaction responsiveness.

## Integration notes from the existing application

The existing `midnight.css` begins with navy surfaces, cyan/violet tokens and blurred colored background layers. Replace or neutralize the source tokens and background layers rather than stacking additional colored effects. Several charts and supporting styles have explicit colors, so a root-token update alone is insufficient.

Keep the existing motion toggle, evidence links, date/zone/bank filters and chart semantics. The existing opening has its own navigation and focus handling; replacing the first impression must not create a second mandatory entrance sequence. A transformed page ancestor can alter fixed-position behavior, so keep the particle stage locally positioned and make its canvas non-interactive unless the pointer behavior is deliberately handled by its parent.

## Official font assets

The paths below were verified in the IBM repository through the GitHub contents API on the research date. The font family is distributed under [SIL Open Font License 1.1](https://github.com/IBM/plex/blob/master/LICENSE.txt). Include the copyright/license file when bundling the unmodified fonts. The website does not need a paid font service.

- [IBM Plex Sans Regular WOFF2](https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2)
- [IBM Plex Sans Medium WOFF2](https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2)
- [IBM Plex Sans SemiBold WOFF2](https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2)
- [IBM Plex Mono Regular WOFF2](https://raw.githubusercontent.com/IBM/plex/master/packages/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2)
- [Raw IBM font license](https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt)

Self-host the small selected set, use `font-display: swap`, and keep `system-ui` / monospace fallbacks. If the offline single-file packager currently recognizes only TTF files, extend it to embed WOFF2 with `font/woff2` so the standalone dashboard retains the same typography.
