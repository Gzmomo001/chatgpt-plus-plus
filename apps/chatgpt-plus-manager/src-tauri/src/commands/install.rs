use std::collections::BTreeMap;
use std::path::Path;

use chatgpt_plus_core::script_market::{self, MarketScript, ScriptMarketManifest};
use chatgpt_plus_core::settings::{BackendSettings, SettingsStore};
use serde::Serialize;
use serde_json::{Value, json};

use crate::install::{self, InstallActionResult, InstallOptions};
use chatgpt_plus_core::user_scripts::default_user_script_manager;

use super::shared::{CommandResult, SettingsPayload, failed, ok};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceRepairPayload {
    pub codex_home: String,
    pub marketplace_root: Option<String>,
    pub initialized: bool,
    pub configured: bool,
    pub needs_repair: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceStatusPayload {
    pub codex_home: String,
    pub marketplace_root: Option<String>,
    pub config_registered: bool,
    pub needs_repair: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePluginMarketplacePayload {
    pub codex_home: String,
    pub marketplace_root: Option<String>,
    pub config_registered: bool,
    pub needs_repair: bool,
    pub plugin_count: usize,
    pub skill_count: usize,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMutationRequest {
    pub plugin_id: String,
    pub action: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPluginMarketplaceRequest {
    pub name: String,
    pub source: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct WatcherPayload {
    pub enabled: bool,
    pub disabled_flag: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AdsPayload {
    pub version: u64,
    pub ads: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptMarketPayload {
    pub market: Value,
    pub user_scripts: Value,
}

#[tauri::command]
pub async fn load_ads() -> CommandResult<AdsPayload> {
    match chatgpt_plus_core::ads::fetch_ad_list().await {
        Ok(payload) => ok("推荐内容已加载。", ads_payload(payload)),
        Err(error) => failed(
            &format!("推荐内容加载失败：{error}"),
            AdsPayload {
                version: 1,
                ads: Vec::new(),
            },
        ),
    }
}

#[tauri::command]
pub async fn refresh_script_market() -> CommandResult<ScriptMarketPayload> {
    match script_market::fetch_market_manifest(script_market::DEFAULT_MARKET_INDEX_URL).await {
        Ok(manifest) => ok(
            "脚本市场已刷新。",
            script_market_payload_from_manifest(&manifest, "ok", "脚本市场已刷新。"),
        ),
        Err(error) => failed(
            &format!("脚本市场加载失败：{error}"),
            failed_script_market_payload(&format!("脚本市场加载失败：{error}")),
        ),
    }
}

#[tauri::command]
pub async fn install_market_script(id: String) -> CommandResult<ScriptMarketPayload> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return failed(
            "脚本 id 不能为空。",
            failed_script_market_payload("脚本 id 不能为空。"),
        );
    }
    let manifest =
        match script_market::fetch_market_manifest(script_market::DEFAULT_MARKET_INDEX_URL).await {
            Ok(manifest) => manifest,
            Err(error) => {
                return failed(
                    &format!("脚本市场加载失败：{error}"),
                    failed_script_market_payload(&format!("脚本市场加载失败：{error}")),
                );
            }
        };
    let Some(script) = manifest.scripts.iter().find(|script| script.id == trimmed) else {
        return failed(
            "市场清单中未找到该脚本。",
            script_market_payload_from_manifest(&manifest, "failed", "市场清单中未找到该脚本。"),
        );
    };
    let manager = default_user_script_manager();
    match script_market::install_market_script(&manager, script).await {
        Ok(()) => ok(
            "脚本已安装。",
            script_market_payload_from_manifest(&manifest, "ok", "脚本已安装。"),
        ),
        Err(error) => failed(
            &format!("安装脚本失败：{error}"),
            script_market_payload_from_manifest(
                &manifest,
                "failed",
                &format!("安装脚本失败：{error}"),
            ),
        ),
    }
}

#[tauri::command]
pub fn set_user_script_enabled(key: String, enabled: bool) -> CommandResult<SettingsPayload> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return failed("脚本 key 不能为空。", fallback_settings_payload());
    }
    let manager = default_user_script_manager();
    match manager.set_script_enabled(trimmed, enabled) {
        Ok(_) => settings_payload(
            if enabled {
                "脚本已启用。"
            } else {
                "脚本已禁用。"
            },
            "脚本启停失败",
        ),
        Err(error) => failed(
            &format!("脚本启停失败：{error}"),
            fallback_settings_payload(),
        ),
    }
}

#[tauri::command]
pub fn delete_user_script(key: String) -> CommandResult<SettingsPayload> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return failed("脚本 key 不能为空。", fallback_settings_payload());
    }
    let manager = default_user_script_manager();
    match manager.delete_user_script(trimmed) {
        Ok(_) => settings_payload("脚本已删除。", "脚本删除失败"),
        Err(error) => failed(
            &format!("脚本删除失败：{error}"),
            fallback_settings_payload(),
        ),
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> CommandResult<Value> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return failed("只允许打开 http 或 https 链接。", json!({}));
    }
    match open_url(trimmed) {
        Ok(()) => ok("已在系统浏览器打开链接。", json!({ "url": trimmed })),
        Err(error) => failed(&format!("打开链接失败：{error}"), json!({ "url": trimmed })),
    }
}

#[tauri::command]
pub async fn install_entrypoints() -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(install::install_entrypoints)
        .await
        .unwrap_or_else(|error| install_background_failure("安装入口", error))
}

