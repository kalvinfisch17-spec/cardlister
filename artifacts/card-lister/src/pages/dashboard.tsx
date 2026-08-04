import { 
  useGetCardStats, 
  useGetListingStats, 
  useGetEbayStatus 
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/shell";
import { Link } from "wouter";
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { ArrowRight, AlertTriangle, TrendingUp, Search, Library } from "lucide-react";

export default function Dashboard() {
  const { data: cardStats } = useGetCardStats({ query: { queryKey: ["cardStats"] } });
  const { data: listingStats } = useGetListingStats({ query: { queryKey: ["listingStats"] } });
  const { data: ebayStatus } = useGetEbayStatus({ query: { queryKey: ["ebayStatus"] } });

  const holoData = cardStats ? [
    { name: "Standard", value: cardStats.holoBreakdown.standard, color: "hsl(240, 10%, 80%)" },
    { name: "Holo", value: cardStats.holoBreakdown.holo, color: "hsl(270, 80%, 65%)" },
    { name: "Reverse Holo", value: cardStats.holoBreakdown.reverse_holo, color: "hsl(180, 80%, 45%)" },
  ] : [];

  const qualityData = cardStats?.qualityBreakdown || [];

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Dashboard</h1>
          <Link href="/upload" className="bg-primary text-primary-foreground px-4 py-2 rounded-sm text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer">
            <ArrowRight className="w-4 h-4" />
            Upload Batch
          </Link>
        </div>

        {ebayStatus?.connected === false && (
          <div className="bg-amber-100 border border-amber-200 text-amber-900 px-4 py-3 rounded-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div className="text-sm font-medium">eBay account not connected. You cannot list cards until you authorize CardLister.</div>
            </div>
            <Link href="/settings" className="text-xs font-bold uppercase tracking-wider bg-amber-200 px-3 py-1 rounded-sm cursor-pointer hover:bg-amber-300 inline-block">
              Connect Now
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="cockpit-panel">
            <div className="cockpit-header">Total Cards</div>
            <div className="p-4">
              <div className="text-4xl font-mono font-bold text-foreground">{cardStats?.total || 0}</div>
              <div className="text-sm text-muted-foreground mt-1 flex justify-between">
                <span>{cardStats?.pending || 0} pending</span>
                <span>{cardStats?.reviewed || 0} reviewed</span>
              </div>
            </div>
          </div>
          <div className="cockpit-panel">
            <div className="cockpit-header">Active Listings</div>
            <div className="p-4">
              <div className="text-4xl font-mono font-bold text-primary">{listingStats?.active || 0}</div>
              <div className="text-sm text-muted-foreground mt-1">{listingStats?.draft || 0} drafts ready</div>
            </div>
          </div>
          <div className="cockpit-panel">
            <div className="cockpit-header">Items Sold</div>
            <div className="p-4">
              <div className="text-4xl font-mono font-bold text-emerald-600">{listingStats?.sold || 0}</div>
              <div className="text-sm text-muted-foreground mt-1">Total volume</div>
            </div>
          </div>
          <div className="cockpit-panel">
            <div className="cockpit-header">Total Revenue</div>
            <div className="p-4">
              <div className="text-4xl font-mono font-bold text-foreground">${(listingStats?.totalRevenue || 0).toFixed(2)}</div>
              <div className="text-sm text-emerald-600 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>Active potential: ${(cardStats?.recentlyAdded?.reduce((acc, c) => acc + (c.suggestedPrice || 0), 0) || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="cockpit-panel h-80 flex flex-col">
                <div className="cockpit-header">Holo Breakdown</div>
                <div className="flex-1 p-4">
                  {cardStats ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={holoData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {holoData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '2px', border: '1px solid var(--border)' }}
                          itemStyle={{ fontFamily: 'var(--app-font-mono)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
                  )}
                </div>
              </div>

              <div className="cockpit-panel h-80 flex flex-col">
                <div className="cockpit-header">Quality Distribution</div>
                <div className="flex-1 p-4">
                  {cardStats ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={qualityData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="quality" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontFamily: 'var(--app-font-mono)' }} />
                        <Tooltip 
                          cursor={{ fill: 'hsl(var(--muted))' }}
                          contentStyle={{ borderRadius: '2px', border: '1px solid var(--border)' }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
                  )}
                </div>
              </div>
            </div>

            <div className="cockpit-panel flex-1">
              <div className="cockpit-header flex items-center justify-between">
                <span>Recent Listings</span>
                <Link href="/listings" className="text-xs text-primary hover:underline cursor-pointer">
                  View All
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-card-border bg-muted/10">
                      <th className="py-2 px-4 text-left font-medium text-muted-foreground">Item</th>
                      <th className="py-2 px-4 text-left font-medium text-muted-foreground">Price</th>
                      <th className="py-2 px-4 text-left font-medium text-muted-foreground">Status</th>
                      <th className="py-2 px-4 text-right font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listingStats?.recentListings?.map(listing => (
                      <tr key={listing.id} className="border-b border-card-border last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{listing.title || (listing.card ? `${listing.card.cardName} - ${listing.card.setName}` : 'Unknown')}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{listing.ebayListingId || 'Draft'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono">${listing.price?.toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-sm ${
                            listing.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                            listing.status === 'sold' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-xs text-muted-foreground font-mono">
                          {new Date(listing.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {!listingStats?.recentListings?.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No recent listings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="cockpit-panel h-full flex flex-col">
            <div className="cockpit-header flex items-center justify-between">
              <span>Recently Analyzed</span>
              <Link href="/cards" className="text-xs text-primary hover:underline cursor-pointer">
                View All
              </Link>
            </div>
            <div className="p-3 flex flex-col gap-3 overflow-y-auto">
              {cardStats?.recentlyAdded?.map(card => (
                <Link key={card.id} href={`/cards/${card.id}`} className="group flex gap-3 p-2 rounded-sm border border-transparent hover:border-border hover:bg-muted/30 cursor-pointer transition-colors">
                  <div className="w-12 h-16 bg-muted rounded-sm overflow-hidden flex-shrink-0 border border-border flex items-center justify-center">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.cardName || 'Card'} className="w-full h-full object-cover" />
                    ) : (
                      <Search className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="font-medium text-sm truncate text-foreground group-hover:text-primary transition-colors">
                      {card.cardName || 'Unknown Card'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{card.setName || 'Unknown Set'}</div>
                    <div className="mt-1 flex gap-2">
                      {card.quality && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-sm">
                          {card.quality}
                        </span>
                      )}
                      {card.suggestedPrice && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-sm">
                          ${card.suggestedPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {!cardStats?.recentlyAdded?.length && (
                <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Library className="w-8 h-8 opacity-20" />
                  No cards added yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
