use crate::settings::{self, ProEntitlement, ProEntitlementSource};
use chrono::Utc;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const DEFAULT_PRO_VERIFY_URL: &str = "https://dictx.splitlabs.io/api/pro/verify";
const DEFAULT_PRO_EARLY_ACCESS_URL: &str = "https://dictx.splitlabs.io/api/pro/early-access/claim";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyRequest {
    license_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyResponse {
    active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EarlyAccessClaimRequest {
    install_id: String,
    app_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EarlyAccessClaimResponse {
    active: bool,
    #[serde(default)]
    license_key: Option<String>,
}

fn get_verify_url() -> String {
    std::env::var("DICTX_PRO_VERIFY_URL").unwrap_or_else(|_| DEFAULT_PRO_VERIFY_URL.to_string())
}

fn get_early_access_url() -> String {
    std::env::var("DICTX_PRO_EARLY_ACCESS_URL")
        .unwrap_or_else(|_| DEFAULT_PRO_EARLY_ACCESS_URL.to_string())
}

fn make_install_id() -> String {
    format!(
        "dictx-{}-{}",
        Utc::now().timestamp_millis(),
        std::process::id()
    )
}

fn resolve_install_id(app_settings: &mut settings::AppSettings) -> String {
    if let Some(existing) = app_settings.pro_entitlement.install_id.clone() {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    let install_id = make_install_id();
    app_settings.pro_entitlement.install_id = Some(install_id.clone());
    install_id
}

fn is_early_adopter_marker(value: &str) -> bool {
    value.starts_with("EARLY-")
}

async fn verify_checkout(license_key: &str) -> Result<bool, String> {
    let payload = VerifyRequest {
        license_key: license_key.trim().to_string(),
    };

    if payload.license_key.is_empty() {
        return Err("License key is required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(get_verify_url())
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Verification request failed: {}", e))?;

    if response.status() == StatusCode::OK {
        let body: VerifyResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse verification response: {}", e))?;
        Ok(body.active)
    } else if response.status() == StatusCode::UNAUTHORIZED
        || response.status() == StatusCode::NOT_FOUND
    {
        Ok(false)
    } else {
        let status = response.status();
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        Err(format!("Verification API error ({}): {}", status, text))
    }
}

async fn claim_early_access(install_id: &str, app_version: &str) -> Result<Option<String>, String> {
    let payload = EarlyAccessClaimRequest {
        install_id: install_id.trim().to_string(),
        app_version: app_version.trim().to_string(),
    };

    if payload.install_id.is_empty() {
        return Err("Install ID is required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(get_early_access_url())
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Early access request failed: {}", e))?;

    if response.status() == StatusCode::OK {
        let body: EarlyAccessClaimResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse early access response: {}", e))?;

        if !body.active {
            return Ok(None);
        }

        return Ok(Some(
            body.license_key
                .unwrap_or_else(|| format!("EARLY-{}", payload.install_id)),
        ));
    }

    if response.status() == StatusCode::UNAUTHORIZED
        || response.status() == StatusCode::FORBIDDEN
        || response.status() == StatusCode::NOT_FOUND
        || response.status() == StatusCode::CONFLICT
    {
        return Ok(None);
    }

    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|_| "unknown error".to_string());
    Err(format!("Early access API error ({}): {}", status, text))
}

#[tauri::command]
#[specta::specta]
pub fn get_pro_entitlement(app: AppHandle) -> Result<ProEntitlement, String> {
    let settings = settings::get_settings(&app);
    Ok(settings.pro_entitlement)
}

#[tauri::command]
#[specta::specta]
pub fn clear_pro_entitlement(app: AppHandle) -> Result<ProEntitlement, String> {
    let mut app_settings = settings::get_settings(&app);
    app_settings.pro_entitlement = ProEntitlement::default();
    app_settings.update_checks_enabled = false;
    settings::write_settings(&app, app_settings.clone());
    crate::tray::update_tray_menu(&app, &crate::tray::TrayIconState::Idle, None);
    Ok(app_settings.pro_entitlement)
}

#[tauri::command]
#[specta::specta]
pub async fn activate_pro_entitlement(
    app: AppHandle,
    license_key: String,
) -> Result<ProEntitlement, String> {
    let active = verify_checkout(&license_key).await?;
    if !active {
        return Err("No active Dictx Pro entitlement found for this license key".to_string());
    }

    let now = Utc::now().timestamp();
    let mut app_settings = settings::get_settings(&app);
    app_settings.pro_entitlement = ProEntitlement {
        active: true,
        source: Some(ProEntitlementSource::LicenseKey),
        license_key: Some(license_key.trim().to_string()),
        email: None,
        checkout_id: None,
        activated_at: Some(now),
        last_verified_at: Some(now),
        verification_error: None,
        install_id: app_settings.pro_entitlement.install_id.clone(),
    };
    app_settings.update_checks_enabled = true;
    settings::write_settings(&app, app_settings.clone());
    crate::tray::update_tray_menu(&app, &crate::tray::TrayIconState::Idle, None);

    Ok(app_settings.pro_entitlement)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_pro_entitlement(app: AppHandle) -> Result<ProEntitlement, String> {
    let mut app_settings = settings::get_settings(&app);
    let now = Utc::now().timestamp();
    let install_id = resolve_install_id(&mut app_settings);
    let source = app_settings.pro_entitlement.source;
    let has_early_marker = app_settings
        .pro_entitlement
        .license_key
        .as_deref()
        .is_some_and(is_early_adopter_marker);

    // Support legacy activations by falling back to checkout_id if license_key is missing.
    let license_key = app_settings
        .pro_entitlement
        .license_key
        .clone()
        .or_else(|| app_settings.pro_entitlement.checkout_id.clone())
        .filter(|value| !value.trim().is_empty());

    if source == Some(ProEntitlementSource::EarlyAdopter) || has_early_marker {
        if app_settings.pro_entitlement.active {
            app_settings.pro_entitlement.source = Some(ProEntitlementSource::EarlyAdopter);
            app_settings.pro_entitlement.last_verified_at = Some(now);
            app_settings.pro_entitlement.verification_error = None;
        } else {
            let app_version = app.package_info().version.to_string();
            match claim_early_access(&install_id, &app_version).await {
                Ok(Some(grant_id)) => {
                    app_settings.pro_entitlement.active = true;
                    app_settings.pro_entitlement.source = Some(ProEntitlementSource::EarlyAdopter);
                    app_settings.pro_entitlement.license_key = Some(grant_id);
                    app_settings.pro_entitlement.activated_at = Some(now);
                    app_settings.pro_entitlement.last_verified_at = Some(now);
                    app_settings.pro_entitlement.verification_error = None;
                    app_settings.update_checks_enabled = true;
                }
                Ok(None) => {
                    app_settings.pro_entitlement.last_verified_at = Some(now);
                    app_settings.pro_entitlement.verification_error = None;
                }
                Err(err) => {
                    app_settings.pro_entitlement.verification_error = Some(err.clone());
                    settings::write_settings(&app, app_settings.clone());
                    return Err(err);
                }
            }
        }
    } else if let Some(license_key) = license_key {
        match verify_checkout(&license_key).await {
            Ok(true) => {
                app_settings.pro_entitlement.active = true;
                app_settings.pro_entitlement.source = Some(ProEntitlementSource::LicenseKey);
                app_settings.pro_entitlement.license_key = Some(license_key);
                app_settings.pro_entitlement.last_verified_at = Some(now);
                app_settings.pro_entitlement.verification_error = None;
            }
            Ok(false) => {
                app_settings.pro_entitlement.active = false;
                app_settings.pro_entitlement.last_verified_at = Some(now);
                app_settings.pro_entitlement.verification_error =
                    Some("Entitlement no longer active".to_string());
                app_settings.update_checks_enabled = false;
            }
            Err(err) => {
                app_settings.pro_entitlement.verification_error = Some(err.clone());
                settings::write_settings(&app, app_settings.clone());
                return Err(err);
            }
        }
    } else if !app_settings.pro_entitlement.active {
        let app_version = app.package_info().version.to_string();
        match claim_early_access(&install_id, &app_version).await {
            Ok(Some(grant_id)) => {
                app_settings.pro_entitlement.active = true;
                app_settings.pro_entitlement.source = Some(ProEntitlementSource::EarlyAdopter);
                app_settings.pro_entitlement.license_key = Some(grant_id);
                app_settings.pro_entitlement.activated_at = Some(now);
                app_settings.pro_entitlement.last_verified_at = Some(now);
                app_settings.pro_entitlement.verification_error = None;
                app_settings.update_checks_enabled = true;
            }
            Ok(None) => {
                app_settings.pro_entitlement.last_verified_at = Some(now);
                app_settings.pro_entitlement.verification_error = None;
            }
            Err(err) => {
                app_settings.pro_entitlement.verification_error = Some(err.clone());
                settings::write_settings(&app, app_settings.clone());
                return Err(err);
            }
        }
    } else {
        app_settings.pro_entitlement.last_verified_at = Some(now);
        app_settings.pro_entitlement.verification_error = None;
    }

    app_settings.pro_entitlement.install_id = Some(install_id);
    settings::write_settings(&app, app_settings.clone());
    crate::tray::update_tray_menu(&app, &crate::tray::TrayIconState::Idle, None);
    Ok(app_settings.pro_entitlement)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn make_install_id_has_prefix() {
        let id = make_install_id();
        assert!(id.starts_with("dictx-"));
        assert!(id.len() > "dictx-".len());
    }

    #[test]
    fn early_adopter_marker_detection() {
        assert!(is_early_adopter_marker("EARLY-dictx-123"));
        assert!(!is_early_adopter_marker("lk_123"));
    }
}
