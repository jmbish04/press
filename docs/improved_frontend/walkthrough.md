# Press v3 Frontend Rebuild — Walkthrough

> 🤖 **PRIMARY:** @frontend-specialist | **SUPPORT:** @backend-specialist, @orchestrator | 🛠️ **Skills:** clean-code, cloudflare, agents-sdk, react-best-practices

## Summary

Rebuilt the Press frontend from the reference design into a typed React SPA mounted in Astro SSR. **All 9 phases** are complete — the app has a design system, collapsible shell, 7 page routes, a custom mind map renderer, cross-cutting artifact generation modal, and a floating agent chat panel wired to the Cloudflare Agents SDK.

---

## Changes Made

### Phase 5 — CSS Design System

#### [NEW] [press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css)
Complete application stylesheet (~510 lines):
- **Brand tokens** using OKLCH (`--brand`, `--brand-soft`, `--brand-line`)
- **Status colors** (`--ok`, `--warn`, `--err`)
- **Layout primitives** (`.app`, `.rail`, `.topbar`, `.page`)
- **Component styles**: sidebar, newsstand cards, article viewer, processing table, ingest dropzone, studio grid, assistant panel, notebook, mind map, generate modal
- **Animations**: `marquee`, `pulse`, `live`, `pop`, `spin`
- **Responsive breakpoints** at 980px and 760px
- **Custom scrollbar** styling

---

### Phase 6 — App Shell + Common Components

#### [NEW] [PressIcon.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressIcon.tsx)
30+ Lucide-compatible SVG icons (24×24 viewBox). Zero external dependencies.

#### [NEW] [Shell.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/Shell.tsx)
- **`Sidebar`** — Collapsible rail with brand mark, quick-add, nav, saved views
- **`TopBar`** — Sticky header with toggle, search, notifications badge
- **`MobileTabBar`** — Fixed bottom bar for mobile

#### [NEW] [PressApp.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressApp.tsx)
Root SPA:
- **8 lazy-loaded pages** + GenerateModal
- **Client-side routing** between 7 routes
- **Data fetching** for articles, views, processing stats
- **GenerateModal state** — cross-cutting modal triggered from any page context

#### [MODIFY] [index.astro](file:///Volumes/Projects/workers/press/src/frontend/pages/index.astro)
Mounts `<PressApp client:only="react" />` with both `global.css` and `press.css`.

---

### Phase 7 — Page Components

#### [NEW] [Newsstand.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Newsstand.tsx)
Grid/rail article browse with search and synthetic article card previews.

#### [NEW] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)
Four-tab viewer (Reader, **Mind map**, Screenshot, Markdown) + side panel:
- **Mind map tab** renders the real `<Mindmap>` component (lazy-loaded)
- **Side panel** with source info, audio player, narration, export
- **Floating ArticleAssistant** chat panel (lazy-loaded)

#### [NEW] [Ingest.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Ingest.tsx)
Dropzone with URL detection, pill previews, and `POST /api/articles/submit`.

#### [NEW] [Processing.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Processing.tsx)
Pipeline monitor: 4 stat cards, filter bar, job table, retry/discard, auto-refresh.

#### [NEW] [Settings.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Settings.tsx)
4-section settings: General, AI Models, Narration, API & Integrations.

---

### Phase 8 — Studio + Mindmap + GenerateModal

#### [NEW] [Mindmap.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/Mindmap.tsx)
Custom lightweight tree renderer (**not** mind-elixir):
- Horizontal tree layout with bezier curve SVG edges
- Collapsible nodes (click to toggle)
- Zoom controls (+, −, reset)
- OKLCH hue-based coloring per depth
- `MiniMindmap` component for thumbnail previews in Studio cards
- `BRANCH_TEMPLATES` for category-based tree generation
- `mindmapForArticle()` helper

#### [NEW] [Studio.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Studio.tsx)
Artifact gallery: type filter tabs (All, PWAs, Mindmaps, Cards), card grid, iframe viewer.

#### [NEW] [GenerateModal.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/GenerateModal.tsx)
Cross-cutting modal for **mind map** and **PWA** generation:
- **Compose phase**: scope label, prompt textarea, PWA template suggestions
- **Building phase**: 5-step progress tracker with spinner animation
- **Done phase**: success confirmation with "Open in Studio" navigation
- Simulated build progress (will be wired to real `spawn_artifact` agent tool events)

#### [NEW] [Notebook.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Notebook.tsx)
Three-pane NotebookLM UI:
- Source panel with checkboxes to pin/unpin articles
- Chat feed with user/AI message bubbles
- Compose bar with 4 prompt suggestions
- Empty state with branded onboarding

---

### Phase 9 — Agent Chat Integration

#### [NEW] [ArticleAssistant.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/ArticleAssistant.tsx)
Floating agent chat panel using the **full Cloudflare Agents SDK pattern**:
```
useAgent → useAgentChat → useAISDKRuntime → AssistantRuntimeProvider → <Thread>
```
- Connects to `ArticleChatAgent` Durable Object per article ID
- Auto-pins the article as a source on connect
- Renders the `assistant-ui` `<Thread>` for rich chat with tool calls
- Supports artifact spawning (PWAs, mindmaps, summary cards) via agent tools

#### [PRESERVED] [NotebookChat.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/NotebookChat.tsx)
The existing production NotebookChat with full agent WebSocket integration is preserved unchanged. It uses the same `useAgent + useAgentChat + useAISDKRuntime + AssistantRuntimeProvider` pattern and can be swapped into the Notebook page when ready.

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | ✅ 0 errors |
| `pnpm build` | ✅ Clean build |
| Code splitting | ✅ Each page/component lazy-loaded as separate chunk |

### Bundle Analysis (new chunks)
| Chunk | Size (gzip) |
|-------|-------------|
| Newsstand | 1.63 kB |
| Notebook | 1.63 kB |
| Ingest | 1.76 kB |
| Studio | 1.61 kB |
| Processing | 1.65 kB |
| GenerateModal | 2.05 kB |
| Mindmap | 2.34 kB |
| ArticleView | 2.34 kB |
| Settings | 2.20 kB |
| ArticleAssistant (in thread.js) | 196.01 kB |

---

## Complete File Manifest

### New Files Created (15 total)
| File | Purpose |
|------|---------|
| `press.css` | Full design system (tokens, layouts, components, responsive) |
| `PressIcon.tsx` | 30+ Lucide SVG icons |
| `Shell.tsx` | Sidebar, TopBar, MobileTabBar |
| `PressApp.tsx` | Root SPA with lazy routing + GenerateModal |
| `Mindmap.tsx` | Custom SVG+DOM tree renderer + MiniMindmap |
| `GenerateModal.tsx` | Artifact generation modal (compose → build → done) |
| `ArticleAssistant.tsx` | Floating agent chat (Agents SDK + assistant-ui) |
| `Newsstand.tsx` | Article grid/rail browse |
| `ArticleView.tsx` | 4-tab viewer + side panel + floating assistant |
| `Ingest.tsx` | URL dropzone + submission |
| `Processing.tsx` | Pipeline monitor + stats |
| `Studio.tsx` | Artifact gallery + iframe viewer |
| `Notebook.tsx` | 3-pane NotebookLM UI |
| `Settings.tsx` | 4-section settings panel |
| `index.astro` | Updated entry mounting PressApp |
