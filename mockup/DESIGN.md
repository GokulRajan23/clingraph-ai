# ClinGraph Design Language

The visual system for ClinGraph, a voice-first clinical knowledge-graph app for doctors. It is adapted from the dark theme of blog.maximeheckel.com: an editorial page that is mostly near-black, a deep-blue glow behind a single generative hero object, a narrow text column, and quiet monospace labels.

Use this file as a brief for any AI tool or designer. Everything a model needs to reproduce the look is below: tokens, layout, components, motion, and what to avoid.

---

## 1. Character in one paragraph

Calm, precise, clinical, a little technical. The page reads like a well-typeset research note rather than a SaaS landing page. Colour is almost entirely greyscale with a cool blue tint; the only saturated colour is the deep-blue glow in the hero and a single accent blue for "this is selected / this is the answer". One hero object carries all the visual drama. Everything else is text, thin rules and whitespace.

---

## 2. Colour

All neutrals share one hue (266, a cool blue-violet) so the greys never look dead. Hex values are sRGB equivalents of the OKLCH source tokens.

### Neutrals

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--bg` | `oklch(14.68% .01 266)` | `#090a0f` | Page background |
| `--gray-200` | `oklch(16.75% .011 266)` | `#0d0f14` | Cards, widgets, inputs |
| `--gray-300` | `oklch(17.8% .012 266)` | `#0f1117` | Floating surfaces (dock, scrolled nav) |
| `--gray-400` | `oklch(24.84% .018 266)` | `#1d212a` | Hairline borders, list dividers |
| `--gray-500` | `oklch(28.69% .023 266)` | `#252a36` | Stronger borders, input outlines, graph edges |
| `--gray-700` | `oklch(41.6% .035 266)` | `#434c60` | Rarely; disabled strokes |

### Text

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--text-primary` | `oklch(93.66% .027 266)` | `#e2eafd` | Headings, bold words, active rows |
| `--text-secondary` | `oklch(77.16% .028 266)` | `#acb5c7` | Body copy, list titles at rest |
| `--text-tertiary` | `oklch(66.65% .04 266)` | `#8994ae` | Dates, metadata, captions, placeholders |

### Accent & hero

| Token | Value | Use |
|---|---|---|
| `--accent` | `oklch(64.6% .172 266)` ≈ `#5c87f6` | Selection, highlighted graph nodes/edges, citation markers, focus rings |
| `--brand` | `#0163F5` | Active mic state, text selection, nav tint (at 18% alpha) |
| `--emphasis` | accent at 9% alpha | Hover/active background on list rows |
| Hero glow | `#0a4fc4` → `#063f9c` → `#043370` → transparent | Radial wash behind the hero object only |

### Semantic (clinical status)

Used **only** as small outlined tags, never as fills or backgrounds.

| Meaning | OKLCH | Hex |
|---|---|---|
| Progressed / worse | `oklch(75% .14 25)` | `#fa8880` |
| Improved / better | `oklch(80% .12 160)` | `#71d6a3` |
| Stable / neutral | `--text-tertiary` | `#8994ae` |

### Particle tints (hero object)

- Base grey: `rgb(155,162,178)`
- Rare pink speck, ~3.5% of particles: `rgb(236,168,190)`
- Rare blue speck, ~3.5% of particles: `rgb(130,170,255)`

### Colour rules

- Never put two saturated colours next to each other. Blue is the only chromatic colour on screen in normal use.
- No gradients anywhere except the hero glow.
- Data visualisations stay greyscale. Encode categories with **shape**, not colour. Accent blue marks only what is selected.
- Borders are 1px hairlines in `--gray-400`. No drop shadows on cards.

---

## 3. Typography

| Role | Font | Size / line-height | Weight | Notes |
|---|---|---|---|---|
| Hero heading (h1) | Inter | 24px / 1.25 | 500 | `letter-spacing: -0.01em`. Deliberately small; the hero object is the headline |
| Body | Inter | 16px / 1.75 | 400 | `--text-secondary` |
| Bold in body | Inter | inherit | 600 | Switches to `--text-primary` |
| Italic in body | Inter Italic | inherit | 400 | Used for the "how" phrase in a paragraph |
| List row title | Inter | 16px | 500 | |
| Row subline | Inter | 14px / 1.5 | 400 | `--text-tertiary` |
| Section labels, years, dates, tags, captions | **Departure Mono** | 11–14px | 400 | Pixel-style monospace. Uppercase only for short status captions ("TAP TO ASK") |
| Nav links | Inter | 14px | 600 | |

- Inter features: `font-feature-settings: "cv11" 1, "cv05" 1; font-variation-settings: "opsz" auto;`
- Departure Mono is SIL OFL. The mockup self-hosts it from `fonts/DepartureMono-Regular.woff2` (source: github.com/rektdeckard/departure-mono).
- Never use more than two typefaces. No display or serif fonts.

---

## 4. Layout

