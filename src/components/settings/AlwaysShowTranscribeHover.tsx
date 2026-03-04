import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";
import type { OverlayPosition } from "@/bindings";

interface AlwaysShowTranscribeHoverProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AlwaysShowTranscribeHover: React.FC<AlwaysShowTranscribeHoverProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const overlayPosition = (getSetting("overlay_position") ||
      "bottom") as OverlayPosition;
    const isAlwaysVisible = overlayPosition !== "none";

    const handleToggle = async (enabled: boolean) => {
      const nextPosition: OverlayPosition = enabled ? "bottom" : "none";
      await updateSetting("overlay_position", nextPosition);
    };

    return (
      <ToggleSwitch
        checked={isAlwaysVisible}
        onChange={handleToggle}
        isUpdating={isUpdating("overlay_position")}
        label={t("settings.general.transcribeHover.label")}
        description={t("settings.general.transcribeHover.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  });
