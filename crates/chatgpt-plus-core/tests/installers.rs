use chatgpt_plus_core::install::{
    InstallOptions, MANAGER_BINARY, SILENT_BINARY, app_bundle_names, build_macos_app_bundle,
    build_windows_entrypoint_plan, companion_binary_path_from_exe, default_install_root_strategy,
    legacy_entrypoint_paths, shortcut_names,
};

#[test]
fn windows_entrypoint_plan_exposes_only_the_main_app_shortcut() {
    let options = InstallOptions {
        install_root: Some("C:/Users/A/Desktop".into()),
        launcher_path: Some("C:/Tools/chatgpt-plus-plus.exe".into()),
        manager_path: Some("C:/Tools/chatgpt-plus-plus-manager.exe".into()),
        remove_owned_data: false,
    };

    let plan = build_windows_entrypoint_plan(&options);

    assert!(plan.app_shortcut.ends_with("ChatGPT++.lnk"));
    assert_eq!(
        plan.app_shortcut_target,
        "C:/Tools/chatgpt-plus-plus-manager.exe"
    );
    assert!(
        plan.legacy_management_shortcut
            .ends_with("ChatGPT++ 管理工具.lnk")
    );
    assert_eq!(plan.launcher_path, "C:/Tools/chatgpt-plus-plus.exe");
    assert_eq!(plan.app_path, "C:/Tools/chatgpt-plus-plus-manager.exe");
    assert_eq!(plan.app_icon_path, "C:/Tools/chatgpt-plus-plus-manager.exe");
    assert_eq!(plan.uninstall_key, "ChatGPTPlusPlus");
    assert_eq!(plan.legacy_uninstall_key, "CodexPlusPlus");
    assert_eq!(
        plan.uninstaller_path.replace('\\', "/"),
        "C:/Tools/uninstall.exe"
    );
    assert_eq!(
        plan.uninstall_command.replace('\\', "/"),
        "\"C:/Tools/uninstall.exe\""
    );
    assert_eq!(
        plan.quiet_uninstall_command.replace('\\', "/"),
        "\"C:/Tools/uninstall.exe\" /S"
    );
    assert_ne!(
        plan.uninstall_command,
        "\"C:/Tools/chatgpt-plus-plus-manager.exe\""
    );
}

#[test]
fn windows_entrypoint_plan_can_request_owned_data_removal_without_shell_script() {
    let options = InstallOptions {
        install_root: Some("C:/Users/A/Desktop".into()),
        launcher_path: None,
        manager_path: None,
        remove_owned_data: true,
    };

    let plan = build_windows_entrypoint_plan(&options);

    assert!(plan.app_shortcut.ends_with("ChatGPT++.lnk"));
    assert!(plan.remove_owned_data);
}

#[test]
fn macos_bundle_plan_contains_one_visible_app_and_an_embedded_launcher_helper() {
    let options = InstallOptions {
        install_root: Some("/Applications".into()),
        launcher_path: Some("/opt/ChatGPT++/chatgpt-plus-plus".into()),
        manager_path: Some("/opt/ChatGPT++/chatgpt-plus-plus-manager".into()),
        remove_owned_data: false,
    };

    let bundle = build_macos_app_bundle(&options);

    assert!(bundle.app_path.ends_with("ChatGPT++.app"));
    assert!(bundle.info_plist.contains("<string>ChatGPT++</string>"));
    assert!(
        bundle
            .info_plist
            .contains("<string>ChatGPTPlusPlus</string>")
    );
    assert!(
        !bundle
            .info_plist
            .contains("<key>LSUIElement</key>\n  <true/>")
    );
    assert_eq!(
        bundle.main_binary_target_name.as_deref(),
        Some("ChatGPTPlusPlus")
    );
    assert_eq!(
        bundle.helper_binary_target_name.as_deref(),
        Some("chatgpt-plus-plus")
    );
}

#[test]
fn installer_exports_one_current_and_one_legacy_entrypoint_name() {
    assert_eq!(
        shortcut_names(),
        ("ChatGPT++.lnk", "ChatGPT++ 管理工具.lnk")
    );
    assert_eq!(
        app_bundle_names(),
        ("ChatGPT++.app", "ChatGPT++ 管理工具.app")
    );
}

#[test]
fn legacy_cleanup_targets_only_the_old_manager_entrypoint() {
    let windows = legacy_entrypoint_paths(std::path::Path::new("C:/Users/A/Desktop"), true);
    assert_eq!(
        windows,
        vec![std::path::PathBuf::from(
            "C:/Users/A/Desktop/ChatGPT++ 管理工具.lnk"
        )]
    );

    let macos = legacy_entrypoint_paths(std::path::Path::new("/Applications"), false);
    assert_eq!(
        macos,
        vec![std::path::PathBuf::from(
            "/Applications/ChatGPT++ 管理工具.app"
        )]
    );
}

