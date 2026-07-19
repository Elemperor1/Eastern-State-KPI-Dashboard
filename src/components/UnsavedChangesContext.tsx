"use client";

import { createContext, useContext } from "react";

export interface UnsavedChangesState {
  dirty: boolean;
  busy: boolean;
}

export interface UnsavedChangesContextValue {
  state: UnsavedChangesState;
  setState: (state: UnsavedChangesState) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  state: { dirty: false, busy: false },
  /** Updates state. */
  setState: () => undefined,
});

/** Implements the use unsaved changes operation. */
export function useUnsavedChanges(): UnsavedChangesContextValue {
  return useContext(UnsavedChangesContext);
}
