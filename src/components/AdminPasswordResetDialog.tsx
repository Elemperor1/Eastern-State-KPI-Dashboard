"use client";

import { Button, Dialog, FormField, Input } from "@/components/ui";
import type { User } from "@/lib/types";

interface AdminPasswordResetDialogProps {
  target: User | null;
  password: string;
  isResetting: boolean;
  onPasswordChange: (password: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function AdminPasswordResetDialog({
  target,
  password,
  isResetting,
  onPasswordChange,
  onClose,
  onConfirm,
}: AdminPasswordResetDialogProps) {
  return (
    <Dialog
      open={Boolean(target)}
      title={`Set a new password for ${target?.name ?? "this user"}`}
      description="Enter a temporary password with at least eight characters. The user must replace it at their next login before reaching the dashboard. Share it through an approved secure channel."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isResetting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={password.length < 8}
            isLoading={isResetting}
          >
            Update password
          </Button>
        </>
      }
    >
      <FormField htmlFor="reset-password" label="New temporary password" hint="Minimum 8 characters">
        <Input
          id="reset-password"
          type="password"
          autoFocus
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </FormField>
    </Dialog>
  );
}
