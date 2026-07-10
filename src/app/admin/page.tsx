import { redirect } from "next/navigation";
import {
  BarChart3,
  Crosshair,
  Database,
  History,
  ListChecks,
  Settings,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardAction, PageHeader } from "@/components/ui";
import { getCurrentUserReadOnly } from "@/features/auth/session";

export const dynamic = "force-dynamic";

interface AdminDestination {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const DATA_DESTINATIONS: AdminDestination[] = [
  {
    href: "/admin/data",
    title: "Standard data entry",
    description: "Enter monthly, annual, and breakdown values.",
    icon: BarChart3,
  },
  {
    href: "/admin/strategy-data",
    title: "Strategic data entry",
    description: "Enter raw strategic values, components, and distributions.",
    icon: Database,
  },
];

const CONFIGURATION_DESTINATIONS: AdminDestination[] = [
  {
    href: "/admin/kpis",
    title: "KPIs and categories",
    description: "Manage the catalog and strategic KPI definitions.",
    icon: Settings,
  },
  {
    href: "/admin/strategic-goals",
    title: "Strategic goals",
    description: "Manage completion rules and KPI membership.",
    icon: Waypoints,
  },
  {
    href: "/admin/configuration-gaps",
    title: "Configuration gaps",
    description: "Review missing definitions, targets, and ownership.",
    icon: ListChecks,
  },
  {
    href: "/admin/goals",
    title: "Legacy KPI targets",
    description: "Maintain backward-compatible annual KPI targets.",
    icon: Crosshair,
  },
  {
    href: "/admin/history",
    title: "History",
    description: "Review value changes and strategic audit events.",
    icon: History,
  },
  {
    href: "/admin/users",
    title: "Team and access",
    description: "Manage users, roles, and account status.",
    icon: Users,
  },
];

function DestinationGrid({ destinations }: { destinations: AdminDestination[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {destinations.map((destination) => {
        const Icon = destination.icon;
        return (
          <CardAction
            as="a"
            key={destination.href}
            href={destination.href}
            className="flex min-w-0 items-start gap-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink-900">
                {destination.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-ink-600">
                {destination.description}
              </span>
            </span>
          </CardAction>
        );
      })}
    </div>
  );
}

export default async function AdministrationPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <div className="page-content page-content-wide page-enter">
        <PageHeader
          eyebrow="Admin"
          title="Administration"
          subtitle="Choose a task. Detailed operational tools stay here so the dashboard remains focused."
        />

        <section className="mb-10" aria-labelledby="admin-data-title">
          <div className="mb-5">
            <p className="section-eyebrow">Common tasks</p>
            <h2 id="admin-data-title" className="section-title">
              Enter data
            </h2>
          </div>
          <DestinationGrid destinations={DATA_DESTINATIONS} />
        </section>

        <section aria-labelledby="admin-configuration-title">
          <div className="mb-5">
            <p className="section-eyebrow">System management</p>
            <h2 id="admin-configuration-title" className="section-title">
              Configure and review
            </h2>
          </div>
          <DestinationGrid destinations={CONFIGURATION_DESTINATIONS} />
        </section>
      </div>
    </AppShell>
  );
}
