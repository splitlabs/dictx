import { openUrl } from "@tauri-apps/plugin-opener";
import { PRO_PURCHASE_URL } from "@/config/commerce";

export const openProPurchasePage = async (): Promise<void> => {
  try {
    await openUrl(PRO_PURCHASE_URL);
  } catch (error) {
    console.error("Failed to open purchase link:", error);
  }
};
