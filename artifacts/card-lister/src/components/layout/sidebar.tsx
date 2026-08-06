import { Link, useLocation } from "wouter";
import { LayoutDashboard, UploadCloud, Library, List, Settings, Activity, FileInput } from "lucide-react";
import { useGetEbayStatus } from "@workspace/api-client-react";

export function Sidebar() {
  const [location] = useLocation();
  const { data: ebayStatus } = useGetEbayStatus({ query: { queryKey: ["ebayStatus"] } });

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/upload", label: "Upload & Analyze", icon: UploadCloud },
    { href: "/cards", label: "Card Collection", icon: Library },
    { href: "/listings", label: "Listings", icon: List },
    { href: "/import", label: "Import from eBay", icon: FileInput },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 border-r flex flex-col h-[100dvh]" style={{background: 'hsl(240 15% 5%)', borderColor: 'hsl(255 20% 14%)', color: 'hsl(220 20% 80%)'}}>
      <div className="h-16 flex items-center px-6 border-b" style={{borderColor: 'hsl(255 20% 14%)'}}>
        <div className="font-display font-bold text-xl text-white tracking-tight flex items-center gap-2">
          <div className="w-7 h-7 rounded-[3px] flex items-center justify-center" style={{background: 'linear-gradient(135deg, hsl(225 100% 58%), hsl(272 85% 60%))'}}>
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span>
            <span style={{color: 'hsl(225 100% 70%)'}}>Fisch</span><span style={{color: 'hsl(272 85% 72%)'}}>TCG</span>
          </span>
        </div>
      </div>

      <div className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
        <div className="text-xs font-mono uppercase tracking-wider mb-2 px-3" style={{color: 'hsl(240 10% 40%)'}}>Menu</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-all cursor-pointer ${
                isActive
                  ? "text-white font-medium"
                  : "hover:text-white"
              }`}
              style={isActive ? {background: 'linear-gradient(90deg, hsl(225 100% 58% / 0.25), hsl(272 85% 60% / 0.15))', borderLeft: '2px solid hsl(225 100% 62%)'} : {borderLeft: '2px solid transparent'}}
            >
              <Icon className="w-4 h-4" style={isActive ? {color: 'hsl(225 100% 70%)'} : {}} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t" style={{borderColor: 'hsl(255 20% 14%)', background: 'hsl(240 15% 4%)'}}>
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
