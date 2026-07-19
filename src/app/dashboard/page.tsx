import { redirect } from "next/navigation";

/** Renders the dashboard index interface. */
export default function DashboardIndex() {
  redirect("/dashboard/overview");
}