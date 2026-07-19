import { clsx, type ClassValue } from "clsx";

/** Implements the cn operation. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
