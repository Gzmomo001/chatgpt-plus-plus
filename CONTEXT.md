# ChatGPTPlusPlus

ChatGPTPlusPlus manages Relay profiles and projects them into a Codex home without requiring users to hand-maintain Codex live files.

## Language

**Relay profile**:
A saved provider intent, including its operating mode, model choices, credentials, and optional Codex configuration.
_Avoid_: Provider config, relay config

**Codex home**:
The live Codex state whose configuration, authentication, and generated model catalog determine the next Codex launch.
_Avoid_: Codex folder, live files

**Codex home apply**:
The single transition that reconciles a Relay profile and shared context with the current Codex home while preserving explicitly unmanaged state.
_Avoid_: Injection, file copy, config write

**Relay profile editor**:
The editing lifecycle that turns user intent into a valid Relay profile, including draft normalization and aggregate membership rules.
_Avoid_: Provider form, profile helpers
