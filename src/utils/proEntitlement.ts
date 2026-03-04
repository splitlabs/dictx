import { invoke } from "@tauri-apps/api/core";

export interface ProEntitlement {
  active: boolean;
  license_key?: string | null;
  email?: string | null;
  checkout_id?: string | null;
  activated_at?: number | null;
  last_verified_at?: number | null;
  verification_error?: string | null;
}

export const getProEntitlement = async (): Promise<ProEntitlement> => {
  return await invoke<ProEntitlement>("get_pro_entitlement");
};

export const activateProEntitlement = async (
  licenseKey: string,
): Promise<ProEntitlement> => {
  return await invoke<ProEntitlement>("activate_pro_entitlement", {
    licenseKey,
  });
};

export const refreshProEntitlement = async (): Promise<ProEntitlement> => {
  return await invoke<ProEntitlement>("refresh_pro_entitlement");
};

export const clearProEntitlement = async (): Promise<ProEntitlement> => {
  return await invoke<ProEntitlement>("clear_pro_entitlement");
};
