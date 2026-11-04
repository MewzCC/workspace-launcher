# Navigation and pet workbench implementation plan

**Goal:** Group the main navigation and redesign the pet workbench while retaining its five tabs.

**Architecture:** Keep existing page keys, IPC calls, pet renderer and data unchanged. Add accessible navigation groups, a desktop icon rail and local UI preferences. Reorganize pet panels using CSS Grid and internal section switches.

**Tech stack:** Existing Electron, React, Zustand, Lucide and CSS; no new dependencies.

**Spec:** Approved design in this chat, amended to retain one pet navigation entry and all five workbench tabs.

## Constraints
- Pet files and assets remain local. No uploads or cloud operations.
- Preserve existing page destinations, chat behavior, import flow and rendering engines.
- Support light/dark themes, Chinese/English/Japanese, narrow windows and reduced motion.

## Tasks
- [x] Group navigation into work/start and system tools; keep pet as a single destination and settings in footer. Add persistent collapse preference and accessible group controls.
- [x] Compact pet header and preserve the five-tab keyboard interaction. Redesign conversation layout with preview, quick controls and expandable actions.
- [x] Separate library/interaction views inside models. Categorize settings without discarding unsaved form inputs. Improve memory and study layouts.
- [x] Apply scoped glass surfaces, typography, responsive layouts and reduced-motion rules.
- [x] Build, run relevant regression checks and exercise real rendered UI at desktop/narrow sizes and in both themes.

## Review focus
- External page navigation expands the relevant group; collapsed children cannot receive focus.
- Rail and mobile drawer retain access to every destination.
- Switching settings categories preserves unsaved AI form fields.
- Chat remains usable at small viewport sizes; no horizontal page overflow.
- Pet tabs retain arrow/Home/End keyboard navigation and rendering behavior.

Implementation is authorized by the user's “开始重构”; proceed in this chat without another approval gate.

## Validation results
- `npm run test:workbench-layout`: PASS, including production build and isolated Electron renderer checks.
- Covered grouped/external navigation, rail, five tabs, keyboard switching, model sections, settings draft retention, memory modal focus restoration, light/dark themes, three languages, reduced motion and 480–1800px windows (including 640x500 and 1024x600).
- `npm run test:pet-drag`: PASS.
- `npm run test:pet-performance`: PASS (50 operations; zero model-file reads on movement cache path).
- `git diff --check`: PASS.
- Reviewer identified memory dialog focus loss; fixed with native close and explicit invoker focus, then verified in Electron.
- Scope limitation: UI checks use the built-in pet in isolated local storage. Real AI services and all custom model renderers were not retested.
