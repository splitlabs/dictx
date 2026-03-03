use chrono::{DateTime, Local, Utc};
use log::{debug, error, info};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::settings::get_settings;

/// Export a transcription to the configured Obsidian vault as a markdown note.
///
/// Creates a note in `{vault_path}/{subfolder}/` with YAML frontmatter
/// containing metadata (timestamp, duration, word count, source).
pub fn export_to_obsidian(
    app: &AppHandle,
    transcription_text: &str,
    post_processed_text: Option<&str>,
    duration_secs: Option<f64>,
) {
    let settings = get_settings(app);

    let vault_path = match &settings.obsidian_vault_path {
        Some(p) if !p.is_empty() => p.clone(),
        _ => {
            debug!("Obsidian export skipped: no vault path configured");
            return;
        }
    };

    if !settings.obsidian_export_enabled {
        debug!("Obsidian export skipped: disabled in settings");
        return;
    }

    let subfolder = settings
        .obsidian_export_subfolder
        .as_deref()
        .unwrap_or("voice-notes");

    let export_dir = PathBuf::from(&vault_path).join(subfolder);

    if let Err(e) = fs::create_dir_all(&export_dir) {
        error!("Failed to create Obsidian export directory {:?}: {}", export_dir, e);
        return;
    }

    let now = Utc::now();
    let local_now: DateTime<Local> = now.into();
    let file_name = local_now.format("%Y-%m-%d_%H-%M-%S").to_string();
    let file_path = export_dir.join(format!("{}.md", file_name));

    // Use the best available text
    let text = post_processed_text.unwrap_or(transcription_text);
    let word_count = text.split_whitespace().count();

    // Build title from first ~50 chars of text
    let title = build_title(text);

    // Calculate WPM if duration is available
    let wpm = duration_secs
        .filter(|&d| d > 0.0)
        .map(|d| (word_count as f64 / (d / 60.0)).round() as u32);

    let content = build_note_content(
        &title,
        &local_now,
        text,
        transcription_text,
        post_processed_text,
        word_count,
        duration_secs,
        wpm,
    );

    match fs::write(&file_path, content) {
        Ok(_) => info!("Exported transcription to Obsidian: {:?}", file_path),
        Err(e) => error!("Failed to write Obsidian note {:?}: {}", file_path, e),
    }

    // Optionally append to daily note
    if settings.obsidian_append_to_daily {
        append_to_daily_note(&vault_path, &local_now, text, &title);
    }
}

/// Build a short title from the transcription text
fn build_title(text: &str) -> String {
    let cleaned: String = text
        .chars()
        .take(60)
        .take_while(|c| *c != '\n')
        .collect();

    let trimmed = cleaned.trim();
    if trimmed.len() < text.len() {
        format!("{}...", trimmed.trim_end_matches(|c: char| c.is_whitespace() || c == '.'))
    } else {
        trimmed.to_string()
    }
}

/// Build the full markdown note with YAML frontmatter
fn build_note_content(
    title: &str,
    timestamp: &DateTime<Local>,
    final_text: &str,
    raw_text: &str,
    post_processed: Option<&str>,
    word_count: usize,
    duration_secs: Option<f64>,
    wpm: Option<u32>,
) -> String {
    let mut content = String::new();

    // YAML frontmatter
    content.push_str("---\n");
    content.push_str(&format!("title: \"{}\"\n", title.replace('"', "\\\""),));
    content.push_str(&format!(
        "date: {}\n",
        timestamp.format("%Y-%m-%dT%H:%M:%S")
    ));
    content.push_str("type: voice-note\n");
    content.push_str("source: dictx\n");
    content.push_str(&format!("words: {}\n", word_count));
    if let Some(dur) = duration_secs {
        content.push_str(&format!("duration_seconds: {:.1}\n", dur));
    }
    if let Some(wpm_val) = wpm {
        content.push_str(&format!("wpm: {}\n", wpm_val));
    }
    content.push_str("tags:\n  - voice-note\n");
    content.push_str("---\n\n");

    // Main content
    content.push_str(final_text);
    content.push('\n');

    // If post-processed, include raw transcription as collapsible
    if post_processed.is_some() {
        content.push_str("\n---\n\n");
        content.push_str("> [!note]- Raw transcription\n");
        for line in raw_text.lines() {
            content.push_str(&format!("> {}\n", line));
        }
    }

    content
}

/// Append a brief reference to the daily note
fn append_to_daily_note(vault_path: &str, timestamp: &DateTime<Local>, text: &str, title: &str) {
    // Look for daily note in common locations
    let date_str = timestamp.format("%Y-%m-%d").to_string();
    let daily_note_candidates = [
        PathBuf::from(vault_path).join(format!("daily/{}.md", date_str)),
        PathBuf::from(vault_path).join(format!("Daily Notes/{}.md", date_str)),
        PathBuf::from(vault_path).join(format!("{}.md", date_str)),
    ];

    let daily_note_path = daily_note_candidates.iter().find(|p| p.exists());

    if let Some(path) = daily_note_path {
        let time_str = timestamp.format("%H:%M").to_string();
        let snippet = if text.len() > 100 {
            format!("{}...", &text[..100])
        } else {
            text.to_string()
        };

        let entry = format!(
            "\n- {} [[voice-notes/{}|{}]] — {}\n",
            time_str,
            timestamp.format("%Y-%m-%d_%H-%M-%S"),
            title,
            snippet
        );

        match fs::OpenOptions::new().append(true).open(path) {
            Ok(mut file) => {
                use std::io::Write;
                if let Err(e) = file.write_all(entry.as_bytes()) {
                    error!("Failed to append to daily note: {}", e);
                }
            }
            Err(e) => error!("Failed to open daily note for append: {}", e),
        }
    } else {
        debug!("No daily note found for {}, skipping append", date_str);
    }
}
