import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { useRoute, Link, useLocation } from "wouter";
import { 
  useGetCard, 
  useUpdateCard, 
  useGetCardPricing, 
  useCreateListing,
  useAnalyzeCard
} from "@workspace/api-client-react";
import { ArrowLeft, ExternalLink, Sparkles, Loader2, Save, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CardDetailPage() {
  const [, params] = useRoute("/cards/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: card, isLoading: cardLoading, refetch: refetchCard } = useGetCard(id, { 
    query: { enabled: !!id, queryKey: ["card", id] } 
  });
  
  const { data: pricing, isLoading: pricingLoading } = useGetCardPricing(id, {
    query: { enabled: !!id, queryKey: ["pricing", id] }
  });

  const updateCard = useUpdateCard();
  const createListing = useCreateListing();
  const analyzeCard = useAnalyzeCard();

  const [formData, setFormData] = useState<any>({});
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (card) {
      setFormData({
        cardName: card.cardName || "",
        setName: card.setName || "",
        cardNumber: card.cardNumber || "",
        year: card.year || "",
        quality: card.quality || "",
        holoType: card.holoType || "standard",
        suggestedPrice: card.suggestedPrice || "",
        notes: card.notes || ""
      });
    }
  }, [card]);

  const handleSave = async () => {
    await updateCard.mutateAsync({
      id,
      data: {
        ...formData,
        suggestedPrice: formData.suggestedPrice ? parseFloat(formData.suggestedPrice) : undefined,
        status: card?.status === 'pending' ? 'reviewed' : card?.status
      }
    });
    setIsEditing(false);
    toast({ title: "Saved", description: "Card details updated successfully." });
    refetchCard();
  };

  const handleCreateListing = async () => {
    createListing.mutate({
      data: {
        cardId: id,
        price: parseFloat(formData.suggestedPrice) || card?.suggestedPrice || 0,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Listing Created", description: "Card has been sent to eBay." });
        refetchCard();
      }
    });
  };

  const handleReanalyze = async () => {
    if (!card?.imageUrl) return;
    toast({ title: "Analyzing", description: "Running AI analysis..." });
    // This requires base64, in a real scenario we'd fetch the image and convert it.
    // For this mockup, we'll just show a toast.
    toast({ title: "Simulation", description: "Re-analysis simulated in this sandbox." });
  };

  if (cardLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (!card) return <Shell>Card not found</Shell>;

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/cards" className="p-2 bg-muted hover:bg-muted/80 rounded-sm border border-border transition-colors inline-flex items-center justify-center cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-extrabold tracking-tight">
                  {card.cardName || "Unnamed Card"}
                </h1>
                <span className={`px-2 py-1 text-xs uppercase font-bold tracking-wider rounded-sm border ${
                  card.status === 'listed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  card.status === 'reviewed' ? 'bg-primary/5 text-primary border-primary/20' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {card.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-sm">{card.setName} {card.cardNumber && `• #${card.cardNumber}`}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {isEditing ? (
              <button 
                onClick={handleSave}
                disabled={updateCard.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-sm text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                {updateCard.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            ) : (
              <>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="bg-white text-foreground border border-border px-4 py-2 rounded-sm text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors"
                >
                  Edit Details
                </button>
                {card.status !== 'listed' && (
                  <button 
                    onClick={handleCreateListing}
                    disabled={createListing.isPending}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-sm text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors flex items-center gap-2"
                  >
                    {createListing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                    List on eBay
                  </button>
                )}
                {card.status === 'listed' && card.ebayListingId && (
                  <button className="bg-slate-800 text-white px-4 py-2 rounded-sm text-sm font-semibold shadow-sm flex items-center gap-2 opacity-50 cursor-not-allowed">
                    Already Listed
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="cockpit-panel p-2">
              <div className="aspect-[3/4] bg-slate-100 rounded-sm border border-border overflow-hidden relative">
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.cardName || 'Card'} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">No Image</div>
                )}
              </div>
              <button 
                onClick={handleReanalyze}
                className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-sm font-semibold text-secondary hover:bg-secondary/10 rounded-sm transition-colors border border-transparent hover:border-secondary/20"
              >
                <Sparkles className="w-4 h-4" /> Re-run AI Analysis
              </button>
            </div>
            
            <div className="cockpit-panel">
              <div className="cockpit-header">Pricing Data (Comps)</div>
              <div className="p-4">
                {pricingLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                ) : pricing ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-muted p-2 rounded-sm border border-border text-center">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Low</div>
                        <div className="font-mono font-medium text-sm mt-1">${pricing.lowestPrice?.toFixed(2) || '--'}</div>
                      </div>
                      <div className="bg-primary/10 p-2 rounded-sm border border-primary/20 text-center">
                        <div className="text-[10px] text-primary uppercase font-bold tracking-wider">Avg</div>
                        <div className="font-mono font-bold text-primary text-sm mt-1">${pricing.averagePrice?.toFixed(2) || '--'}</div>
                      </div>
                      <div className="bg-muted p-2 rounded-sm border border-border text-center">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">High</div>
                        <div className="font-mono font-medium text-sm mt-1">${pricing.highestPrice?.toFixed(2) || '--'}</div>
                      </div>
                    </div>
                    
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Sold Listings</div>
                    <div className="flex flex-col gap-2">
                      {pricing.soldListings.map((sold, idx) => (
                        <a key={idx} href={sold.url} target="_blank" rel="noreferrer" className="group flex justify-between items-center p-2 text-sm border border-border rounded-sm hover:border-primary/50 transition-colors">
                          <div className="truncate pr-4 flex-1">
                            <span className="font-medium group-hover:text-primary transition-colors truncate block">{sold.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{new Date(sold.soldDate).toLocaleDateString()}</span>
                          </div>
                          <div className="font-mono font-bold text-emerald-600 flex items-center gap-1">
                            ${sold.price.toFixed(2)}
                            <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                          </div>
                        </a>
                      ))}
                      {pricing.soldListings.length === 0 && (
                        <div className="text-sm text-center py-2 text-muted-foreground">No recent comps found.</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-center py-2 text-muted-foreground">Pricing data unavailable.</div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="cockpit-panel">
              <div className="cockpit-header">Card Attributes</div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Card Name</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={formData.cardName} 
                        onChange={(e) => setFormData({...formData, cardName: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border">{card.cardName || '—'}</div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Set Name</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={formData.setName} 
                        onChange={(e) => setFormData({...formData, setName: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border">{card.setName || '—'}</div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Card Number</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={formData.cardNumber} 
                        onChange={(e) => setFormData({...formData, cardNumber: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border">{card.cardNumber || '—'}</div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Year</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={formData.year} 
                        onChange={(e) => setFormData({...formData, year: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border">{card.year || '—'}</div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quality (Condition)</label>
                    {isEditing ? (
                      <select 
                        value={formData.quality} 
                        onChange={(e) => setFormData({...formData, quality: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      >
                        <option value="NM">Near Mint (NM)</option>
                        <option value="LP">Lightly Played (LP)</option>
                        <option value="MP">Moderately Played (MP)</option>
                        <option value="HP">Heavily Played (HP)</option>
                        <option value="D">Damaged (D)</option>
                      </select>
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-sm border border-slate-200">{card.quality || '—'}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Foil Type</label>
                    {isEditing ? (
                      <select 
                        value={formData.holoType} 
                        onChange={(e) => setFormData({...formData, holoType: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono"
                      >
                        <option value="standard">Standard (Non-Foil)</option>
                        <option value="holo">Holo</option>
                        <option value="reverse_holo">Reverse Holo</option>
                      </select>
                    ) : (
                      <div className="font-mono font-medium text-sm py-2 border-b border-dashed border-border capitalize">{card.holoType?.replace('_', ' ') || 'Standard'}</div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-emerald-600">Suggested Listing Price ($)</label>
                    {isEditing ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted-foreground">$</span>
                        <input 
                          type="number" 
                          step="0.01"
                          value={formData.suggestedPrice} 
                          onChange={(e) => setFormData({...formData, suggestedPrice: e.target.value})}
                          className="w-full pl-8 pr-3 py-2 bg-emerald-50/50 border border-emerald-200 rounded-sm text-sm focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-700"
                        />
                      </div>
                    ) : (
                      <div className="font-mono font-bold text-lg py-1 border-b border-dashed border-border text-emerald-600">
                        ${card.suggestedPrice?.toFixed(2) || '—'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="cockpit-panel flex-1">
              <div className="cockpit-header">Private Notes</div>
              <div className="p-4 h-[calc(100%-40px)]">
                {isEditing ? (
                  <textarea 
                    value={formData.notes} 
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Internal notes, acquisition cost, bin location..."
                    className="w-full h-full min-h-[120px] px-3 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary font-mono resize-none"
                  />
                ) : (
                  <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground h-full min-h-[120px]">
                    {card.notes || "No notes added."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