#[tauri::command]
pub async fn uninstall_entrypoints(options: InstallOptions) -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(move || install::uninstall_entrypoints(options))
        .await
        .unwrap_or_else(|error| install_background_failure("卸载入口", error))
}

#[tauri::command]
pub async fn repair_shortcuts() -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(install::repair_shortcuts)
        .await
        .unwrap_or_else(|error| install_background_failure("修复快捷方式", error))
}

#[tauri::command]
pub fn plugin_marketplace_status() -> CommandResult<PluginMarketplaceStatusPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let status = chatgpt_plus_core::plugin_marketplace::openai_curated_marketplace_status(&home);
    ok(
        if status.needs_repair() {
            "插件市场需要初始化或注册。"
        } else {
            "插件市场已可用。"
        },
        PluginMarketplaceStatusPayload {
            codex_home: home.to_string_lossy().to_string(),
            marketplace_root: status
                .marketplace_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            config_registered: status.config_registered,
            needs_repair: status.needs_repair(),
        },
    )
}

#[tauri::command]
pub fn plugin_marketplace_inventory()
-> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    plugin_marketplace_inventory_from_home(&home)
}

pub(super) fn plugin_marketplace_inventory_from_home(
    home: &Path,
) -> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    match chatgpt_plus_core::plugin_marketplace::plugin_marketplace_inventory(home) {
        Ok(inventory) => ok(
            &format!("已读取 {} 个插件。", inventory.plugins.len()),
            inventory,
        ),
        Err(error) => failed(
            &format!("读取插件库存失败：{error}"),
            chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory {
                marketplaces: Vec::new(),
                plugins: Vec::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn mutate_plugin(
    request: PluginMutationRequest,
) -> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    mutate_plugin_in_home(&home, request)
}

pub(super) fn mutate_plugin_in_home(
    home: &Path,
    request: PluginMutationRequest,
) -> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    use chatgpt_plus_core::plugin_marketplace::PluginMutation;
    let mutation = match request.action.as_str() {
        "install" => PluginMutation::Install,
        "uninstall" => PluginMutation::Uninstall,
        "enable" => PluginMutation::Enable,
        "disable" => PluginMutation::Disable,
        _ => {
            return failed(
                "不支持的插件操作。",
                chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory {
                    marketplaces: Vec::new(),
                    plugins: Vec::new(),
                },
            );
        }
    };
    if let Err(error) =
        chatgpt_plus_core::plugin_marketplace::mutate_plugin(home, &request.plugin_id, mutation)
    {
        return failed(
            &format!("插件操作失败：{error}"),
            chatgpt_plus_core::plugin_marketplace::plugin_marketplace_inventory(home).unwrap_or(
                chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory {
                    marketplaces: Vec::new(),
                    plugins: Vec::new(),
                },
            ),
        );
    }
    match chatgpt_plus_core::plugin_marketplace::plugin_marketplace_inventory(home) {
        Ok(inventory) => ok("插件配置已更新。", inventory),
        Err(error) => failed(
            &format!("插件已更新，但刷新库存失败：{error}"),
            chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory {
                marketplaces: Vec::new(),
                plugins: Vec::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn register_plugin_marketplace(
    request: RegisterPluginMarketplaceRequest,
) -> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    register_plugin_marketplace_in_home(&home, request)
}

pub(super) fn register_plugin_marketplace_in_home(
    home: &Path,
    request: RegisterPluginMarketplaceRequest,
) -> CommandResult<chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory> {
    if let Err(error) = chatgpt_plus_core::plugin_marketplace::register_local_plugin_marketplace(
        home,
        &request.name,
        Path::new(&request.source),
    ) {
        return failed(
            &format!("注册插件市场失败：{error}"),
            chatgpt_plus_core::plugin_marketplace::PluginMarketplaceInventory {
                marketplaces: Vec::new(),
                plugins: Vec::new(),
            },
        );
    }
    plugin_marketplace_inventory_from_home(home)
}

#[tauri::command]
pub async fn refresh_plugin_marketplace() -> CommandResult<PluginMarketplaceRepairPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match chatgpt_plus_core::plugin_marketplace::refresh_openai_curated_marketplace_and_configure(
        &home,
    )
    .await
    {
        Ok(result) => ok(
            "官方插件市场已刷新并注册。",
            PluginMarketplaceRepairPayload {
                codex_home: home.to_string_lossy().to_string(),
                marketplace_root:
                    chatgpt_plus_core::plugin_marketplace::openai_curated_marketplace_status(&home)
                        .marketplace_root
                        .map(|path| path.to_string_lossy().to_string()),
                initialized: result.initialized,
                configured: result.configured,
                needs_repair: false,
            },
        ),
        Err(error) => failed(
            &format!("刷新官方插件市场失败：{error}"),
            PluginMarketplaceRepairPayload {
                codex_home: home.to_string_lossy().to_string(),
                marketplace_root: None,
                initialized: false,
                configured: false,
                needs_repair: true,
            },
        ),
    }
}

#[tauri::command]
pub fn refresh_remote_plugin_marketplace() -> CommandResult<RemotePluginMarketplacePayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match chatgpt_plus_core::plugin_marketplace::refresh_openai_curated_remote_marketplace_and_configure(&home) {
        Ok(_) => remote_plugin_marketplace_status(),
        Err(error) => failed(
            &format!("刷新官方远端插件市场失败：{error}"),
            RemotePluginMarketplacePayload { codex_home: home.to_string_lossy().to_string(), marketplace_root: None, config_registered: false, needs_repair: true, plugin_count: 0, skill_count: 0 },
        ),
    }
}

#[tauri::command]
pub async fn repair_plugin_marketplace() -> CommandResult<PluginMarketplaceRepairPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match chatgpt_plus_core::plugin_marketplace::initialize_openai_curated_marketplace_and_configure(
        &home,
    )
    .await
    {
        Ok(result) => ok(
            if result.initialized {
                "插件市场已从 openai/plugins 初始化并注册。"
            } else if result.configured {
                "已注册本地插件市场。"
            } else {
                "插件市场已可用，无需修复。"
            },
            PluginMarketplaceRepairPayload {
                codex_home: home.to_string_lossy().to_string(),
                marketplace_root:
                    chatgpt_plus_core::plugin_marketplace::openai_curated_marketplace_status(&home)
                        .marketplace_root
                        .as_ref()
                        .map(|path| path.to_string_lossy().to_string()),
                initialized: result.initialized,
                configured: result.configured,
                needs_repair: false,
            },
        ),
        Err(error) => failed(
            &format!("插件市场修复失败：{error}"),
            PluginMarketplaceRepairPayload {
                codex_home: home.to_string_lossy().to_string(),
                marketplace_root:
                    chatgpt_plus_core::plugin_marketplace::openai_curated_marketplace_status(&home)
                        .marketplace_root
                        .as_ref()
                        .map(|path| path.to_string_lossy().to_string()),
                initialized: false,
                configured: false,
                needs_repair: true,
            },
        ),
    }
}

#[tauri::command]
pub fn remote_plugin_marketplace_status() -> CommandResult<RemotePluginMarketplacePayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let status =
        chatgpt_plus_core::plugin_marketplace::openai_curated_remote_marketplace_status(&home);
    let (plugin_count, skill_count) =
        remote_plugin_marketplace_counts(status.marketplace_root.as_deref());
    ok(
        if status.needs_repair() {
            "官方远端插件缓存需要释放或注册。"
        } else {
            "官方远端插件缓存已可用。"
        },
        RemotePluginMarketplacePayload {
            codex_home: home.to_string_lossy().to_string(),
            marketplace_root: status
                .marketplace_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            config_registered: status.config_registered,
            needs_repair: status.needs_repair(),
            plugin_count,
            skill_count,
        },
    )
}

