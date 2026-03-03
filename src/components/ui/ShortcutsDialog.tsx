import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const bindings = settings?.bindings ?? {};
  const shortcutRows: { label: string; keys: string }[] = [];

  if (bindings.transcribe) {
    shortcutRows.push({
      label: t("shortcuts.transcribe"),
      keys:
        bindings.transcribe.current_binding ||
        bindings.transcribe.default_binding,
    });
  }
  if (bindings.cancel) {
    shortcutRows.push({
      label: t("shortcuts.cancel"),
      keys: bindings.cancel.current_binding || bindings.cancel.default_binding,
    });
  }
  if (bindings.transcribe_with_post_process) {
    shortcutRows.push({
      label: t("shortcuts.postProcess"),
      keys:
        bindings.transcribe_with_post_process.current_binding ||
        bindings.transcribe_with_post_process.default_binding,
    });
  }
  shortcutRows.push({
    label: t("shortcuts.debugToggle"),
    keys: "Cmd+Shift+D",
  });
  shortcutRows.push({
    label: t("shortcuts.shortcutsHelp"),
    keys: "?",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-mid-gray/20 rounded-xl shadow-2xl w-80 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">{t("shortcuts.title")}</h2>
          <button
            onClick={onClose}
            className="text-text/50 hover:text-text transition-colors cursor-pointer"
            aria-label={t("common.close")}
          >
            <X width={16} height={16} />
          </button>
        </div>
        <p className="text-xs text-text/50 mb-3">
          {t("shortcuts.description")}
        </p>
        <div className="space-y-2">
          {shortcutRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-text/80">{row.label}</span>
              <kbd className="px-2 py-0.5 text-xs bg-mid-gray/10 border border-mid-gray/20 rounded font-mono text-text/60">
                {row.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
