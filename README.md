<p align="center">
  <img src="assets/banner.png" alt="Dictx — Privacy-First Desktop Speech-to-Text" />
</p>

**A free, open source, and extensible speech-to-text application that works completely offline — with Obsidian integration.**

Dictx is a cross-platform desktop application that provides simple, privacy-focused speech transcription. Press a shortcut, speak, and have your words appear in any text field. This happens on your own computer without sending any information to the cloud.

Forked from [Handy](https://github.com/cjpais/Handy) by cjpais.

## What's Different from Handy?

- **Obsidian Integration** — Automatically export transcriptions as markdown notes to your Obsidian vault with YAML frontmatter, daily note appending, and configurable subfolder structure
- **Rebranded** — New identity, icons, and configuration under `com.0xnyk.dictx`

## How It Works

1. **Press** a configurable keyboard shortcut to start/stop recording (or use push-to-talk mode)
2. **Speak** your words while the shortcut is active
3. **Release** and Dictx processes your speech using Whisper
4. **Get** your transcribed text pasted directly into whatever app you're using

The process is entirely local:

- Silence is filtered using VAD (Voice Activity Detection) with Silero
- Transcription uses your choice of models:
  - **Whisper models** (Small/Medium/Turbo/Large) with GPU acceleration when available
  - **Parakeet V3** - CPU-optimized model with excellent performance and automatic language detection
- Works on Windows, macOS, and Linux

## Quick Start

### Installation

1. Download the latest release from the [releases page](https://github.com/0xNyk/dictx/releases)
2. Install the application
3. Launch Dictx and grant necessary system permissions (microphone, accessibility)
4. Configure your preferred keyboard shortcuts in Settings
5. Start transcribing!

### Development Setup

For detailed build instructions including platform-specific requirements, see [BUILD.md](BUILD.md).

## Architecture

Dictx is built as a Tauri application combining:

- **Frontend**: React + TypeScript with Tailwind CSS for the settings UI
- **Backend**: Rust for system integration, audio processing, and ML inference
- **Core Libraries**:
  - `whisper-rs`: Local speech recognition with Whisper models
  - `transcription-rs`: CPU-optimized speech recognition with Parakeet models
  - `cpal`: Cross-platform audio I/O
  - `vad-rs`: Voice Activity Detection
  - `rdev`: Global keyboard shortcuts and system events
  - `rubato`: Audio resampling

### Debug Mode

Dictx includes an advanced debug mode for development and troubleshooting. Access it by pressing:

- **macOS**: `Cmd+Shift+D`
- **Windows/Linux**: `Ctrl+Shift+D`

### CLI Parameters

Dictx supports command-line flags for controlling a running instance and customizing startup behavior. These work on all platforms (macOS, Windows, Linux).

**Remote control flags** (sent to an already-running instance via the single-instance plugin):

```bash
dictx --toggle-transcription    # Toggle recording on/off
dictx --toggle-post-process     # Toggle recording with post-processing on/off
dictx --cancel                  # Cancel the current operation
```

**Startup flags:**

```bash
dictx --start-hidden            # Start without showing the main window
dictx --no-tray                 # Start without the system tray icon
dictx --debug                   # Enable debug mode with verbose logging
dictx --help                    # Show all available flags
```

Flags can be combined for autostart scenarios:

```bash
dictx --start-hidden --no-tray
```

> **macOS tip:** When Dictx is installed as an app bundle, invoke the binary directly:
>
> ```bash
> /Applications/Dictx.app/Contents/MacOS/Dictx --toggle-transcription
> ```

## Obsidian Integration

Dictx can automatically export transcriptions to your Obsidian vault. Configure in **Settings > Advanced > Obsidian Integration**:

- **Export to Obsidian** — Toggle automatic export on/off
- **Vault Path** — Select your Obsidian vault root folder
- **Subfolder** — Choose the folder within your vault (default: `voice-notes`)
- **Append to Daily Note** — Add a reference to each transcription in today's daily note

Exported notes include YAML frontmatter with metadata (timestamp, duration, word count, source) and optionally include the raw transcription in a collapsible callout when post-processing is used.

## Known Issues & Current Limitations

This project inherits known issues from upstream Handy. See the [upstream issues](https://github.com/cjpais/Handy/issues) for details.

### Linux Notes

**Text Input Tools:**

For reliable text input on Linux, install the appropriate tool for your display server:

| Display Server | Recommended Tool | Install Command                                    |
| -------------- | ---------------- | -------------------------------------------------- |
| X11            | `xdotool`        | `sudo apt install xdotool`                         |
| Wayland        | `wtype`          | `sudo apt install wtype`                           |
| Both           | `dotool`         | `sudo apt install dotool` (requires `input` group) |

Without these tools, Dictx falls back to enigo which may have limited compatibility, especially on Wayland.

- The recording overlay is disabled by default on Linux (`Overlay Position: None`) because certain compositors treat it as the active window.
- If you are having trouble with the app, running with the environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` may help
- **Global keyboard shortcuts (Wayland):** On Wayland, system-level shortcuts must be configured through your desktop environment. Use the [CLI flags](#cli-parameters) as the command for your custom shortcut.

### Platform Support

- **macOS (both Intel and Apple Silicon)**
- **x64 Windows**
- **x64 Linux**

### System Requirements/Recommendations

**For Whisper Models:**

- **macOS**: M series Mac, Intel Mac
- **Windows**: Intel, AMD, or NVIDIA GPU
- **Linux**: Intel, AMD, or NVIDIA GPU

**For Parakeet V3 Model:**

- **CPU-only operation** - runs on a wide variety of hardware
- **Minimum**: Intel Skylake (6th gen) or equivalent AMD processors
- **Automatic language detection** - no manual language selection required

## Troubleshooting

### Manual Model Installation (For Proxy Users or Network Restrictions)

If you're behind a proxy or firewall, you can manually download and install models. See [upstream documentation](https://github.com/cjpais/Handy#manual-model-installation-for-proxy-users-or-network-restrictions) for model URLs and installation instructions.

The app data directory for Dictx is:

- **macOS**: `~/Library/Application Support/com.0xnyk.dictx/`
- **Windows**: `C:\Users\{username}\AppData\Roaming\com.0xnyk.dictx\`
- **Linux**: `~/.config/com.0xnyk.dictx/`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- **[Handy](https://github.com/cjpais/Handy)** by cjpais — the upstream project this is forked from
- **Whisper** by OpenAI for the speech recognition model
- **whisper.cpp and ggml** for cross-platform whisper inference/acceleration
- **Silero** for lightweight VAD
- **Tauri** team for the Rust-based app framework