#[tauri::command]
pub fn repair_remote_plugin_marketplace() -> CommandResult<RemotePluginMarketplacePayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match chatgpt_plus_core::plugin_marketplace::ensure_openai_curated_remote_marketplace_available(
        &home,
    ) {
        Ok(result) => {
            let status =
                chatgpt_plus_core::plugin_marketplace::openai_curated_remote_marketplace_status(
                    &home,
                );
            let (plugin_count, skill_count) =
                remote_plugin_marketplace_counts(status.marketplace_root.as_deref());
            ok(
                if result.initialized {
                    "已释放并注册内置官方远端插件缓存。"
                } else if result.configured {
                    "已注册官方远端插件缓存。"
                } else {
                    "官方远端插件缓存已可用，无需修复。"
                },
                RemotePluginMarketplacePayload {
                    codex_home: home.to_string_lossy().to_string(),
                    marketplace_root: status
                        .marketplace_root
                        .as_ref()
                        .map(|path| path.to_string_lossy().to_string()),
                    config_registered: status.config_registered,
                    needs_repair: status.needs_repair(),
                    plugin_count,
                    skill_count,
                },
            )
        }
        Err(error) => {
            let status =
                chatgpt_plus_core::plugin_marketplace::openai_curated_remote_marketplace_status(
                    &home,
                );
            let (plugin_count, skill_count) =
                remote_plugin_marketplace_counts(status.marketplace_root.as_deref());
            failed(
                &format!("官方远端插件缓存修复失败：{error}"),
                RemotePluginMarketplacePayload {
                    codex_home: home.to_string_lossy().to_string(),
                    marketplace_root: status
                        .marketplace_root
                        .as_ref()
                        .map(|path| path.to_string_lossy().to_string()),
                    config_registered: status.config_registered,
                    needs_repair: status.needs_repair(),
                    plugin_count,
                    skill_count,
                },
            )
        }
    }
}

