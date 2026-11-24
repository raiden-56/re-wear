import { BarChart3, Boxes, Building2, CalendarRange, FileSpreadsheet, HandHeart, IndianRupee, LayoutDashboard, LifeBuoy, Map, ScrollText, Settings, Store, Tags, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "Admin", template: "%s · ReWear Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin");
  const nav = [
    { href: "/admin", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: "/admin/bookings", label: "Bookings", icon: <CalendarRange /> },
    { href: "/admin/customers", label: "Customers", icon: <Users /> },
    { href: "/admin/payments", label: "Payouts", icon: <IndianRupee /> },
    { href: "/admin/pricing", label: "Pricing", icon: <Tags /> },
    { href: "/admin/operations", label: "Pickup operations", icon: <Map /> },
    { href: "/warehouse", label: "Warehouse", icon: <Boxes /> },
    { href: "/admin/marketplace", label: "Marketplace", icon: <Store /> },
    { href: "/admin/b2b", label: "B2B", icon: <Building2 /> },
    { href: "/admin/partners", label: "Recycling & NGOs", icon: <HandHeart /> },
    { href: "/admin/finance", label: "Finance & ledger", icon: <Wallet /> },
    { href: "/admin/reports", label: "Reports", icon: <FileSpreadsheet /> },
    { href: "/admin/support", label: "Support & disputes", icon: <LifeBuoy /> },
    { href: "/admin/settings", label: "Settings", icon: <Settings /> },
    { href: "/admin/audit", label: "Audit log", icon: <ScrollText /> },
  ];
  return (
    <AppShell user={user} portal={user.role === "SUPER_ADMIN" ? "Super admin" : "Admin"} nav={nav} mobileNav={[nav[0], nav[1], nav[3], { href: "/admin/reports", label: "Reports", icon: <BarChart3 /> }, nav[13]]}>
      {children}
    </AppShell>
  );
}
