"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import { ADMIN_USER_ROLE_OPTIONS } from "@/features/users/admin-users";
import { runEventHandler } from "@/lib/async-event";

interface AdminUserCreateFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isSubmitting?: boolean;
}

/** Renders the admin user create form interface. */
export function AdminUserCreateForm({
  onSubmit,
  isSubmitting = false,
}: AdminUserCreateFormProps) {
  return (
    <Card className="mb-6 p-5 lg:p-6">
      <form
        id="create-user-form"
        onSubmit={(event) => runEventHandler(onSubmit, event)}
      >
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Invite a team member
        </h2>
        <fieldset disabled={isSubmitting} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField label="Name" htmlFor="create-user-name">
            <Input id="create-user-name" name="name" required placeholder="Full name" />
          </FormField>
          <FormField label="Email" htmlFor="create-user-email">
            <Input id="create-user-email" name="email" type="email" required placeholder="name@easternstate.org" />
          </FormField>
          <FormField label="Password" htmlFor="create-user-password">
            <Input id="create-user-password" name="password" type="password" required minLength={8} placeholder="8+ characters" />
          </FormField>
          <FormField label="Role" htmlFor="create-user-role">
            <Select id="create-user-role" name="role" defaultValue="viewer">
              {ADMIN_USER_ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </FormField>
        </fieldset>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" icon={Plus} isLoading={isSubmitting}>
            Create user
          </Button>
        </div>
      </form>
    </Card>
  );
}
