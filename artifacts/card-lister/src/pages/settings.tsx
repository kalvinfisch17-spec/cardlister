import { Shell } from "@/components/layout/shell";
import { 
  useGetEbayStatus, 
  useGetEbayAuthUrl, 
  useDisconnectEbay 
} from "@workspace/api-client-react";
import { ShoppingBag, CheckCircle2, ShieldAlert, Loader2, ArrowRight, RefreshCw, AlertTriangle, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function SettingsPage() {
  const { data: status, isLoading: statusLoading, refetch } = useGetEbayStatus({ query: { queryKey: ["ebayStatus"] } });
  const { data: authUrlData } = useGetEbayAuthUrl({ query: { queryKey: ["ebayAuthUrl"] } });
  const disconnect = useDisconnectEbay();
  const { toast } = useToast();

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateDismissed, setRegenerateDismissed] = useState(() => {
    return localStorage.getItem("descriptionUpdateNoticeDismissed") === "true";
  });

  const handleDisconnect = async () => {
    if (confirm("Disconnect your eBay account? You won't be able to list new cards until you reconnect.")) {
      await disconnect.mutateAsync();
      toast({ title: "Disconnected", description: "eBay account successfully disconnected." });
      refetch();
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    try {
      const r = await fetch(`${base}/api/listings/regenerate-titles`, { method: "POST" });
      if (!r.ok) throw new Error("Server error");
      const d = await r.json().catch(() => ({}));
      toast({
        title: "Regeneration started",
        description: `Updating titles and descriptions for ${d.total ?? "all"} listings in the background. This may take up to a minute.`,
      });
      // Dismiss the notice once they've run it
      localStorage.setItem("descriptionUpdateNoticeDismissed", "true");
      setRegenerateDismissed(true);
    } catch {
      toast({
        title: "Regeneration failed",
        description: "Could not connect to the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDismissNotice = () => {
    localStorage.setItem("descriptionUpdateNoticeDismissed", "true");
    setRegenerateDismissed(true);
  };

  return (
    <Shell>
      <div className="max-w-3xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage app preferences and external connections.</p>
        </div>

        {/* Update notice banner */}
        {!regenerateDismissed && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-sm p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Description format updated</p>
              <p className="text-sm text-amber-800 mt-0.5">
                Listing descriptions now use rich HTML formatting for better presentation on eBay.
                Your existing listings still store the old plain-text descriptions — run{" "}
                <span className="font-semibold">Regenerate Titles &amp; Descriptions</span> below
                to apply the new format before your next CSV export.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-amber-600 text-white px-3 py-1.5 rounded-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Regenerate Now
                </button>
                <button
                  onClick={handleDismissNotice}
                  className="text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* eBay Integration */}
        <div className="cockpit-panel">
          <div className="cockpit-header flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            eBay Integration
          </div>
          <div className="p-6">
            {statusLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Checking connection...
              </div>
            ) : status?.connected ? (
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-sm border border-emerald-200 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-lg">Connected to eBay</h3>
                    <div className="grid grid-cols-2 gap-4 mt-4 bg-muted/30 p-4 border border-border rounded-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Username</div>
                        <div className="font-mono text-sm mt-1">{status.username || 'Unknown'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Token Expiry</div>
                        <div className="font-mono text-sm mt-1">{status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : 'Never'}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border pt-4 flex justify-end">
                  <button 
                    onClick={handleDisconnect}
                    className="text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10 px-4 py-2 rounded-sm transition-colors"
                  >
                    Disconnect Account
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-sm border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Not Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                      CardLister requires an active eBay connection to draft and publish listings. We use official OAuth, meaning we never see your password.
                    </p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  {authUrlData?.url ? (
                    <a href={authUrlData.url} target="_blank" rel="noreferrer" className="bg-[#e53238] text-white px-6 py-2.5 rounded-sm text-sm font-semibold shadow-sm hover:bg-[#c92b31] transition-colors inline-flex items-center gap-2 cursor-pointer">
                      Connect eBay Account <ArrowRight className="w-4 h-4" />
                    </a>
                  ) : (
                    <button disabled className="bg-slate-200 text-slate-500 px-6 py-2.5 rounded-sm text-sm font-semibold flex items-center gap-2 cursor-not-allowed">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating Link...
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Listing Maintenance */}
        <div className="cockpit-panel">
          <div className="cockpit-header flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Listing Maintenance
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-display font-bold text-base">Regenerate Titles &amp; Descriptions</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                  Re-generates titles and descriptions for every listing using the latest templates.
                  Run this after a description format update so your next Revise CSV export picks up
                  the new content. The operation runs in the background and typically completes within
                  a minute.
                </p>
              </div>
            </div>
            <div className="border-t border-border pt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Existing eBay listings are not changed until you upload a Revise CSV.
              </p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground border border-border px-4 py-2 rounded-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {regenerating ? "Starting…" : "Regenerate Titles & Descriptions"}
              </button>
            </div>
          </div>
        </div>

        <div className="cockpit-panel opacity-50 pointer-events-none">
          <div className="cockpit-header">Listing Defaults (Coming Soon)</div>
          <div className="p-6">
            <p className="text-sm text-muted-foreground mb-4">Set up your standard listing templates, shipping policies, and return rules.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-10 bg-muted border border-border rounded-sm"></div>
              <div className="h-10 bg-muted border border-border rounded-sm"></div>
              <div className="h-24 bg-muted border border-border rounded-sm md:col-span-2"></div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
