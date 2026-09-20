# Customer Mobile Smart Layout — Design QA

## Reference sources

- `/workspace/scratch/e71d6b4b238c/upload/01-1000246092.jpg` — booking route before correction
- `/workspace/scratch/e71d6b4b238c/upload/02-1000246094.jpg` — overly tall Orders assignment card
- `/workspace/scratch/e71d6b4b238c/upload/03-1000246097.jpg` — booking search with Android keyboard
- `/workspace/scratch/e71d6b4b238c/upload/04-1000246096.jpg` — focused pickup field with Android keyboard

## Implementation capture

- Cloud preview: `http://terminal.local:4173/`
- Preview-only responsive harness rendered Booking, Orders, and Full Tracking at 320, 360, 390, and 412 CSS pixels.
- The preview harness was kept outside the git worktree and is not part of the production change.

## Comparison and findings

| Surface | Reference problem | Implemented result | Verification |
|---|---|---|---|
| Orders | Driver/truck assignment made every card fill most of the screen | Cards start collapsed; assignment stays inside View details; Live trip CTA remains directly accessible | Card height: 464px at 320/360, 430px at 390/412; no horizontal overflow |
| Full tracking | Bottom navigation and oversized map competed for viewport space | Tracking is immersive without bottom navigation; map uses clamped Android-aware height | Map: 325px at 320/360, 348px at 390/412; no horizontal overflow |
| Booking map | Route sheet and IME left a large blank/cropped area | Route step uses `--customer-app-height`; map fills remaining visual viewport | Map surface: 630px in the 760px QA frame at every target width; scroll width equals client width |
| Start booking | Bottom sheet was too tall | Compact two-column sheet with 44px CTA | Sheet: 62px high at all four widths |
| Keyboard mode | Controls crowded results while an input was focused | Bottom sheet, map action row, and map controls hide during focus; results receive bounded height | `:has(input:focus)` active and both overlays computed `display:none` at 320px |

## Responsive pass history

1. Initial pass revealed 320/360 Orders action buttons still used a single-column layout (566px card height).
2. Actions were changed to two columns at all Android widths; card height fell to 464px without overflow.
3. Booking, keyboard mode, and full tracking were remeasured after the correction.

## Functional and console checks

- `npm run test:ci`: 81 tests passed; TypeScript and production Vite build passed.
- Cloud preview emitted no application console warnings or errors. Browser-extension metadata errors were unrelated to the app.
- Profile and Payments source files were not modified.

## Final result

**passed**
