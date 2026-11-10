import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Volume number of an item: prefers the dedicated field, falls back to the
// legacy `totalVolumes` text field that older entries used for the same purpose.
export function getVolume(item: { volumeNumber?: number; totalVolumes?: string }) {
  if (typeof item.volumeNumber === "number" && item.volumeNumber > 0) {
    return item.volumeNumber;
  }
  const legacy = parseInt(item.totalVolumes || "", 10);
  return isNaN(legacy) ? undefined : legacy;
}
