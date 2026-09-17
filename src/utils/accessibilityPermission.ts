import { requestAccessibilityPermission } from "tauri-plugin-macos-permissions-api";
import { commands } from "@/bindings";

/**
 * How long to wait after the user starts granting access before suggesting
 * that the System Settings entry may be stale.
 */
export const STALE_GRANT_HINT_DELAY_MS = 8000;

/**
 * Ask macOS for Accessibility access and open the matching System Settings
 * pane. The system prompt is shown only once per app, so opening the pane is
 * what makes repeat clicks do something visible.
 */
export async function openAccessibilityGrant(): Promise<void> {
  try {
    await requestAccessibilityPermission();
  } catch (error) {
    // Still open System Settings so the user has a way forward
    console.warn("Accessibility prompt failed:", error);
  }
  const result = await commands.openAccessibilitySettings();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

/**
 * Remove a stale Accessibility entry (left by an older build of Dictx) and
 * start the grant flow again.
 */
export async function resetAndRegrantAccessibility(): Promise<void> {
  const result = await commands.resetAccessibilityPermission();
  // Open System Settings either way; on failure the user removes the entry there
  await openAccessibilityGrant();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}
