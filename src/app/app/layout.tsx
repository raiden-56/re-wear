import { Gift, Home, IndianRupee, LifeBuoy, MapPin, PackagePlus, ShoppingBag, Truck, UserRound } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["CUSTOMER"], "/app");
  const nav = [
    { href: "/app", label: "Home", icon: <Home />, exact: true },
    { href: "/app/sell", label: "Sell clothes", icon: <PackagePlus /> },
    { href: "/app/bookings", label: "Pickups", icon: <Truck /> },
    { href: "/app/payments", label: "Payments", icon: <IndianRupee /> },
    { href: "/app/orders", label: "Shop orders", icon: <ShoppingBag /> },
    { href: "/app/rewards", label: "Rewards & impact", icon: <Gift /> },
    { href: "/app/addresses", label: "Addresses", icon: <MapPin /> },
    { href: "/app/support", label: "Help & support", icon: <LifeBuoy /> },
    { href: "/app/profile", label: "Profile & privacy", icon: <UserRound /> },
  ];
  const mobile = [nav[0], nav[1], nav[2], nav[3], nav[8]];
  return (
    <AppShell user={user} nav={nav} mobileNav={mobile} portal="My ReWear">
      {children}
    </AppShell>
  );
}