```
┌──────────────────────── viewport ────────────────────────┐
│                [ ⊂⊃ | Graph  History  Ask ]   ← nav, fixed, top 24px
│                                                          │
│      (blue radial glow + 28px grid, top ~980px only)     │
│                                                          │
│              ░░▒▒▓▓  PARTICLE PILL  ▓▓▒▒░░               │  ← 520px stage, centred
│                    TAP THE PILL TO ASK                   │
│                                                          │
│          ┌─────── 680px column ───────┐                  │
│          │ Heading          │ Paragraph │  ← two-col intro│
│          │ Paragraph        │           │                 │
│          └────────────────────────────┘                  │
│                                                          │
│          Knowledge graph · 24 entities     ← mono label  │
│      ┌──────── widget bleeds ±110px ─────────┐           │
│      │ graph canvas              │ inspector │           │
│      └───────────────────────────────────────┘           │
│          Ask · typed or spoken                           │
│          [ input field ............ ↵  🎤 ]              │
│          ───────────────────────────────────             │
│          Question row                     ASK            │
│          ───────────────────────────────────             │
│          Patient history                                 │
│          2024                                            │
│          ───────────────────────────────────             │
│          Follow-up CT [stable]            May 14         │
│          subline                                         │
│          ───────────────────────────────────             │
└──────────────────────────────────────────────────────────┘
                 ( ⊂⊃ TAP TO ASK )   ← docked pill, appears after hero
```

- **Text column:** `max-width: 680px`, 20px side padding, centred.
- **Widgets** (graph, future charts) bleed past the column with `margin: 0 -110px`, which collapses to `0` below 920px.
- **Intro:** a two-column grid with a 28px gap that stacks below 700px.
- **Section rhythm:** 96px between sections, labels 28px above content, year groups 40px top padding.
- **Row padding:** 16px vertical, 12px horizontal. Rows have no radius; they're separated by top and bottom hairlines.
- **Radii:** 16px for widgets, 12px for inputs, 10px for the nav, 999px for pills, 4–6px for tags and small buttons.

---

## 5. Components

### Nav (floating)
A centred, fixed bar 40px tall with a 10px radius. At the top of the page its background is `--brand` at 18% alpha with `backdrop-filter: blur(12px) saturate(1.4)` and a 1px border in light blue at 22% alpha. Contents, left to right: logo icon (outlined pill glyph), a 1px divider, then text links. After 400px of scroll it switches to `--gray-300` at 80% alpha with a `--gray-400` border.

### Hero object: the particle pill
The hero object is a single 3D capsule, drawn on a `<canvas>` as roughly 15k square particles, and doubles as the voice button. Spec:
- **Geometry:** a capsule with half-length 1.5 and radius 0.62, sampled uniformly over its surface. 12% of particles are halo points scattered just outside the surface.
- **Pose:** slow spin around its long axis (0.25 rad/s), a slight yaw (~0.28 rad) and roll (~−0.14 rad), perspective projection, and a 6px vertical float.
- **Shading:** near particles are brighter and larger (alpha 0.25–0.95, size 0.9–1.8px).
- **Pixel dissolve:** past 64% of the canvas width, particles snap to a grid of 3–7px and render as larger blocks. This echoes the reference's dithered infinity. Which particles snap is fixed per particle, not re-randomised each frame.
- **Voice states:**
  - `idle`: barely breathing.
  - `listening`: particles push out along the surface normal in proportion to microphone loudness.
  - `thinking`: a slow pulse.
  - `speaking`: a wave travels along the length.
- **Hit area:** only an ellipse around the centre is clickable; the cursor becomes a pointer there.
- **Caption:** an uppercase mono status line below the pill (`TAP THE PILL TO ASK` / `LISTENING` / `READING REPORTS` / `SPEAKING · TAP TO STOP`), with the live transcript under it in Inter 15px.

### Docked pill
After the hero scrolls out of view, a 48px-tall fully rounded bar slides up from the bottom centre. It holds a small 900-particle version of the pill on the left and a mono status label on the right. When active, its border turns `--accent`. It uses a springy ease: `cubic-bezier(.2,.85,.32,1.2)`, 0.5s.

### Section label
Departure Mono at 14px in `--text-secondary`, with secondary metadata after a `·` in `--text-tertiary`. Example: `Knowledge graph · 24 entities · 40 links`.

### List row (the core pattern)
Used for history entries, suggested questions and search results.
- **Left side:** title in Inter 500, an optional outlined mono tag, then a subline on its own line.
- **Right side:** a mono date or action label (`May 14`, `ASK`) in `--text-tertiary`.
- **At rest:** the title is `--text-secondary`. **Hover or active:** the text turns `--text-primary` and the background becomes `--emphasis`. The colour transition takes 0.2s.

### Tag
Mono text, 11px, 1px border, 4px radius, `1px 6px` padding. Colour comes from the semantic table above; it is never filled.

### Widget card
`--gray-200` background, 1px `--gray-400` border, 16px radius.
- **Header bar:** mono 12px filename on the left (`pt-20871.graph`) and a small outlined button on the right.
- **Canvas:** a 1px dot grid at 7% white on a 16px pitch.

