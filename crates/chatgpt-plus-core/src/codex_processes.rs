use std::collections::HashSet;
#[cfg(any(windows, target_os = "macos"))]
use std::time::Duration;

#[cfg(windows)]
pub use crate::windows_integration::WindowsProcessInfo;

pub const RESTART_STOP_WAIT_TIMEOUT_MS: u64 = 5_000;
#[cfg(any(windows, target_os = "macos"))]
const RESTART_STOP_WAIT_INTERVAL_MS: u64 = 100;
#[cfg(target_os = "macos")]
const RESTART_FORCE_KILL_WAIT_TIMEOUT_MS: u64 = 1_000;

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

pub fn macos_codex_process_ids<'a>(
    processes: impl IntoIterator<Item = (u32, &'a str)>,
) -> Vec<u32> {
    let mut ids = processes
        .into_iter()
        .filter_map(|(process_id, executable)| {
            is_macos_codex_app_main_process(executable).then_some(process_id)
        })
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    ids
}

fn is_macos_codex_app_main_process(executable: &str) -> bool {
    let executable = executable.replace('\\', "/").to_ascii_lowercase();
    let Some((bundle_path, app_executable)) = executable.rsplit_once(".app/contents/macos/") else {
        return false;
    };
    if app_executable != "chatgpt" && app_executable != "codex" {
        return false;
    }
    bundle_path
        .rsplit('/')
        .next()
        .is_some_and(|bundle_name| bundle_name.contains("chatgpt") || bundle_name.contains("codex"))
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

#[cfg(target_os = "macos")]
pub fn find_codex_processes() -> Vec<u32> {
    let Ok(output) = std::process::Command::new("ps")
        .args(["-axo", "pid=,comm="])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let snapshot = String::from_utf8_lossy(&output.stdout);
    let processes = snapshot.lines().filter_map(|line| {
        let line = line.trim();
        let split_at = line.find(char::is_whitespace)?;
        let process_id = line[..split_at].parse::<u32>().ok()?;
        let executable = line[split_at..].trim();
        (!executable.is_empty()).then_some((process_id, executable))
    });
    macos_codex_process_ids(processes)
}

#[cfg(all(not(windows), not(target_os = "macos")))]
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

#[cfg(target_os = "macos")]
pub fn stop_codex_processes_and_wait() {
    terminate_macos_processes_and_wait(
        find_codex_processes(),
        RESTART_STOP_WAIT_TIMEOUT_MS,
        RESTART_STOP_WAIT_INTERVAL_MS,
    );
}

#[cfg(all(not(windows), not(target_os = "macos")))]
pub fn stop_codex_processes_and_wait() {}

#[cfg(target_os = "macos")]
fn terminate_macos_processes_and_wait(process_ids: Vec<u32>, timeout_ms: u64, interval_ms: u64) {
    if process_ids.is_empty() {
        return;
    }
    for process_id in &process_ids {
        let _ = signal_macos_process(*process_id, "-TERM");
    }

    let remaining = wait_for_macos_process_exit(&process_ids, timeout_ms, interval_ms);
    if remaining.is_empty() {
        return;
    }
    for process_id in &remaining {
        let _ = signal_macos_process(*process_id, "-KILL");
    }
    let still_running =
        wait_for_macos_process_exit(&remaining, RESTART_FORCE_KILL_WAIT_TIMEOUT_MS, interval_ms);
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "codex_processes.macos_force_kill",
        serde_json::json!({
            "process_ids": remaining,
            "still_running_process_ids": still_running,
            "timeout_ms": timeout_ms
        }),
    );
}

#[cfg(target_os = "macos")]
fn wait_for_macos_process_exit(process_ids: &[u32], timeout_ms: u64, interval_ms: u64) -> Vec<u32> {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        let remaining = process_ids_still_running(process_ids, find_codex_processes());
        if remaining.is_empty() || std::time::Instant::now() >= deadline {
            return remaining;
        }
        std::thread::sleep(Duration::from_millis(interval_ms));
    }
}

#[cfg(target_os = "macos")]
fn signal_macos_process(process_id: u32, signal: &str) -> std::io::Result<()> {
    let process_id = process_id.to_string();
    let status = std::process::Command::new("/bin/kill")
        .args([signal, &process_id])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "{signal} failed for process {process_id} with {status}"
        )))
    }
}

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
