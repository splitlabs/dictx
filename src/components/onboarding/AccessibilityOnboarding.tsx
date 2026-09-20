import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  STALE_GRANT_HINT_DELAY_MS,
  openAccessibilityGrant,
  resetAndRegrantAccessibility,
} from "@/utils/accessibilityPermission";
import DictxTextLogo from "../icons/DictxTextLogo";
import { Keyboard, Mic, Check, Loader2, RefreshCw } from "lucide-react";

interface AccessibilityOnboardingProps {
  onComplete: () => void;
  isReturningUser?: boolean;
}

type PermissionStatus = "checking" | "needed" | "waiting" | "granted";

interface PermissionsState {
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
}

const AccessibilityOnboarding: React.FC<AccessibilityOnboardingProps> = ({
  onComplete,
  isReturningUser = false,
}) => {
  const { t } = useTranslation();
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const [isMacOS, setIsMacOS] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState>({
    accessibility: "checking",
    microphone: "checking",
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorCountRef = useRef<number>(0);
  const MAX_POLLING_ERRORS = 3;
  const [showStaleHint, setShowStaleHint] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [grantAttempt, setGrantAttempt] = useState(0);

  const allGranted =
    permissions.accessibility === "granted" &&
    permissions.microphone === "granted";

  // Check platform and permission status on mount
  useEffect(() => {
    const currentPlatform = platform();
    const isMac = currentPlatform === "macos";
    setIsMacOS(isMac);

    // Skip immediately on non-macOS - no permissions needed
    if (!isMac) {
      onComplete();
      return;
    }

    // On macOS, check both permissions
    const checkInitial = async () => {
      try {
        const [accessibilityGranted, microphoneGranted] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);

        // If accessibility is granted, initialize Enigo and shortcuts
        if (accessibilityGranted) {
          try {
            await Promise.all([
              commands.initializeEnigo(),
              commands.initializeShortcuts(),
            ]);
          } catch (e) {
            console.warn("Failed to initialize after permission grant:", e);
          }
        }

        const newState: PermissionsState = {
          accessibility: accessibilityGranted ? "granted" : "needed",
          microphone: microphoneGranted ? "granted" : "needed",
        };

        setPermissions(newState);

        // If both already granted, refresh audio devices and skip ahead
        if (accessibilityGranted && microphoneGranted) {
          await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
          timeoutRef.current = setTimeout(() => onComplete(), 300);
        } else {
          // Keep checking in the background so externally granted permissions
          // are auto-detected without requiring a manual retry click.
          startPolling();
        }
      } catch (error) {
        console.error("Failed to check permissions:", error);
        toast.error(t("onboarding.permissions.errors.checkFailed"));
        setPermissions({
          accessibility: "needed",
          microphone: "needed",
        });
        startPolling();
      }
    };

    checkInitial();
  }, [onComplete, refreshAudioDevices, refreshOutputDevices, t]);

  // Polling for permissions after user clicks a button
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      try {
        const [accessibilityGranted, microphoneGranted] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);

        setPermissions((prev) => {
          const newState = { ...prev };

          if (accessibilityGranted && prev.accessibility !== "granted") {
            newState.accessibility = "granted";
            // Initialize Enigo and shortcuts when accessibility is granted
            Promise.all([
              commands.initializeEnigo(),
              commands.initializeShortcuts(),
            ]).catch((e) => {
              console.warn("Failed to initialize after permission grant:", e);
            });
          }

          if (microphoneGranted && prev.microphone !== "granted") {
            newState.microphone = "granted";
          }

          return newState;
        });

        // If both granted, stop polling, refresh audio devices, and proceed
        if (accessibilityGranted && microphoneGranted) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // Now that we have mic permission, refresh audio devices
          await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
          timeoutRef.current = setTimeout(() => onComplete(), 500);
        }

        // Reset error count on success
        errorCountRef.current = 0;
      } catch (error) {
        console.error("Error checking permissions:", error);
        errorCountRef.current += 1;

        if (errorCountRef.current >= MAX_POLLING_ERRORS) {
          // Stop polling after too many consecutive errors
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          toast.error(t("onboarding.permissions.errors.checkFailed"));
        }
      }
    }, 1000);
  }, [onComplete, refreshAudioDevices, refreshOutputDevices, t]);

  // An entry left by an older build keeps System Settings showing Dictx as
  // enabled while macOS reports it as untrusted. If a grant attempt does not
  // register within a few seconds, offer to reset that entry.
  useEffect(() => {
    if (permissions.accessibility !== "waiting") {
      setShowStaleHint(false);
      return;
    }
    const hintTimeout = setTimeout(
      () => setShowStaleHint(true),
      STALE_GRANT_HINT_DELAY_MS,
    );
    return () => clearTimeout(hintTimeout);
  }, [permissions.accessibility, grantAttempt]);

  // Cleanup polling and timeouts on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleGrantAccessibility = async () => {
    try {
      await openAccessibilityGrant();
      setPermissions((prev) => ({ ...prev, accessibility: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request accessibility permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  const handleResetAccessibility = async () => {
    setIsResetting(true);
    try {
      await resetAndRegrantAccessibility();
      // Restart the waiting period so the hint does not reappear immediately
      setShowStaleHint(false);
      setGrantAttempt((attempt) => attempt + 1);
      setPermissions((prev) => ({ ...prev, accessibility: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to reset accessibility permission:", error);
      toast.error(t("onboarding.permissions.accessibility.resetFailed"));
    } finally {
      setIsResetting(false);
    }
  };

  const handleGrantMicrophone = async () => {
    try {
      await requestMicrophonePermission();
      setPermissions((prev) => ({ ...prev, microphone: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request microphone permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  const handleRetryCheck = async () => {
    try {
      const [accessibilityGranted, microphoneGranted] = await Promise.all([
        checkAccessibilityPermission(),
        checkMicrophonePermission(),
      ]);

      if (accessibilityGranted) {
        await Promise.all([
          commands.initializeEnigo(),
          commands.initializeShortcuts(),
        ]).catch((e) =>
          console.warn("Failed to initialize after permission grant:", e),
        );
      }

      setPermissions({
        accessibility: accessibilityGranted ? "granted" : "waiting",
        microphone: microphoneGranted ? "granted" : "waiting",
      });

      if (accessibilityGranted && microphoneGranted) {
        await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
        timeoutRef.current = setTimeout(() => onComplete(), 300);
      } else {
        startPolling();
      }
    } catch (error) {
      console.error("Failed to retry permission check:", error);
      toast.error(t("onboarding.permissions.errors.checkFailed"));
    }
  };

  // Still checking platform/initial permissions
  if (
    isMacOS === null ||
    (permissions.accessibility === "checking" &&
      permissions.microphone === "checking")
  ) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-text/50" />
      </div>
    );
  }

  // All permissions granted - show success briefly
  if (allGranted) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4">
        <div className="p-4 rounded-full bg-emerald-500/20">
          <Check className="w-12 h-12 text-emerald-400" />
        </div>
        <p className="text-lg font-medium text-text">
          {t("onboarding.permissions.allGranted")}
        </p>
      </div>
    );
  }

  // Show permissions request screen
  return (
    <div className="h-screen w-screen flex flex-col p-6 gap-6 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <DictxTextLogo width={200} />
      </div>

      <div className="max-w-md w-full flex flex-col items-center gap-4">
        <div className="text-center mb-2">
          <h2 className="text-xl font-semibold text-text mb-2">
            {t("onboarding.permissions.title")}
          </h2>
          <p className="text-text/70">
            {t("onboarding.permissions.description")}
          </p>
        </div>

        {/* Microphone Permission Card */}
        <div className="w-full p-4 rounded-lg bg-white/5 border border-mid-gray/20">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-logo-primary/20 shrink-0">
              <Mic className="w-6 h-6 text-logo-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-text">
                {t("onboarding.permissions.microphone.title")}
              </h3>
              <p className="text-sm text-text/60 mb-3">
                {t("onboarding.permissions.microphone.description")}
              </p>
              {permissions.microphone === "granted" ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <Check className="w-4 h-4" />
                  {t("onboarding.permissions.granted")}
                </div>
              ) : permissions.microphone === "waiting" ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-text/50 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("onboarding.permissions.waiting")}
                  </div>
                  <button
                    onClick={handleRetryCheck}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-text/70 text-xs font-medium transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t("onboarding.permissions.retry")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGrantMicrophone}
                  className="px-4 py-2 rounded-lg bg-logo-primary hover:bg-logo-primary/90 text-white text-sm font-medium transition-colors"
                >
                  {t("onboarding.permissions.grant")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Accessibility Permission Card */}
        <div className="w-full p-4 rounded-lg bg-white/5 border border-mid-gray/20">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-logo-primary/20 shrink-0">
              <Keyboard className="w-6 h-6 text-logo-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-text">
                {t("onboarding.permissions.accessibility.title")}
              </h3>
              <p className="text-sm text-text/60 mb-3">
                {t("onboarding.permissions.accessibility.description")}
              </p>
              {permissions.accessibility === "granted" ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <Check className="w-4 h-4" />
                  {t("onboarding.permissions.granted")}
                </div>
              ) : permissions.accessibility === "waiting" ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-text/50 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("onboarding.permissions.waiting")}
                  </div>
                  <button
                    onClick={handleRetryCheck}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-text/70 text-xs font-medium transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t("onboarding.permissions.retry")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGrantAccessibility}
                  className="px-4 py-2 rounded-lg bg-logo-primary hover:bg-logo-primary/90 text-white text-sm font-medium transition-colors"
                >
                  {t("onboarding.permissions.grant")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stale accessibility entry recovery */}
        {showStaleHint && permissions.accessibility === "waiting" && (
          <div className="w-full p-4 rounded-lg bg-amber-400/10 border border-amber-400/30 flex flex-col gap-2">
            <h3 className="text-sm font-medium text-text">
              {t("onboarding.permissions.accessibility.staleTitle")}
            </h3>
            <p className="text-xs text-text/70">
              {t("onboarding.permissions.accessibility.staleDescription")}
            </p>
            <button
              type="button"
              onClick={handleResetAccessibility}
              disabled={isResetting}
              className="self-start flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-text text-xs font-medium transition-colors"
            >
              {isResetting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t("onboarding.permissions.accessibility.reset")}
            </button>
          </div>
        )}

        {/* Restart hint */}
        {permissions.microphone === "waiting" && (
          <p className="text-text/40 text-xs text-center">
            {t("onboarding.permissions.restartHint")}
          </p>
        )}

        {/* Continue anyway for returning users */}
        {isReturningUser && (
          <button
            type="button"
            className="text-text/40 text-xs underline hover:text-text/60 transition-colors bg-transparent border-none cursor-pointer mt-2"
            onClick={onComplete}
          >
            {t("onboarding.permissions.skipForNow")}
          </button>
        )}
      </div>
    </div>
  );
};

export default AccessibilityOnboarding;