### Knowledge graph
Monochrome shapes, one per entity type:

| Type | Shape |
|---|---|
| Patient | filled circle, primary |
| Finding | filled circle, secondary |
| Observation | small hollow circle |
| Report | hollow portrait rectangle |
| Diagnosis | filled diamond |
| Procedure | hollow triangle |
| Medication | hollow capsule |

- Edges are 1px `--gray-500`.
- **Selection:** the chosen node and its neighbours turn `--accent`; everything else drops to 22% opacity.
- **Inspector panel (right, 240px):** a mono uppercase type label, the name, a properties list (`dt` in mono), then its sources.

### Ask (chat)
This is not a chat-bubble UI. Each exchange is a **question header** followed by an **answer block**:
- **Question:** a mono metadata line (`SPOKEN · 14:02`), then the question in Inter 16px/500 in `--text-primary`.
- **Answer:** one paragraph per fact, each with accent-coloured mono citation marks `[1]`.
- **Below the answer:** a mono source list, then the text buttons `Listen` and `Show in graph`.
- **Loading:** a mono line ending in `...` that animates in steps.
- **Input:** 48px tall, 12px radius, `--gray-200` background and a `--gray-500` border that turns `--accent` on focus. A `↵` key hint and a mic button sit on the right; the mic fills `--brand` while listening.

---

## 6. Motion

- **Default transitions:** 0.2s on colour, background and opacity.
- **Spring ease for anything that enters:** `cubic-bezier(.2,.85,.32,1.2)`.
- The hero object is the only element in continuous motion. Nothing else loops except loading dots.
- Graph layout settles with a short force simulation (pre-run before the first paint so nodes never fly in).
- Smooth-scroll to the relevant section when an answer arrives or a history row is clicked.
- Respect `prefers-reduced-motion`: disable smooth scroll and reduce the hero to a static frame.

---

## 7. Voice & copy

- Address the user as a clinician. Write short, factual sentences ("Five reports for PT-20871 are loaded.").
- Bold the concrete nouns in intro copy and italicise the example questions.
- Labels are nouns, not marketing ("Patient history", not "Your Journey").
- Every clinical statement in an answer carries a report citation.
- Status captions are uppercase mono; everything else is sentence case.

---

## 8. Don't

- No purple/teal/pink gradient blobs, glassmorphism cards or neon glows.
- No rainbow category colours in charts. Use shape for category and blue for selection.
- No chat bubbles, avatars or emoji.
- No drop shadows on cards. Use hairline borders only.
- No big bold hero headline. The hero object is the headline, and the h1 stays at 24px.
- No feature-tile bento grids or stat counters ("26 entities") in the hero.
- No more than one chromatic accent on screen at a time.

---

## 9. Paste-ready prompt

> Design in the ClinGraph language: dark editorial page on `#090a0f` with cool blue-tinted greys (`#0d0f14` cards, `#1d212a` hairline borders, text `#e2eafd` / `#acb5c7` / `#8994ae`). The only saturated colour is a deep-blue radial glow (`#0a4fc4` → `#043370`) with a faint 28px grid behind a single centred generative hero object (a 3D particle capsule that dissolves into pixel blocks on its right side and acts as the voice button), plus one accent `#5c87f6` for selection and citations. Type is Inter (16px/1.75 body, 24px/500 h1) with Departure Mono for labels, dates and tags. Content sits in a 680px column; widgets bleed ±110px. The core pattern is a hairline-separated list row: title on the left (secondary → primary on hover with a 9% accent background), mono date on the right, grouped under mono year labels. Graphs are greyscale, with entity type shown by shape. Chat is question header + cited answer paragraphs, not bubbles. A floating 40px translucent-blue nav sits at the top centre and a docked mini pill at the bottom centre. Motion is subtle: 0.2s colour fades and a springy `cubic-bezier(.2,.85,.32,1.2)` for entrances. No gradients outside the hero, no shadows, no rainbow palettes.

---

## 10. CSS tokens

```css
:root{
  --bg:#090a0f; --gray-200:#0d0f14; --gray-300:#0f1117; --gray-400:#1d212a; --gray-500:#252a36; --gray-700:#434c60;
  --text-primary:#e2eafd; --text-secondary:#acb5c7; --text-tertiary:#8994ae;
  --accent:#5c87f6; --brand:#0163F5; --emphasis:rgb(92 135 246 / 9%);
  --status-worse:#fa8880; --status-better:#71d6a3;
  --hero-glow:radial-gradient(ellipse 78% 70% at 36% 28%,#0a4fc4 0%,#063f9c 30%,#043370 55%,transparent 88%);
  --font:'Inter',system-ui,sans-serif; --mono:'DepartureMono',ui-monospace,monospace;
  --radius-widget:16px; --radius-input:12px; --radius-nav:10px; --radius-tag:4px;
  --column:680px; --widget-bleed:110px;
  --ease-spring:cubic-bezier(.2,.85,.32,1.2);
}
```
