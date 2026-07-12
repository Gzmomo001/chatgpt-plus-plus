# ChatGPT++ Single-App Entry Plan

## User-visible entry

- `ChatGPT++` becomes the only installed application and shortcut.
- Its main window is the existing Tauri management UI.
- Launch and restart actions continue to run the complete enhanced Codex lifecycle through one scenario-level backend interface.
- Opening the UI does not automatically restart Codex; users launch or restart explicitly.

## Manager-owned lifecycle

- The Tauri manager directly owns Codex launch/restart, Provider Sync, pre-launch maintenance, status, and cleanup.
- Relay protocol proxy starts only for active profiles that require conversion or aggregation and remains owned by the tray process.
- Closing the main window hides it to the tray/menu bar. Quitting the app synchronously releases the proxy and watchdog resources it created.
- Switching the active Relay profile restarts an active managed launch so proxy state cannot outlive its configuration.

## macOS bundle layout

```text
ChatGPT++.app/
  Contents/
    MacOS/ChatGPTPlusPlus            # Tauri manager and background runtime
    Resources/...
```

- The DMG contains only `ChatGPT++.app` plus the `/Applications` link.
- No `Contents/Helpers/chatgpt-plus-plus` executable is packaged.

## Windows install layout

- Install only `chatgpt-plus-plus-manager.exe`.
- Desktop and Start Menu expose only `ChatGPT++.lnk`, targeting the manager executable.
- Watcher/autostart targets the main application.
- The uninstaller remains visible only as the normal uninstall entry.

## Upgrade migration

- Installer and entrypoint repair remove legacy `ChatGPT++ 管理工具` shortcuts without touching settings or user data.
- macOS first-run/repair removes only the exact legacy sibling `ChatGPT++ 管理工具.app`; configuration directories are never removed.
- Windows removes the retired `chatgpt-plus-plus.exe` during upgrade while preserving the main executable and URL protocol registration.

## Delivery slices

1. Characterize one-binary install plans and legacy cleanup.
2. Move the launch lifecycle and proxy ownership into the manager.
3. Convert macOS/Windows packaging, watcher, and CI checks to one binary.
4. Remove helper-only protocols and stale documentation.
5. Run installer, core, manager, frontend, formatting, and workspace gates.