pub(super) fn remote_plugin_marketplace_counts(root: Option<&Path>) -> (usize, usize) {
    let Some(root) = root else {
        return (0, 0);
    };
    let marketplace_path = root
        .join(".agents")
        .join("plugins")
        .join("marketplace.json");
    let plugin_count = std::fs::read_to_string(&marketplace_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|marketplace| {
            marketplace
                .get("plugins")
                .and_then(Value::as_array)
                .map(Vec::len)
        })
        .unwrap_or(0);
    let skill_count = count_skill_files(&root.join("plugins")).unwrap_or(0);
    (plugin_count, skill_count)
}

pub(super) fn count_skill_files(root: &Path) -> std::io::Result<usize> {
    if !root.is_dir() {
        return Ok(0);
    }
    let mut total = 0;
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() {
            total += count_skill_files(&path)?;
        } else if path.file_name().and_then(|name| name.to_str()) == Some("SKILL.md") {
            total += 1;
        }
    }
    Ok(total)
}

#[tauri::command]
pub async fn check_update() -> CommandResult<Value> {
    match chatgpt_plus_core::update::check_for_update(chatgpt_plus_core::version::VERSION).await {
        Ok(update) => {
            let status = if update.update_available {
                "ok"
            } else {
                "not_checked"
            };
            CommandResult {
                status: status.to_string(),
                message: if update.update_available {
                    "发现可用更新。".to_string()
                } else {
                    "当前已是最新版本。".to_string()
                },
                payload: json!({
                    "currentVersion": update.current_version,
                    "latestVersion": update.latest_version,
                    "releaseSummary": update.release_summary,
                    "assetName": update.asset_name,
                    "assetUrl": update.asset_url,
                    "updateAvailable": update.update_available,
                    "progress": 0
                }),
            }
        }
        Err(error) => failed(
            &format!("检查更新失败：{error}"),
            json!({
                "currentVersion": chatgpt_plus_core::version::VERSION,
                "latestVersion": Value::Null,
                "releaseSummary": "",
                "assetName": Value::Null,
                "assetUrl": Value::Null,
                "updateAvailable": false,
                "progress": 0
            }),
        ),
    }
}

