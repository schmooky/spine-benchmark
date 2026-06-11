import { create } from "zustand";

import { DEFAULT_DEVICE_ID, DEVICES } from "@/shared/config/devices";

/**
 * The animator's target device. Deliberately NOT wired into resetAll and
 * persisted in localStorage: the device you're budgeting for is part of your
 * environment, not of the skeleton, so it survives skeleton swaps and reloads.
 */

const LS_KEY = "spine-workbench.device";

function initialDeviceId(): string {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && DEVICES.some((d) => d.id === stored)) return stored;
  } catch {
    // private mode etc. - fall through to default
  }
  return DEFAULT_DEVICE_ID;
}

interface DeviceState {
  deviceId: string;
  setDevice: (id: string) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: initialDeviceId(),
  setDevice: (deviceId) => {
    try {
      localStorage.setItem(LS_KEY, deviceId);
    } catch {
      // persistence is best-effort
    }
    set({ deviceId });
  },
}));
