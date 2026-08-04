import { Link, useLocation } from "wouter";
import { LayoutDashboard, UploadCloud, Library, List, Settings, Activity } from "lucide-react";
import { useGetEbayStatus } from "@workspace/api-client-react";

export function Sidebar() {
  const [location] = useLocation();
  const { data: ebayStatus } = useGetEbayStatus({ query: { queryKey: ["ebayStatus"] } });

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/upload", label: "Upload & Analyze", icon: UploadCloud },
    { href: "/cards", label: "Card Collection", icon: Library },
    { href: "/listings", label: "Listings", icon: List },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-[100dvh] text-slate-300">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <div className="font-display font-bold text-xl text-white tracking-tight flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-[2px] flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          CardLister
        </div>
      </div>

      <div className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
        <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2 px-3">Menu</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-sm transition-all cursor-pointer ${
                isActive 
                  ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between">
          <div className="text-xs">
            <div className="font-medium text-slate-400">eBay Connection</div>
            {ebayStatus?.connected ? (
              <div className="text-emerald-400 font-mono flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {ebayStatus.username || "Connected"}
              </div>
            ) : (
              <div className="text-amber-500 font-mono mt-1">Disconnected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