#[tauri::command]
pub async fn perform_update(
    release: Option<chatgpt_plus_core::update::Release>,
) -> CommandResult<Value> {
    let Some(release) = release else {
        return failed(
            "请先检查更新并选择可下载的 Release asset。",
            json!({
                "currentVersion": chatgpt_plus_core::version::VERSION,
                "progress": 0
            }),
        );
    };
    let download_dir = chatgpt_plus_core::paths::default_app_state_dir().join("updates");
    match chatgpt_plus_core::update::perform_update(&release, &download_dir).await {
        Ok(result) => ok(
            "安装包已下载并启动，请按安装向导完成更新。",
            json!({
                "currentVersion": chatgpt_plus_core::version::VERSION,
                "latestVersion": result.release.version,
                "releaseSummary": result.release.body,
                "installedPath": result.installer_path.to_string_lossy(),
                "launched": result.launched,
                "progress": 100
            }),
        ),
        Err(error) => failed(
            &format!("安装更新失败：{error}"),
            json!({
                "currentVersion": chatgpt_plus_core::version::VERSION,
                "latestVersion": release.version,
                "releaseSummary": release.body,
                "progress": 0
            }),
        ),
    }
}

#[tauri::command]
pub fn load_watcher_state() -> CommandResult<WatcherPayload> {
    ok("watcher 状态已加载。", watcher_payload())
}

