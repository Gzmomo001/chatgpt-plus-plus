# ChatGPT++

<p align="center">
  <img src="docs/images/chatgpt-plus-plus.png" alt="ChatGPT++ 图标" width="160">
</p>

<p align="center">
  中文 | <a href="README_EN.md">English</a>
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/Gzmomo001/chatgpt-plus-plus">
  <img alt="Stars" src="https://img.shields.io/github/stars/Gzmomo001/chatgpt-plus-plus">
  <img alt="License" src="https://img.shields.io/github/license/Gzmomo001/chatgpt-plus-plus">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.85%2B-orange">
  <img alt="Tauri" src="https://img.shields.io/badge/tauri-2.x-24C8DB">
</p>

ChatGPT++ 是面向 Codex App 的一体化管理应用。主程序按官方方式启动 Codex，并在独立管理界面中提供 Provider、会话、插件与维护能力，不修改 Codex Renderer、DOM 或页面请求。

## 快速使用

从 [GitHub Releases](https://github.com/Gzmomo001/chatgpt-plus-plus/releases) 下载最新版安装包：

- Windows：`ChatGPTPlusPlus-*-windows-x64-setup.exe`
- macOS Intel：`ChatGPTPlusPlus-*-macos-x64.dmg`
- macOS Apple Silicon：`ChatGPTPlusPlus-*-macos-arm64.dmg`

快速使用：

1. 安装 `ChatGPT++`。
2. 打开 `ChatGPT++`，进入统一的管理主界面。
3. 从应用中启动 Codex，或先配置 Provider、插件与启动维护选项后再启动。

Windows 桌面和开始菜单只创建一个 `ChatGPT++` 快捷方式；macOS 只安装 `/Applications/ChatGPT++.app`。Codex 启动、必要的协议代理与后台资源都由常驻托盘的 ChatGPT++ 主程序管理。

## 赞助商

<p align="center">
  <a href="https://jojocode.com/">
    <img src="docs/images/sponsor-jojocode.png" alt="JOJO Code" height="110">
  </a>
</p>
<p align="center">
  <a href="https://jojocode.com/"><strong>JOJO Code｜ChatGPT++ 官方中转站</strong></a><br>
  ChatGPT++ 官方中转站，主打稳定接入和划算价格，支持 GPT-5.6 全系列、Fable 5、Sonnet 5、GPT-5.5、GPT-5.4、Claude Opus 4.8、Claude Opus 4.7、gpt-image-2 等模型与图像能力，适合日常开发、团队协作和长期项目工作流。
</p>

<a href="mailto:1727532@qq.com">想显示在下方？</a>
<p align="center">
</p>
<table>
  <tr>
    <th width="180">🏆 赞助商 🏆</th>
    <th>介绍</th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://jojocode.com/">
        <img src="docs/images/sponsor-jojocode.png" alt="JOJO Code" height="80">
      </a>
    </td>
    <td><a href="https://jojocode.com/"><strong>JOJO Code｜ChatGPT++ 官方中转站</strong></a><br>感谢 JOJO Code 赞助本项目。JOJO Code 是 ChatGPT++ 官方中转站，提供价格划算、稳定易接入的 Codex API 中转服务，支持 GPT-5.6 全系列、Fable 5、Sonnet 5、GPT-5.5、GPT-5.4、Claude Opus 4.8、Claude Opus 4.7、gpt-image-2 等模型与图像能力，适合日常开发、快速配置、团队协作和长期使用。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://aigocode.com/invite/CodexPlusPlus">
        <img src="docs/images/sponsor-aigocode.png" alt="AIGoCode" height="80">
      </a>
    </td>
    <td><a href="https://aigocode.com/invite/CodexPlusPlus"><strong>AIGoCode</strong></a><br>感谢 AIGoCode 赞助了本项目！AIGoCode 是一个集成了 Claude Code、Codex 以及 Gemini 最新模型的一站式平台，为你提供稳定、高效且高性价比的AI编程服务。本站提供灵活的订阅计划，支持多风险，国内直连，无需魔法，极速响应。AIGoCode 为 ChatGPTPlusPlus 的用户提供了特别福利，通过<a href="https://aigocode.com/invite/CodexPlusPlus">此链接注册</a>的用户首次充值可以获得额外10%奖励额度！</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://api.icreat.ai">
        <img src="docs/images/sponsor-icreat-api.jpg" alt="iCreat API" height="80">
      </a>
    </td>
    <td><a href="https://api.icreat.ai"><strong>iCreat API</strong></a><br>感谢 iCreat API 赞助了本项目！iCreat API 是面向个人开发者、团队和企业的高性能 AI 模型 API 中转平台，稳定接入官方渠道，覆盖谷歌、火山、昆仑万维、腾讯云等开白名单资源。平台集成 Anthropic、ByteDance、OpenAI、DeepSeek、Google、Minimax、Kwai 等主流供应商，提供超 60 款模型调用，并通过统一控制台支持多维度模型筛选、计费类型管理和分组权限控制。支持 Pay as you go 与余额计费，企业用户可正常开票并获得专属对接服务。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/Liuchun-oss/codelf-agent">
        <img src="docs/images/sponsor-codelf.png" alt="Codelf" height="80">
      </a>
    </td>
    <td><a href="https://github.com/Liuchun-oss/codelf-agent"><strong>Codelf</strong></a><br>Codelf 是内置自主式 AI Agent 的桌面应用，也是一款完整编辑器。它支持用自然语言开发项目、整理资料、操作电脑和调用本地程序，国内可直接使用，支持多家大模型，并通过高上下文缓存命中降低使用成本。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://xc.y1yun.net/">
        <img src="docs/images/sponsor-yiyun-tech.jpg" alt="屹芸科技" height="80">
      </a>
    </td>
    <td><a href="https://xc.y1yun.net/"><strong>屹芸科技</strong></a><br>屹芸科技旗下拥有九五云商发卡网、屹芸付支付系统等面向 AI 聚合赛道的收付产品，支持微信、支付宝、银联、云闪付等通道，提供低费率、D1/D0 结算、7×24 小时技术支持和企微客户专属服务群。平台通道费率稳定、结算准时，并提供高强度网站防护，帮助商户稳定开展线上销售。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://sui-xiang.com/">
        <img src="docs/images/sponsor-sui-xiang-ai-gateway.jpg" alt="随想AI网关" width="150">
      </a>
    </td>
    <td><a href="https://sui-xiang.com/"><strong>随想AI网关</strong></a><br>感谢随想AI网关对本项目的赞助！随想AI网关是一家可靠高效的 API 中继服务提供商，提供 Claude、Codex、Gemini 等中继服务，注重隐私，承诺无数据倒卖、无模型掺水，并提供透明、快速的售后支持。新账户注册每日签到送 0.5 元测试额度，充值额度 1:1，无需订阅，按量付费。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://smallice.xyz/register?aff=FSNMGR2THBLN">
        <img src="docs/images/sponsor-smallice.png" alt="Smallice" height="80">
      </a>
    </td>
    <td><a href="https://smallice.xyz/register?aff=FSNMGR2THBLN"><strong>Smallice｜AI 中转站</strong></a><br>感谢 Smallice 赞助本项目！Smallice 是一把钥匙，通往所有值得调用的语言模型。一个统一的 endpoint，作为你应用之下、无需多言的基础层。无论你召唤的是 Claude、GPT、Gemini 还是 DeepSeek，调用的形式从此恒等。通过<a href="https://smallice.xyz/register?aff=FSNMGR2THBLN">此链接注册</a>即可开始使用。</td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://aihub.top/register?aff=ZYD8UJV274HD">
        <img src="docs/images/sponsor-aihub.jpg" alt="AIHub" height="80">
      </a>
    </td>
    <td><a href="https://aihub.top/register?aff=ZYD8UJV274HD"><strong>AIHub</strong></a><br>AIHub 是一家面向个人开发者和企业团队的高可用 AI 模型 API 中转平台。支持 Codex / ClaudeCode，价格约为官方 1 折不到。我们不生产 Token，我们是 Token 搬运工！通过<a href="https://aihub.top/register?aff=ZYD8UJV274HD">此链接注册</a>并使用优惠码 <code>CODEXPLUSPLUS</code>，即可获得 3$ 测试额度。</td>
  </tr>
</table>

## 交流与支持

欢迎加入 ChatGPT++ 交流群（QQ群：830629290），反馈问题、交流使用体验或提出新功能建议。

微信群：<a href="https://docs.qq.com/doc/DQ2VOanZTTFZJcUpZ#">点击这里获取最新微信群二维码</a>。

<img src="docs/images/discussion-group-qr.jpg" alt="ChatGPT++ 微信群二维码" width="260">

Telegram 频道：<https://t.me/CodexPlusPlus>

## 主要功能

- Rust 后端内置 Codex 启动生命周期与按需 Relay protocol proxy，不依赖额外 helper 程序。
- Tauri + React 主界面，支持深色/浅色切换。
- 按官方方式启动 Codex/ChatGPT，不修改 Renderer、DOM 或页面请求。
- 多 Provider 配置：写入受管理的 `ChatGPTPlusPlus` provider，并可切回官方 ChatGPT 登录态。
- 管理器会话页支持删除、Markdown 导出和 Token 使用历史。
- 管理器直接维护插件 marketplace、插件与技能库存，不依赖 Codex 页面注入。
- Provider 同步：启动前同步本地会话 metadata，切换供应商后旧会话仍可见。
- 按模型粒度配置上下文窗口：「模型列表」分为左右两列，左侧填模型名，右侧填上下文窗口（如 `1M`、`200K` 或 `1000000`）；ChatGPT++ 自动生成 `model_catalog_json` 并注入 `config.toml`，切换模型即生效。右侧留空则使用 Codex 默认长度。
- GitHub Release 自动更新，统一从 ChatGPT++ 主界面检查和安装；内部 helper 可提示主应用显示更新页。
- Windows 单实例、无黑框启动、管理员权限清单、系统桌面路径识别。
- macOS x64/arm64 分架构 DMG，`ChatGPT++.app` 只包含一个主可执行程序。

## 中转注入

中转注入适合已经在 Codex/ChatGPT 中完成官方账号登录，同时希望把模型请求转到自定义兼容 API 的场景。

这种混合模式的边界是：

- 官方 ChatGPT/Codex 登录态继续负责 Codex App 的账号能力和插件入口。
- 中转配置只接管模型请求使用的 Base URL、Key 和模型名称。
- 兼容 API 供应商不需要固定为某一家；只要上游协议和 Codex 配置匹配即可。
- 清除 API 模式后应能回到官方登录态，继续使用官方账号和插件。

应用中转注入前建议先做一次最小检查：

1. 先确认 Codex 已检测到 ChatGPT 登录状态，插件入口可用。
2. 确认自定义 Base URL 可访问，并且支持所选上游协议（例如 Responses 兼容接口）。
3. 用目标 Key 做一次最小认证测试，例如模型列表或很短的消息请求。
4. 只记录 Key 是否存在和认证结果，不要把真实 Key 写入日志、截图或 issue。
5. 确认 `~/.codex/config.toml` 已有备份，便于清除 API 模式后回滚。

在 ChatGPT++ 的“中转注入”页面：

1. 确认已经检测到 ChatGPT 登录状态。
2. 添加一个或多个中转配置，填写 Base URL 和 Key。
3. 选择当前配置并应用中转注入。
4. 启动 `ChatGPT++`。

ChatGPT++ 会在 `~/.codex/config.toml` 中写入类似配置：

```toml
model_provider = "ChatGPTPlusPlus"

[model_providers.ChatGPTPlusPlus]
name = "ChatGPTPlusPlus"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://example.com/v1"
experimental_bearer_token = "sk-..."
```

如果需要回到官方登录态，在“中转注入”页面点击清除 API 模式即可移除 `OPENAI_API_KEY` 相关配置并切回官方 ChatGPT 登录模式。

## 启动维护与插件能力

ChatGPT++ 可独立启用 Computer Use Guard 与快速启动，并直接读取 Codex 官方 marketplace 和 `config.toml` 来管理插件与技能。会话删除、Markdown 导出和 Token 使用历史也都在管理器内完成，不依赖 Codex 页面注入。

## 推荐内容

推荐内容来自远程广告列表：

```text
https://raw.githubusercontent.com/BigPizzaV3/Ad-List/main/ads.json
https://cdn.jsdelivr.net/gh/BigPizzaV3/Ad-List@main/ads.json
```

请求时会自动追加 `?v=时间戳` 绕开 CDN 旧缓存。推荐内容加载慢不会影响后端连接状态。

## 自动更新与安装包

ChatGPT++ 通过 GitHub Release 发布安装包。Windows 会生成 NSIS 安装程序，macOS 会生成 Intel x64 和 Apple Silicon arm64 两个 DMG。

ChatGPT++ 的“关于”页可以检查并启动更新。

## 数据位置

- Codex 配置：`~/.codex/config.toml`
- Codex 登录状态：`~/.codex/auth.json`
- Codex 本地数据库：优先读取 `~/.codex/sqlite/*.db`，旧版回退到 `~/.codex/state_5.sqlite`
- ChatGPT++ 状态与日志：新安装使用 `~/.chatgpt-plus-plus/`；检测到旧 `~/.codex-session-delete/` 时会原地兼容读取。
- Provider 同步备份：`~/.codex/backups_state/provider-sync`

## 常见问题

### macOS 提示无法打开或已损坏

当前安装包未签名/未公证时，macOS Gatekeeper 可能拦截，出现“已损坏，无法打开”的提示：

![macOS 提示 ChatGPT++ 已损坏](docs/images/macos-damaged-warning.png)

如果遇到该提示，可以在终端执行下面两条命令，解除苹果系统的安全隔离限制：

```bash
sudo xattr -rd com.apple.quarantine /Applications/ChatGPT++.app
sudo xattr -rd com.apple.quarantine /Applications/ChatGPT++.app
```

执行后重新打开 `ChatGPT++` 即可。

### macOS Intel 能用吗

可以。Release 会分别提供 `macos-x64.dmg` 和 `macos-arm64.dmg`。Intel Mac 下载 x64 包，Apple Silicon 下载 arm64 包。

## 开发

开发构建使用 `127.0.0.1:57320` 作为管理器单实例端口，与生产构建使用的
`127.0.0.1:57319` 分离，因此已安装的生产版可以和 `pnpm dev` 同时打开。
这不改变 Relay protocol proxy 默认使用的 `127.0.0.1:57321`。

```bash
# 前端检查
cd apps/chatgpt-plus-manager
pnpm install
pnpm check
pnpm vite:build

# Rust 检查
cd ../..
cargo fmt --check
cargo test
cargo build --release
```

主要结构：

```text
apps/
  chatgpt-plus-manager/           ChatGPT++ Tauri 主应用与后台运行时
crates/
  chatgpt-plus-core/              启动、配置、更新、安装和协议代理等核心逻辑
  chatgpt-plus-data/              会话数据、导出、Provider 同步
scripts/installer/
  windows/ChatGPTPlusPlus.nsi     Windows NSIS 安装包
  macos/package-dmg.sh          macOS DMG 打包
```

## 友情链接

- [LINUX DO](https://linux.do)

## 开源协议

Copyright (C) 2026 BigPizzaV3

ChatGPTPlusPlus 自本次许可证变更后的版本起，采用 [GNU Affero General Public License v3.0](LICENSE)，SPDX 标识为 `AGPL-3.0-only`。

修改并分发本项目，或通过网络向用户提供修改后的版本时，必须按照 AGPLv3 向对应用户提供完整的对应源代码。许可证仅覆盖 ChatGPTPlusPlus 自身代码，不授予 OpenAI、ChatGPT、Codex 的商标、应用资源或其他第三方内容的权利。此前已经按照其他许可获得的版本不受本次变更追溯影响。

## 说明

ChatGPT++ 是独立管理工具，不修改 Codex App 原始文件，也不依赖其 Renderer、DOM 或页面结构。
