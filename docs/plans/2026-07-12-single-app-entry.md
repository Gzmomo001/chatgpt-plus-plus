# ChatGPT++ Single-App Entry Plan

## User-visible entry

- `ChatGPT++` becomes the only installed application and shortcut.
- Its main window is the existing Tauri management UI.
- Launch and restart actions continue to run the complete enhanced Codex lifecycle through one scenario-level backend interface.
- Opening the UI does not automatically restart Codex; users launch or restart explicitly.

## Manager and launcher lifecycle

- Keep `chatgpt-plus-launcher` as an internal helper process so Codex/helper/watchdog lifetime is independent of the Tauri window.
- The manager calls a single deep launch interface that owns helper discovery, arguments, hidden process creation, restart cleanup, and diagnostic errors.
- The helper retains single-instance recovery, provider sync, protocol proxy, and official Codex activation behavior; Renderer injection and CDP flags have been removed.
- Closing the main window hides it to the tray/menu bar. Quitting the UI releases UI resources; a running helper remains responsible for its own Codex/helper lifecycle until Codex exits.

## macOS bundle layout

```text
ChatGPT++.app/
  Contents/
    MacOS/ChatGPTPlusPlus            # Tauri manager, visible app entry
    Helpers/chatgpt-plus-plus        # hidden launcher helper
    Resources/...
```

- The DMG contains only `ChatGPT++.app` plus the `/Applications` link.
- Companion resolution prefers the embedded helper/main executable and still recognizes the previous two-app layout during upgrades.

## Windows install layout

- Keep both internal binaries in the install directory to minimize migration risk.
- Desktop and Start Menu expose only `ChatGPT++.lnk`, targeting the manager executable.
- Watcher/autostart targets the hidden launcher helper directly.
- The uninstaller remains visible only as the normal uninstall entry.

## Upgrade migration

- Installer and entrypoint repair remove legacy `ChatGPT++ 管理工具` shortcuts without touching settings or user data.
- macOS first-run/repair removes only the exact legacy sibling `ChatGPT++ 管理工具.app`; configuration directories are never removed.
- Windows keeps existing executable filenames and URL protocol registration so upgrades do not break companion paths.
- Companion resolution supports both the new embedded-helper layout and old sibling-app layout.

## Delivery slices

1. Characterize the one-entry install plans, legacy cleanup, and companion resolution (RED).
2. Add the deep enhanced-launch interface and migrate manager launch/restart to it.
3. Convert macOS/Windows packaging, repair, watcher, and CI bundle checks to the single-entry layout.
4. Remove user-facing manager/silent-entry terminology from UI and docs.
5. Run installer, core, manager, frontend, formatting, and workspace gates; record package-level validation risks.