#[tauri::command]
pub fn install_watcher() -> CommandResult<WatcherPayload> {
    let launcher_path = chatgpt_plus_core::install::companion_binary_path(
        chatgpt_plus_core::install::SILENT_BINARY,
    );
    match chatgpt_plus_core::watcher::install_watcher(&launcher_path, default_debug_port()) {
        Ok(()) => ok("watcher 已安装。", watcher_payload()),
        Err(error) => failed(&format!("安装 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn uninstall_watcher() -> CommandResult<WatcherPayload> {
    match chatgpt_plus_core::watcher::uninstall_watcher() {
        Ok(()) => ok("watcher 已移除。", watcher_payload()),
        Err(error) => failed(&format!("移除 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn enable_watcher() -> CommandResult<WatcherPayload> {
    match chatgpt_plus_core::watcher::enable_watcher() {
        Ok(()) => ok("watcher 已启用。", watcher_payload()),
        Err(error) => failed(&format!("启用 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn disable_watcher() -> CommandResult<WatcherPayload> {
    match chatgpt_plus_core::watcher::disable_watcher() {
        Ok(()) => ok("watcher 已禁用。", watcher_payload()),
        Err(error) => failed(&format!("禁用 watcher 失败：{error}"), watcher_payload()),
    }
}

pub(super) fn ads_payload(payload: Value) -> AdsPayload {
    AdsPayload {
        version: payload.get("version").and_then(Value::as_u64).unwrap_or(1),
        ads: payload
            .get("ads")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    }
}

pub(super) fn open_url(url: &str) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        chatgpt_plus_core::windows_open_url(url)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动系统浏览器失败：{error}"))
    }
}

fn settings_payload(message: &str, failure_context: &str) -> CommandResult<SettingsPayload> {
    match settings_payload_value() {
        Ok(payload) => ok(message, payload),
        Err((error, payload)) => failed(&format!("{failure_context}：{error}"), payload),
    }
}

fn settings_payload_value() -> Result<SettingsPayload, (anyhow::Error, SettingsPayload)> {
    let store = SettingsStore::default();
    let settings_path = chatgpt_plus_core::paths::default_settings_path()
        .to_string_lossy()
        .to_string();
    match store.load() {
        Ok(settings) => Ok(SettingsPayload {
            settings,
            settings_path,
            user_scripts: user_script_inventory(),
        }),
        Err(error) => Err((
            error,
            SettingsPayload {
                settings: BackendSettings::default(),
                settings_path,
                user_scripts: user_script_inventory(),
            },
        )),
    }
}

fn fallback_settings_payload() -> SettingsPayload {
    SettingsPayload {
        settings: SettingsStore::default().load().unwrap_or_default(),
        settings_path: chatgpt_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
        user_scripts: user_script_inventory(),
    }
}

fn user_script_inventory() -> Value {
    chatgpt_plus_core::user_scripts::default_user_script_inventory()
}

pub(super) fn failed_script_market_payload(message: &str) -> ScriptMarketPayload {
    ScriptMarketPayload {
        market: json!({
            "status": "failed",
            "message": message,
            "indexUrl": script_market::DEFAULT_MARKET_INDEX_URL,
            "updatedAt": "",
            "scripts": []
        }),
        user_scripts: user_script_inventory(),
    }
}

pub(super) fn script_market_payload_from_manifest(
    manifest: &ScriptMarketManifest,
    status: &str,
    message: &str,
) -> ScriptMarketPayload {
    let user_scripts = user_script_inventory();
    let installed = installed_market_versions(&user_scripts);
    let scripts = manifest
        .scripts
        .iter()
        .map(|script| market_script_payload(script, &installed))
        .collect::<Vec<_>>();
    ScriptMarketPayload {
        market: json!({
            "status": status,
            "message": message,
            "indexUrl": script_market::DEFAULT_MARKET_INDEX_URL,
            "updatedAt": manifest.updated_at.clone().unwrap_or_default(),
            "scripts": scripts
        }),
        user_scripts,
    }
}

pub(super) fn installed_market_versions(user_scripts: &Value) -> BTreeMap<String, String> {
    user_scripts
        .get("scripts")
        .and_then(Value::as_array)
        .map(|scripts| {
            scripts
                .iter()
                .filter_map(|script| {
                    let id = script.get("market_id").and_then(Value::as_str)?;
                    if id.is_empty() {
                        return None;
                    }
                    let version = script
                        .get("version")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    Some((id.to_string(), version))
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn market_script_payload(
    script: &MarketScript,
    installed: &BTreeMap<String, String>,
) -> Value {
    let installed_version = installed.get(&script.id).cloned().unwrap_or_default();
    let is_installed = !installed_version.is_empty();
    json!({
        "id": script.id,
        "name": script.name,
        "description": script.description,
        "version": script.version,
        "author": script.author,
        "tags": script.tags,
        "homepage": script.homepage,
        "script_url": script.script_url,
        "sha256": script.sha256,
        "installed": is_installed,
        "installedVersion": installed_version,
        "updateAvailable": is_installed && installed.get(&script.id).map(|version| version != &script.version).unwrap_or(false)
    })
}

pub(super) fn install_background_failure(
    action: &str,
    error: impl std::fmt::Display,
) -> InstallActionResult {
    let state = install::inspect_entrypoints();
    InstallActionResult {
        status: "failed".to_string(),
        message: format!("{action}后台任务失败：{error}"),
        app_shortcut: state.app_shortcut,
        legacy_management_shortcut: state.legacy_management_shortcut,
    }
}

pub(super) fn watcher_payload() -> WatcherPayload {
    let flag = chatgpt_plus_core::watcher::default_watcher_disabled_flag();
    WatcherPayload {
        enabled: !flag.exists(),
        disabled_flag: flag.to_string_lossy().to_string(),
    }
}
pub(super) fn default_debug_port() -> u16 {
    9229
}
