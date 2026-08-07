import { useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useListListings, useDeleteListing } from "@workspace/api-client-react";
import { Search, ExternalLink, Activity, Filter, Trash2, Loader2, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ListingsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regenerating, setRegenerating] = useState(false);
  
  const { data: listings, isLoading, refetch } = useListListings({}, { query: { queryKey: ["listings"] } });
  const deleteListing = useDeleteListing();
  const { toast } = useToast();

  const filteredListings = listings?.filter(listing => {
    const searchTarget = (listing.title || listing.card?.cardName || "").toLowerCase();
    const matchesSearch = !searchTerm || searchTarget.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const handleDelete = async (id: number) => {
    if (confirm("End this listing and remove it from CardLister?")) {
      await deleteListing.mutateAsync({ id });
      toast({ title: "Listing Removed", description: "The listing has been deleted." });
      refetch();
    }
  };

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">eBay Listings</h1>
          <p className="text-muted-foreground mt-1">Manage active listings and view sales history.</p>
        </div>

        <div className="cockpit-panel p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900 border-slate-800 text-slate-100">
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search listings..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-sm text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono text-white placeholder:text-slate-600"
              />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-sm text-sm appearance-none focus:outline-none focus:border-primary font-mono text-white"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="sold">Sold</option>
                <option value="draft">Drafts</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-mono font-medium text-slate-400">
              <Activity className="w-4 h-4" />
              {filteredListings.length} results
            </div>
            <button
              onClick={async () => {
                setRegenerating(true);
                const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
                try {
                  const r = await fetch(`${base}/api/listings/regenerate-titles`, { method: "POST" });
                  const d = await r.json().catch(() => ({}));
                  alert(`Regenerating titles for ${d.total ?? "all"} listings in the background. Refresh in ~30 seconds.`);
                } catch { alert("Could not connect to server."); }
                finally { setRegenerating(false); }
              }}
              disabled={regenerating}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300 border border-slate-600 px-3 py-1.5 rounded-sm hover:bg-slate-800 hover:border-slate-500 transition-colors disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerate Titles
            </button>
            <button
              onClick={() => {
                const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
                fetch(`${base}/api/listings/export/ebay-csv-revise`)
                  .then(r => {
                    if (!r.ok) throw new Error("No listings to export");
                    return r.blob();
                  })
                  .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fischtcg-revise-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch(() => alert("No active listings with eBay IDs found to export."));
              }}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300 border border-slate-600 px-3 py-1.5 rounded-sm hover:bg-slate-800 hover:border-slate-500 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Revise CSV
            </button>
          </div>
        </div>

        <div className="cockpit-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-muted/30">
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground w-16">Item</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Listing Title & ID</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Price</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-right font-display font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm font-mono">Syncing with eBay...</p>
                    </td>
                  </tr>
                ) : filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      No listings found.
                    </td>
                  </tr>
                ) : (
                  filteredListings.map(listing => (
                    <tr key={listing.id} className="border-b border-card-border last:border-0 hover:bg-muted/10 transition-colors group">
                      <td className="py-3 px-4">
                        <div className="w-10 h-14 bg-muted border border-border rounded-sm overflow-hidden shadow-sm">
                          {listing.card?.imageUrl ? (
                            <img src={listing.card.imageUrl} alt="Card" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-200" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground line-clamp-1 max-w-md">
                          {listing.title || (listing.card ? `${listing.card.cardName} - ${listing.card.setName}` : 'Untitled Listing')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono flex items-center gap-2">
                          <span>eBay ID: {listing.ebayListingId || 'Pending'}</span>
                          <span>•</span>
                          <span>Created {new Date(listing.createdAt).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                        ${listing.price?.toFixed(2) || '---'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-sm border ${
                          listing.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          listing.status === 'sold' ? 'bg-primary/10 text-primary border-primary/20' :
                          listing.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {listing.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          {listing.ebayUrl && (
                            <a href={listing.ebayUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-foreground border border-border px-3 py-1.5 rounded-sm hover:bg-muted transition-colors inline-flex items-center gap-1.5 cursor-pointer">
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          )}
                          <button 
                            onClick={() => handleDelete(listing.id)}
                            className="text-muted-foreground hover:text-destructive p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
