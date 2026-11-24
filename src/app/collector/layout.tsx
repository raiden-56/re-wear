import { CalendarDays, History, LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "Collector", template: "%s · ReWear Collector" } };

export default async function CollectorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["COLLECTOR"], "/collector");
  return (
    <AppShell
      user={user}
      portal="Collector app"
      nav={[
        { href: "/collector", label: "Today", icon: <LayoutDashboard />, exact: true },
        { href: "/collector/calendar", label: "Calendar", icon: <CalendarDays /> },
        { href: "/collector/history", label: "History", icon: <History /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
