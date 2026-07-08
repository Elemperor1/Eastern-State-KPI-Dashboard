"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import { ADMIN_USER_ROLE_OPTIONS } from "@/features/users/admin-users";

interface AdminUserCreateFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdminUserCreateForm({ onSubmit }: AdminUserCreateFormProps) {
  return (
    <Card className="mb-6 p-5 lg:p-6">
      <form id="create-user-form" onSubmit={onSubmit}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Invite a team member
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField label="Name">
            <Input name="name" required placeholder="Full name" />
          </FormField>
          <FormField label="Email">
            <Input name="email" type="email" required placeholder="name@easternstate.org" />
          </FormField>
          <FormField label="Password">
            <Input name="password" type="password" required minLength={8} placeholder="8+ characters" />
          </FormField>
          <FormField label="Role">
            <Select name="role" defaultValue="viewer">
              {ADMIN_USER_ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" icon={Plus}>
            Create user
          </Button>
        </div>
      </form>
    </Card>
  );
}
