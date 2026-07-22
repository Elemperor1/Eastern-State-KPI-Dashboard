"use client";

import { createContext, useContext } from "react";

export interface UnsavedChangesState {
  dirty: boolean;
  busy: boolean;
}

export interface UnsavedChangesContextValue {
  state: UnsavedChangesState;
  setState: (state: UnsavedChangesState) => void;
  setSourceState: (source: string, state: UnsavedChangesState) => void;
  clearSourceState: (source: string) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  state: { dirty: false, busy: false },
  /** Updates state. */
  setState: () => undefined,
  /** Updates one concurrently mounted editor. */
  setSourceState: () => undefined,
  /** Removes one concurrently mounted editor. */
  clearSourceState: () => undefined,
});

/** Implements the use unsaved changes operation. */
export function useUnsavedChanges(): UnsavedChangesContextValue {
  return useContext(UnsavedChangesContext);
}
