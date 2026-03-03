// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 CJ Pais — original Handy project (MIT)
// Copyright (C) 2026 0xNyk — Dictx fork (GPL-3.0-or-later)

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use dictx_app_lib::CliArgs;

fn main() {
    let cli_args = CliArgs::parse();

    #[cfg(target_os = "linux")]
    {
        // DMABUF renderer causes crashes on various GPU/display server configurations
        // See: https://github.com/tauri-apps/tauri/issues/9394
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    dictx_app_lib::run(cli_args)
}
