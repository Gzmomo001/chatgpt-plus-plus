use std::collections::HashSet;
#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
pub use crate::windows_integration::WindowsProcessInfo;

pub const RESTART_STOP_WAIT_TIMEOUT_MS: u64 = 5_000;
#[cfg(windows)]
const RESTART_STOP_WAIT_INTERVAL_MS: u64 = 100;

pub fn codex_process_ids<'a>(processes: impl IntoIterator<Item = (u32, &'a str)>) -> Vec<u32> {
    processes
        .into_iter()
        .filter_map(|(process_id, executable)| {
            is_windowsapps_codex_app_process(executable).then_some(process_id)
        })
        .collect()
}

fn is_windowsapps_codex_app_process(executable: &str) -> bool {
    let executable = executable.replace('/', "\\").to_ascii_lowercase();
    let Some((_, after_windows_apps)) = executable.split_once("\\windowsapps\\") else {
        return false;
    };
    let Some((package_name, after_package)) = after_windows_apps.split_once('\\') else {
        return false;
    };
    (crate::app_paths::is_supported_windows_app_package_name(package_name)
        || package_name.starts_with("openai.chatgpt-desktop_"))
        && after_package.starts_with("app\\")
        && !after_package.starts_with("app\\resources\\")
        && after_package
            .rsplit('\\')
            .next()
            .is_some_and(crate::app_paths::is_supported_app_executable_name)
}

pub fn process_ids_still_running(
    expected: &[u32],
    running: impl IntoIterator<Item = u32>,
) -> Vec<u32> {
    let expected = expected.iter().copied().collect::<HashSet<_>>();
    running
        .into_iter()
        .filter(|process_id| expected.contains(process_id))
        .collect()
}

#[cfg(windows)]
pub fn find_codex_processes() -> Vec<u32> {
    let processes: Vec<_> = crate::windows_integration::enumerate_processes()
        .into_iter()
        .filter(|process| crate::app_paths::is_supported_app_executable_name(&process.exe_file))
        .collect();
    find_codex_processes_from_snapshot(&processes)
}

/// Filter an already enumerated Windows process snapshot for Codex processes.
/// Exposed so process matching can be tested without scanning the live system.
#[cfg(windows)]
pub fn find_codex_processes_from_snapshot(
    processes: &[crate::windows_integration::WindowsProcessInfo],
) -> Vec<u32> {
    let mut ids = codex_process_ids(
        processes
            .iter()
            .filter_map(|process| {
                process
                    .executable_path
                    .as_deref()
                    .map(|path| (process.process_id, path.to_string_lossy().to_string()))
            })
            .collect::<Vec<_>>()
            .iter()
            .map(|(pid, path)| (*pid, path.as_str())),
    );

    // Local/portable installs use Codex.exe as the Electron main process. Do not match
    // lowercase codex.exe here; that is commonly the CLI binary. ChatGPT.exe is accepted
    // only for packaged Store apps above, because the standalone ChatGPT app can be a
    // normal ChatGPT session rather than Codex.
    for process in processes {
        if process.exe_file == "Codex.exe" {
            ids.push(process.process_id);
        }
    }

    ids.sort_unstable();
    ids.dedup();
    ids
}

#[cfg(not(windows))]
pub fn find_codex_processes() -> Vec<u32> {
    Vec::new()
}

#[cfg(windows)]
pub fn stop_codex_processes_and_wait() {
    terminate_and_wait_for_exit(
        find_codex_processes(),
        RESTART_STOP_WAIT_TIMEOUT_MS,
        RESTART_STOP_WAIT_INTERVAL_MS,
    );
}

#[cfg(not(windows))]
pub fn stop_codex_processes_and_wait() {}

#[cfg(windows)]
fn terminate_and_wait_for_exit(process_ids: Vec<u32>, timeout_ms: u64, interval_ms: u64) {
    if process_ids.is_empty() {
        return;
    }
    for process_id in &process_ids {
        let _ = crate::windows_integration::terminate_process(*process_id);
    }
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        let running_process_ids = crate::windows_integration::enumerate_processes()
            .into_iter()
            .map(|process| process.process_id);
        let remaining = process_ids_still_running(&process_ids, running_process_ids);
        if remaining.is_empty() || std::time::Instant::now() >= deadline {
            if !remaining.is_empty() {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "codex_processes.stop_wait_timeout",
                    serde_json::json!({
                        "remaining_process_ids": remaining,
                        "timeout_ms": timeout_ms
                    }),
                );
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(interval_ms));
    }
}
