pub mod audio;
pub mod history;
pub mod models;
pub mod pro;
pub mod transcription;

use crate::settings::{get_settings, write_settings, AppSettings, LogLevel, OverlayPosition};
use crate::signal_handle::send_transcription_input;
use crate::utils::cancel_current_operation;
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_opener::OpenerExt;

fn require_window(window: &Window, allowed: &[&str]) -> Result<(), String> {
    let label = window.label();
    if allowed.contains(&label) {
        Ok(())
    } else {
        Err(format!(
            "Command not allowed from window '{}'. Allowed windows: {}",
            label,
            allowed.join(", ")
        ))
    }
}

#[tauri::command]
#[specta::specta]
pub fn cancel_operation(app: AppHandle, window: Window) -> Result<(), String> {
    require_window(&window, &["main", "recording_overlay"])?;
    cancel_current_operation(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn start_transcription_from_overlay(app: AppHandle, window: Window) -> Result<(), String> {
    require_window(&window, &["recording_overlay"])?;
    send_transcription_input(&app, "transcribe", "overlay");
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_overlay_custom_position(
    app: AppHandle,
    window: Window,
    x: f64,
    y: f64,
) -> Result<(), String> {
    require_window(&window, &["recording_overlay"])?;

    let mut settings = get_settings(&app);
    settings.overlay_position = OverlayPosition::Custom;
    settings.overlay_custom_x = Some(x);
    settings.overlay_custom_y = Some(y);
    write_settings(&app, settings);
    crate::utils::update_overlay_position(&app);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_app_dir_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(get_settings(&app))
}

#[tauri::command]
#[specta::specta]
pub fn get_default_settings() -> Result<AppSettings, String> {
    Ok(crate::settings::get_default_settings())
}

#[tauri::command]
#[specta::specta]
pub fn get_log_dir_path(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    Ok(log_dir.to_string_lossy().to_string())
}

#[specta::specta]
#[tauri::command]
pub fn set_log_level(app: AppHandle, level: LogLevel) -> Result<(), String> {
    let tauri_log_level: tauri_plugin_log::LogLevel = level.into();
    let log_level: log::Level = tauri_log_level.into();
    // Update the file log level atomic so the filter picks up the new level
    crate::FILE_LOG_LEVEL.store(
        log_level.to_level_filter() as u8,
        std::sync::atomic::Ordering::Relaxed,
    );

    let mut settings = get_settings(&app);
    settings.log_level = level;
    write_settings(&app, settings);

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_recordings_folder(app: AppHandle, window: Window) -> Result<(), String> {
    require_window(&window, &["main"])?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let recordings_dir = app_data_dir.join("recordings");

    let path = recordings_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open recordings folder: {}", e))?;

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_log_dir(app: AppHandle, window: Window) -> Result<(), String> {
    require_window(&window, &["main"])?;

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let path = log_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open log directory: {}", e))?;

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_app_data_dir(app: AppHandle, window: Window) -> Result<(), String> {
    require_window(&window, &["main"])?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let path = app_data_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open app data directory: {}", e))?;

    Ok(())
}

/// Check if Apple Intelligence is available on this device.
/// Called by the frontend when the user selects Apple Intelligence provider.
#[specta::specta]
#[tauri::command]
pub fn check_apple_intelligence_available() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        crate::apple_intelligence::check_apple_intelligence_availability()
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        false
    }
}

/// Try to initialize Enigo (keyboard/mouse simulation).
/// On macOS, this will return an error if accessibility permissions are not granted.
#[specta::specta]
#[tauri::command]
pub fn initialize_enigo(app: AppHandle) -> Result<(), String> {
    use crate::input::EnigoState;

    // Check if already initialized
    if app.try_state::<EnigoState>().is_some() {
        log::debug!("Enigo already initialized");
        return Ok(());
    }

    // Try to initialize
    match EnigoState::new() {
        Ok(enigo_state) => {
            app.manage(enigo_state);
            log::info!("Enigo initialized successfully after permission grant");
            Ok(())
        }
        Err(e) => {
            if cfg!(target_os = "macos") {
                log::warn!(
                    "Failed to initialize Enigo: {} (accessibility permissions may not be granted)",
                    e
                );
            } else {
                log::warn!("Failed to initialize Enigo: {}", e);
            }
            Err(format!("Failed to initialize input system: {}", e))
        }
    }
}

/// Open the Accessibility pane of System Settings (macOS only).
/// The system trust prompt only appears once per app, so the frontend opens
/// the pane directly whenever the user asks to grant access.
#[specta::specta]
#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .status()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    }
    Ok(())
}

/// Remove this app's Accessibility entry from the macOS privacy database.
///
/// Builds that are not signed with a stable identity get a designated
/// requirement tied to the binary hash. After an update or rebuild, System
/// Settings still shows Dictx as enabled, but the grant belongs to the old
/// binary and the new one is not trusted. Toggling the switch does not fix
/// that; removing the stale entry and granting again does.
#[specta::specta]
#[tauri::command]
pub fn reset_accessibility_permission(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let identifier = app.config().identifier.clone();
        let output = std::process::Command::new("/usr/bin/tccutil")
            .args(["reset", "Accessibility", &identifier])
            .output()
            .map_err(|e| format!("Failed to run tccutil: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("tccutil reset Accessibility failed: {}", stderr.trim());
            return Err(format!(
                "Failed to reset accessibility permission: {}",
                stderr.trim()
            ));
        }
        log::info!("Reset accessibility permission for {}", identifier);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

/// Marker state to track if shortcuts have been initialized.
pub struct ShortcutsInitialized;

/// Initialize keyboard shortcuts.
/// On macOS, this should be called after accessibility permissions are granted.
/// This is idempotent - calling it multiple times is safe.
#[specta::specta]
#[tauri::command]
pub fn initialize_shortcuts(app: AppHandle) -> Result<(), String> {
    // Check if already initialized
    if app.try_state::<ShortcutsInitialized>().is_some() {
        log::debug!("Shortcuts already initialized");
        return Ok(());
    }

    // Initialize shortcuts
    crate::shortcut::init_shortcuts(&app);

    // Mark as initialized
    app.manage(ShortcutsInitialized);

    log::info!("Shortcuts initialized successfully");
    Ok(())
}
