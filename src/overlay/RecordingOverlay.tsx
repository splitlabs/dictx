import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TranscriptionIcon,
  CancelIcon,
  DictxIcon,
} from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "idle" | "recording" | "transcribing" | "processing";

const formatElapsed = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("idle");
  const BAR_COUNT = 9;
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const direction = getLanguageDirection(i18n.language);
  const overlayWindow = getCurrentWindow();

  const persistOverlayPosition = async () => {
    try {
      const [position, scaleFactor] = await Promise.all([
        overlayWindow.outerPosition(),
        overlayWindow.scaleFactor(),
      ]);
      const logicalX = position.x / scaleFactor;
      const logicalY = position.y / scaleFactor;
      await commands.setOverlayCustomPosition(logicalX, logicalY);
    } catch (error) {
      console.error("Failed to persist overlay position:", error);
    }
  };

  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    isDraggingRef.current = true;
    void overlayWindow.startDragging();
  };

  useEffect(() => {
    let unlistenShow: (() => void) | null = null;
    let unlistenHide: (() => void) | null = null;
    let unlistenLevel: (() => void) | null = null;
    let disposed = false;

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const startTimer = () => {
      stopTimer();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    };

    const setupEventListeners = async () => {
      const showUnlisten = await listen("show-overlay", async (event) => {
        await syncLanguageFromSettings();
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
        setIsVisible(true);

        if (overlayState === "recording") {
          startTimer();
          return;
        }

        stopTimer();
        setElapsed(0);
      });
      if (disposed) {
        showUnlisten();
      } else {
        unlistenShow = showUnlisten;
      }

      const hideUnlisten = await listen("hide-overlay", () => {
        stopTimer();
        setElapsed(0);
        setState("idle");
        setIsVisible(false);
      });
      if (disposed) {
        hideUnlisten();
      } else {
        unlistenHide = hideUnlisten;
      }

      const levelUnlisten = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          if (target > prev) {
            return prev * 0.45 + target * 0.55;
          }
          return prev * 0.82 + target * 0.18;
        });

        smoothedLevelsRef.current = smoothed;
        const center = (BAR_COUNT - 1) / 2;
        const visualLevels = Array.from({ length: BAR_COUNT }, (_, i) => {
          const distance = Math.abs(i - center);
          const bandIndex = Math.min(smoothed.length - 1, Math.floor(distance));
          const base = smoothed[Math.max(0, 4 - bandIndex)] || 0;
          const shape = 1 - (distance / center) * 0.35;
          return Math.max(0, base * shape);
        });

        setLevels(visualLevels);
      });
      if (disposed) {
        levelUnlisten();
      } else {
        unlistenLevel = levelUnlisten;
      }
    };

    void setupEventListeners();

    const handleGlobalMouseUp = () => {
      if (!isDraggingRef.current) {
        return;
      }
      isDraggingRef.current = false;
      void persistOverlayPosition();
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      disposed = true;
      unlistenShow?.();
      unlistenHide?.();
      unlistenLevel?.();
      stopTimer();
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  const getIcon = () =>
    state === "recording" || state === "idle" ? (
      <DictxIcon width={16} height={16} />
    ) : (
      <TranscriptionIcon />
    );

  return (
    <div
      dir={direction}
      className={`recording-overlay ${isVisible ? "fade-in" : ""} ${
        state === "idle" ? "is-idle" : ""
      }`}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) {
          return;
        }
        handleDragStart(event);
      }}
    >
      <button
        className={`overlay-left overlay-action-button ${
          state !== "idle" ? "is-active" : ""
        }`}
        onClick={() => {
          if (state === "idle") {
            void commands.startTranscriptionFromOverlay();
          }
        }}
        disabled={state !== "idle"}
        type="button"
      >
        {getIcon()}
      </button>

      <div
        className="overlay-middle overlay-drag-handle"
      >
        {state === "idle" && (
          <div className="idle-placeholder" aria-hidden="true" />
        )}
        {state === "recording" && (
          <>
            <div className="bars-container">
              {levels.map((v, i) => (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${Math.min(26, 6 + Math.pow(v, 0.58) * 20)}px`,
                    transition:
                      "height 110ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease-out",
                    opacity: Math.min(1, 0.35 + Math.pow(v, 0.7) * 1.05),
                  }}
                />
              ))}
            </div>
            <span className="timer-text">{formatElapsed(elapsed)}</span>
          </>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">{t("overlay.transcribing")}</div>
        )}
        {state === "processing" && (
          <div className="transcribing-text">{t("overlay.processing")}</div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && (
          <button
            className="cancel-button"
            type="button"
            onClick={() => {
              void commands.cancelOperation();
            }}
          >
            <CancelIcon />
          </button>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
