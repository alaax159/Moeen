import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

import {
  clearOptIn,
  isOptedInForOwner,
  publishForOwnerWithRollback,
  setOptInForOwner,
  type EmergencyLockscreenModule,
} from "./lockscreen-owner";

const nativeModule =
  Platform.OS === "android"
    ? requireNativeModule<EmergencyLockscreenModule>("MoeenEmergencyLockscreen")
    : null;

export function isEmergencyLockscreenEnabled(
  ownerUid: string | null | undefined,
): Promise<boolean> {
  return isOptedInForOwner(nativeModule, ownerUid);
}

export function setEmergencyLockscreenEnabled(
  ownerUid: string | null | undefined,
  enabled: boolean,
): Promise<void> {
  return setOptInForOwner(nativeModule, ownerUid, enabled);
}

export function publishEmergencyLockscreenQrWithRollback(
  ownerUid: string | null | undefined,
  encodedPng: string,
  isCurrent?: () => boolean,
): Promise<boolean> {
  return publishForOwnerWithRollback(
    nativeModule,
    ownerUid,
    encodedPng,
    isCurrent,
  );
}

export function clearEmergencyLockscreenQr(): Promise<void> {
  return clearOptIn(nativeModule);
}