#[test]
fn macos_dmg_includes_applications_shortcut_for_drag_install() {
    let script = std::fs::read_to_string("../../scripts/installer/macos/package-dmg.sh")
        .expect("read macOS DMG packaging script");

    assert!(script.contains("ln -s /Applications \"$STAGE/Applications\""));
    assert!(script.contains("$app_dir/Contents/Helpers"));
    assert!(script.contains("$BINARY_DIR/chatgpt-plus-plus-manager"));
    assert!(script.contains("$BINARY_DIR/chatgpt-plus-plus"));
    assert!(!script.contains("create_app \"ChatGPT++ 管理工具\""));
    assert!(!script.contains("$STAGE/ChatGPT++ 管理工具.app"));
}

#[test]
fn windows_installer_exposes_only_the_main_app_and_cleans_legacy_shortcuts() {
    let script = std::fs::read_to_string("../../scripts/installer/windows/ChatGPTPlusPlus.nsi")
        .expect("read Windows installer script");

    assert!(script.contains(
        "CreateShortcut \"$DESKTOP\\ChatGPT++.lnk\" \"$INSTDIR\\chatgpt-plus-plus-manager.exe\""
    ));
    assert!(script.contains(
        "CreateShortcut \"$SMPROGRAMS\\ChatGPT++\\ChatGPT++.lnk\" \"$INSTDIR\\chatgpt-plus-plus-manager.exe\""
    ));
    assert!(!script.contains("CreateShortcut \"$DESKTOP\\ChatGPT++ 管理工具.lnk\""));
    assert!(!script.contains("CreateShortcut \"$SMPROGRAMS\\ChatGPT++\\ChatGPT++ 管理工具.lnk\""));
    assert!(script.contains("Delete \"$DESKTOP\\ChatGPT++ 管理工具.lnk\""));
    assert!(script.contains("Delete \"$SMPROGRAMS\\ChatGPT++\\ChatGPT++ 管理工具.lnk\""));
    assert!(script.contains("File \"${ROOT}\\dist\\windows\\app\\chatgpt-plus-plus.exe\""));
    assert!(script.contains("File \"${ROOT}\\dist\\windows\\app\\chatgpt-plus-plus-manager.exe\""));
}

#[test]
fn companion_binary_path_resolves_macos_silent_app_next_to_manager_app() {
    let manager_exe = std::path::Path::new(
        "/Applications/ChatGPT++ 管理工具.app/Contents/MacOS/ChatGPTPlusPlusManager",
    );

    let companion = companion_binary_path_from_exe(manager_exe, SILENT_BINARY);

    assert_eq!(
        companion,
        std::path::PathBuf::from("/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus")
    );
    assert_ne!(
        companion,
        std::path::PathBuf::from(
            "/Applications/ChatGPT++ 管理工具.app/Contents/MacOS/chatgpt-plus-plus"
        )
    );
}

#[test]
fn companion_binary_path_resolves_embedded_helper_from_the_single_app() {
    let app_exe =
        std::path::Path::new("/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus");

    let companion = companion_binary_path_from_exe(app_exe, SILENT_BINARY);

    assert_eq!(
        companion,
        std::path::PathBuf::from("/Applications/ChatGPT++.app/Contents/Helpers/chatgpt-plus-plus")
    );
}

#[test]
fn companion_binary_path_resolves_main_app_from_the_embedded_helper() {
    let helper_exe =
        std::path::Path::new("/Applications/ChatGPT++.app/Contents/Helpers/chatgpt-plus-plus");

    let companion = companion_binary_path_from_exe(helper_exe, MANAGER_BINARY);

    assert_eq!(
        companion,
        std::path::PathBuf::from("/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus")
    );
}

#[test]
fn macos_bundle_uses_existing_main_and_helper_sources_without_wrapping_them() {
    let options = InstallOptions {
        install_root: Some("/Applications".into()),
        launcher_path: Some(
            "/Applications/ChatGPT++.app/Contents/Helpers/chatgpt-plus-plus".into(),
        ),
        manager_path: Some("/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus".into()),
        remove_owned_data: false,
    };

    let bundle = build_macos_app_bundle(&options);

    assert_eq!(
        bundle.helper_binary_source,
        Some(std::path::PathBuf::from(
            "/Applications/ChatGPT++.app/Contents/Helpers/chatgpt-plus-plus"
        ))
    );
    assert_eq!(
        bundle.main_binary_source,
        Some(std::path::PathBuf::from(
            "/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus"
        ))
    );
}

#[test]
fn windows_default_install_root_uses_known_folder_before_userprofile_desktop() {
    let strategy = default_install_root_strategy();

    if cfg!(windows) {
        assert_eq!(strategy, "windows-known-folder");
    } else if cfg!(target_os = "macos") {
        assert_eq!(strategy, "macos-applications");
    } else {
        assert_eq!(strategy, "user-dirs-desktop");
    }
}
