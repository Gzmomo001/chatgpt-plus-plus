# ChatGPT++

<p align="center">
  <img src="docs/images/chatgpt-plus-plus.png" alt="ChatGPT++ icon" width="160">
</p>

<p align="center">
  <a href="README.md">中文</a> | English
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/Gzmomo001/chatgpt-plus-plus">
  <img alt="Stars" src="https://img.shields.io/github/stars/Gzmomo001/chatgpt-plus-plus">
  <img alt="License" src="https://img.shields.io/github/license/Gzmomo001/chatgpt-plus-plus">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.85%2B-orange">
  <img alt="Tauri" src="https://img.shields.io/badge/tauri-2.x-24C8DB">
</p>

ChatGPT++ is a unified management app for the Codex App. The main program starts Codex through the official launch path and provides Provider, session, plugin, and maintenance capabilities without modifying the Codex Renderer, DOM, or page requests.

## Quick Start

Download the latest installer from [GitHub Releases](https://github.com/Gzmomo001/chatgpt-plus-plus/releases):

- Windows: `ChatGPTPlusPlus-*-windows-x64-setup.exe`
- macOS Intel: `ChatGPTPlusPlus-*-macos-x64.dmg`
- macOS Apple Silicon: `ChatGPTPlusPlus-*-macos-arm64.dmg`

Quick use:

1. Install `ChatGPT++`.
2. Open `ChatGPT++` to enter the unified main interface.
3. Start Codex from the app, or configure Providers, plugins, and launch maintenance first.

Windows creates only one `ChatGPT++` shortcut on the Desktop and Start Menu. macOS installs only `/Applications/ChatGPT++.app`. The tray-resident ChatGPT++ main process owns Codex launch, the optional protocol proxy, and its background resources.

## Sponsors

<p align="center">
  <a href="https://jojocode.com/">
    <img src="docs/images/sponsor-jojocode.png" alt="JOJO Code" width="180">
  </a>
</p>
<p align="center">
  <a href="https://jojocode.com/"><strong>JOJO Code | Official ChatGPT++ Relay</strong></a><br>
  The official ChatGPT++ relay service, focused on stable access and cost-effective pricing. JOJO Code supports the full GPT-5.6 family, Fable 5, Sonnet 5, GPT-5.5, GPT-5.4, Claude Opus 4.8, Claude Opus 4.7, gpt-image-2, and more for daily development, team collaboration, and long-running project workflows.
</p>

<p align="center">
  <a href="mailto:1727532@qq.com">Want to be shown below?</a>
</p>
<table>
  <tr>
    <th width="180">🏆 Sponsor 🏆</th>
    <th>Introduction</th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://jojocode.com/">
        <img src="docs/images/sponsor-jojocode.png" alt="JOJO Code" width="150">
      </a>
    </td>
    <td><a href="https://jojocode.com/"><strong>JOJO Code | Official ChatGPT++ Relay</strong></a><br>Thanks to JOJO Code for sponsoring this project. JOJO Code is the official ChatGPT++ relay service with cost-effective pricing and stable, easy-to-configure Codex API access. It supports the full GPT-5.6 family, Fable 5, Sonnet 5, GPT-5.5, GPT-5.4, Claude Opus 4.8, Claude Opus 4.7, gpt-image-2, and more for daily development, quick setup, team collaboration, and continuous use.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://aigocode.com/invite/CodexPlusPlus">
        <img src="docs/images/sponsor-aigocode.png" alt="AIGoCode" width="150">
      </a>
    </td>
    <td><a href="https://aigocode.com/invite/CodexPlusPlus"><strong>AIGoCode</strong></a><br>Thanks to AIGoCode for sponsoring this project! AIGoCode is an all-in-one platform integrating the latest Claude Code, Codex, and Gemini models, providing stable, efficient, and cost-effective AI programming services. It offers flexible subscription plans, direct access in China, no extra network setup, and fast responses. AIGoCode provides a special benefit for ChatGPTPlusPlus users: users who <a href="https://aigocode.com/invite/CodexPlusPlus">register through this link</a> can receive an extra 10% bonus credit on their first recharge.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/Liuchun-oss/codelf-agent">
        <img src="docs/images/sponsor-codelf.png" alt="Codelf" width="110">
      </a>
    </td>
    <td><a href="https://github.com/Liuchun-oss/codelf-agent"><strong>Codelf</strong></a><br>Codelf is a desktop app with an autonomous AI Agent and a full editor. It can help users build projects, organize materials, operate local apps, and work with multiple AI model providers through natural language, with direct access in China and high context-cache efficiency.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://xc.y1yun.net/">
        <img src="docs/images/sponsor-yiyun-tech.jpg" alt="Yiyun Technology" width="150">
      </a>
    </td>
    <td><a href="https://xc.y1yun.net/"><strong>Yiyun Technology</strong></a><br>Yiyun Technology provides payment and settlement products for AI aggregation businesses, including Jiuwu Yunshang and Yiyun Pay. It supports WeChat Pay, Alipay, UnionPay, and Cloud QuickPass channels with low rates, D1/D0 settlement, 24/7 technical support, dedicated WeCom service groups, and strong website protection for merchants.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://sui-xiang.com/">
        <img src="docs/images/sponsor-sui-xiang-ai-gateway.jpg" alt="Sui Xiang AI Gateway" width="150">
      </a>
    </td>
    <td><a href="https://sui-xiang.com/"><strong>Sui Xiang AI Gateway</strong></a><br>Thanks to Sui Xiang AI Gateway for sponsoring this project! Sui Xiang AI Gateway is a reliable and efficient API relay service provider for Claude, Codex, Gemini, and more. It focuses on privacy, transparent service, fast support, no data resale, and no model dilution. New accounts can receive 0.5 CNY in daily check-in test credit, with 1:1 recharge credit, no subscription, and pay-as-you-go billing.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&amp;utm_content=CodexPlusPlus&amp;utm_medium=devrel_tool_web&amp;utm_source=OWO&amp;utm_term=CodexPlusPlus">
        <img src="docs/images/sponsor-byteplus.png" alt="BytePlus" width="150">
      </a>
    </td>
    <td><a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&amp;utm_content=CodexPlusPlus&amp;utm_medium=devrel_tool_web&amp;utm_source=OWO&amp;utm_term=CodexPlusPlus"><strong>BytePlus ModelArk | Dola Seed</strong></a><br>Thanks to Dola Seed for sponsoring this project! Dola Seed 2.0 is a full-modal general large model independently developed by ByteDance for the global market. Built on a unified multimodal architecture, it supports joint understanding and generation of text, images, audio, and video. It natively enables agent collaboration, strong reasoning, long-task execution, tool integration, and coding capabilities, and is readily accessible through the ModelArk platform. Register via <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&amp;utm_content=CodexPlusPlus&amp;utm_medium=devrel_tool_web&amp;utm_source=OWO&amp;utm_term=CodexPlusPlus">this link</a> to get 500,000 tokens of free inference quota per model. <a href="https://dis.chatdesks.cn/chatdesk/hsyqCodexPlusPlus.html">Mainland China developers can click here</a>.</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://smallice.xyz/register?aff=FSNMGR2THBLN">
        <img src="docs/images/sponsor-smallice.png" alt="Smallice" width="150">
      </a>
    </td>
    <td><a href="https://smallice.xyz/register?aff=FSNMGR2THBLN"><strong>Smallice | AI Relay</strong></a><br>Thanks to Smallice for sponsoring this project! Smallice is one key to all the language models worth calling: a unified endpoint that acts as a quiet foundation layer beneath your applications. Whether you call Claude, GPT, Gemini, or DeepSeek, the request shape stays consistent. <a href="https://smallice.xyz/register?aff=FSNMGR2THBLN">Register through this link</a> to get started.</td>
  </tr>
</table>


## Highlights

- Rust backend with the Codex launch lifecycle and on-demand Relay protocol proxy built into the main process.
- Tauri + React main interface with dark/light theme support.
- Launches the official Codex/ChatGPT app without modifying its Renderer, DOM, or page requests.
- Multiple Provider profiles with managed `ChatGPTPlusPlus` configuration and a one-click return to official ChatGPT login mode.
- Manager-native session deletion, Markdown export, and Token usage history.
- Manager-native marketplace, plugin, and skill inventory without Codex page injection.
- Provider Sync to keep historical sessions visible after switching providers.
- Per-model context window configuration: the "Model list" is split into two columns, model name on the left and context window (e.g. `1M`, `200K`, or `1000000`) on the right. ChatGPT++ auto-generates `model_catalog_json` and injects it into `config.toml`; the matching window is applied when you switch models. Leave the window empty to use Codex's default length.
- GitHub Release updates from the unified ChatGPT++ UI.
- Windows single instance, no console window, administrator manifest, and system Desktop path detection.
- Separate macOS x64 and arm64 DMGs containing one main executable in `ChatGPT++.app`.

## Relay Injection

Relay injection is for users who are already logged in with an official ChatGPT account in Codex/ChatGPT and want model requests to go through a custom compatible API.

The boundary of this hybrid mode is:

- The official ChatGPT/Codex login state still owns Codex App account features and the plugin entry.
- The relay profile only controls the Base URL, key, and model names used for model requests.
- The compatible API provider is not tied to any specific vendor; it only needs to match the selected upstream protocol and Codex configuration.
- Clearing API mode should return Codex to the official login mode so the official account and plugins keep working.

Before applying relay injection, run a minimal preflight:

1. Make sure Codex has detected the ChatGPT login state and the plugin entry is available.
2. Confirm the custom Base URL is reachable and supports the selected upstream protocol, such as a Responses-compatible endpoint.
3. Test the target key with the smallest useful auth probe, such as a model-list request or a short message request.
4. Only record whether the key exists and whether auth passed. Do not paste real keys into logs, screenshots, or issues.
5. Make sure `~/.codex/config.toml` has a backup so clearing API mode can safely roll back.

In ChatGPT++'s Relay Injection page:

1. Make sure ChatGPT login status is detected.
2. Add one or more relay profiles with Base URL and Key.
3. Select the active profile and apply relay injection.
4. Launch `ChatGPT++`.

ChatGPT++ writes configuration similar to this into `~/.codex/config.toml`:

```toml
model_provider = "ChatGPTPlusPlus"

[model_providers.ChatGPTPlusPlus]
name = "ChatGPTPlusPlus"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://example.com/v1"
experimental_bearer_token = "sk-..."
```

To return to the official login mode, use the clear API mode button in the Relay Injection page. This removes `OPENAI_API_KEY` related configuration and switches Codex back to official ChatGPT authentication.

## Launch Maintenance and Plugins

ChatGPT++ can independently enable Computer Use Guard and fast startup, and it manages plugins and skills through Codex's official marketplace and `config.toml`. Session deletion, Markdown export, and Token usage history are also manager-native and do not rely on Codex page injection.

## Recommendations

Recommended content is loaded from:

```text
https://raw.githubusercontent.com/BigPizzaV3/Ad-List/main/ads.json
https://cdn.jsdelivr.net/gh/BigPizzaV3/Ad-List@main/ads.json
```

Requests automatically append a `?v=timestamp` cache buster to avoid stale CDN content. Slow recommendation loading does not mark the backend connection as failed.

## Updates and Packages

ChatGPT++ publishes installers through GitHub Releases. Windows builds an NSIS installer, while macOS builds separate Intel x64 and Apple Silicon arm64 DMGs.

ChatGPT++'s About page can check and start updates.

## Data Locations

- Codex config: `~/.codex/config.toml`
- Codex auth state: `~/.codex/auth.json`
- Codex local database: prefers `~/.codex/sqlite/*.db`, falls back to legacy `~/.codex/state_5.sqlite`
- ChatGPT++ state and logs: new installs use `~/.chatgpt-plus-plus/`; an existing `~/.codex-session-delete/` directory is read in place for compatibility.
- Provider Sync backups: `~/.codex/backups_state/provider-sync`

## FAQ

### macOS says the app cannot be opened or is damaged

Unsigned and unnotarized builds may be blocked by Gatekeeper. Allow the app in System Settings -> Privacy & Security. For formal distribution, configure Apple Developer ID signing and notarization.

### Does it support Intel Macs?

Yes. Releases provide both `macos-x64.dmg` and `macos-arm64.dmg`. Intel Macs should use the x64 package, while Apple Silicon Macs should use the arm64 package.

## Development

```bash
# Frontend checks
cd apps/chatgpt-plus-manager
pnpm install
pnpm check
pnpm vite:build

# Rust checks
cd ../..
cargo fmt --check
cargo test
cargo build --release
```

Project structure:

```text
apps/
  chatgpt-plus-manager/           ChatGPT++ Tauri main app and background runtime
crates/
  chatgpt-plus-core/              Launch, config, update, install, and protocol proxy
  chatgpt-plus-data/              Session data, export, Provider Sync
scripts/installer/
  windows/ChatGPTPlusPlus.nsi     Windows NSIS installer
  macos/package-dmg.sh          macOS DMG packager
```

## Community and Support

Join the ChatGPT++ discussion group to report issues, share usage notes, or suggest features:

WeChat group: [get the latest QR code](https://docs.qq.com/doc/DQ2VOanZTTFZJcUpZ#).

## Friendly Links

- [LINUX DO](https://linux.do)

## License

Copyright (C) 2026 BigPizzaV3

Starting with versions published after this license change, ChatGPTPlusPlus is licensed under the [GNU Affero General Public License v3.0](LICENSE), using the SPDX identifier `AGPL-3.0-only`.

If you modify and distribute this project, or make a modified version available to users over a network, you must provide the complete corresponding source code to those users as required by AGPLv3. This license covers only ChatGPTPlusPlus's own code. It does not grant rights to OpenAI, ChatGPT, or Codex trademarks, application assets, or other third-party materials. Versions previously received under another license are not retroactively affected by this change.

## Notes

ChatGPT++ is a separate management tool. It does not modify original Codex App files or depend on its Renderer, DOM, or page structure.
