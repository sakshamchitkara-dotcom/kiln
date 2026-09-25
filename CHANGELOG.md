# Changelog

## 0.2.0 - 2026-09-25

### Added
- Type check of generated code: after a successful `vite build`, Kiln runs strict `tsc --noEmit` with its own tsconfig. Type errors go back to the model through the same bounded auto-fix loop as build failures; if they survive, the version is still saved and the chat flags them. What tsc may read is checked with tsc's own file list before the check runs, so escaped or commented import specifiers can't point it outside the project.
- Scripted mode: "simulate a type error" and "simulate a runtime error" to exercise the type-check and runtime-error paths offline.
- End-to-end test that triggers a render-time crash in the sandboxed preview and fixes it with "Ask Kiln to fix it".

### Changed
- `typescript`, `@types/react` and `@types/react-dom` are runtime dependencies, since the server type-checks generated projects.

## 0.1.0

- First release: prompt-to-site with Claude or the offline scripted generator, sandboxed `vite build` with auto-fix, live preview, versions with diff and restore, zip export, three starter templates.
