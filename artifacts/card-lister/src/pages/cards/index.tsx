import { useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Link } from "wouter";
import { useListCards, useDeleteCard, useBulkCreateListings } from "@workspace/api-client-react";
import { Search, Filter, Trash2, Tag, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CardsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  const { data: cards, isLoading, refetch } = useListCards({}, { query: { queryKey: ["cards"] } });
  const deleteCard = useDeleteCard();
  const bulkCreate = useBulkCreateListings();
  const { toast } = useToast();

  const filteredCards = cards?.filter(card => {
    const matchesSearch = !searchTerm || 
      card.cardName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      card.setName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCards.map(c => c.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (confirm(`Are you sure you want to delete ${selectedIds.size} cards?`)) {
      for (const id of selectedIds) {
        await deleteCard.mutateAsync({ id });
      }
      setSelectedIds(new Set());
      refetch();
      toast({ title: "Cards deleted", description: "Selected cards removed." });
    }
  };

  const handleBulkList = () => {
    bulkCreate.mutate({
      data: { cardIds: Array.from(selectedIds) }
    }, {
      onSuccess: () => {
        toast({ title: "Bulk listing started", description: "Your listings are being created." });
        setSelectedIds(new Set());
        refetch();
      }
    });
  };

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">Card Collection</h1>
            <p className="text-muted-foreground mt-1">Review AI analysis and manage inventory.</p>
          </div>
          
          <div className="flex gap-2">
            <Link href="/upload" className="bg-white text-foreground border border-border px-4 py-2 rounded-sm text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors inline-block text-center cursor-pointer">
              Upload New
            </Link>
          </div>
        </div>

        <div className="cockpit-panel p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search cards..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-sm text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2 bg-background border border-input rounded-sm text-sm appearance-none focus:outline-none focus:border-primary font-mono"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="listed">Listed</option>
              </select>
            </div>
          </div>
          
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-sm">
              <span className="text-sm font-bold text-primary mr-2 font-mono">{selectedIds.size} Selected</span>
              <button 
                onClick={handleBulkList}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-sm shadow-sm hover:bg-primary/90"
              >
                <Tag className="w-3 h-3" /> Create Listings
              </button>
              <button 
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-1 text-xs font-semibold rounded-sm shadow-sm hover:bg-destructive/90"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}
        </div>

        <div className="cockpit-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-muted/30">
                  <th className="py-3 px-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded-sm border-input"
                      checked={filteredCards.length > 0 && selectedIds.size === filteredCards.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="py-3 px-4 w-16">Image</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Card Details</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Quality</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Price</th>
                  <th className="py-3 px-4 text-left font-display font-semibold text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-right font-display font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm font-mono">Loading collection...</p>
                    </td>
                  </tr>
                ) : filteredCards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No cards found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCards.map(card => (
                    <tr key={card.id} className="border-b border-card-border last:border-0 hover:bg-muted/10 transition-colors group">
                      <td className="py-3 px-4 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded-sm border-input"
                          checked={selectedIds.has(card.id)}
                          onChange={() => toggleSelect(card.id)}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-10 h-14 bg-muted border border-border rounded-sm overflow-hidden shadow-sm">
                          {card.imageUrl ? (
                            <img src={card.imageUrl} alt="Card" className="w-full h-full object-cover" />
                          ) : (
                            <Search className="w-4 h-4 m-auto mt-5 text-muted-foreground" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{card.cardName || 'Unknown Card'}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {card.setName || 'Unknown Set'} {card.cardNumber && `#${card.cardNumber}`}
                        </div>
                        {card.holoType && card.holoType !== 'standard' && (
                          <div className="inline-block mt-1 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 bg-secondary/10 text-secondary border border-secondary/20 rounded-sm">
                            {card.holoType.replace('_', ' ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs px-2 py-1 bg-slate-100 border border-slate-200 text-slate-700 rounded-sm font-bold">
                          {card.quality || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                        ${card.suggestedPrice?.toFixed(2) || '---'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-sm border ${
                          card.status === 'listed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          card.status === 'reviewed' ? 'bg-primary/5 text-primary border-primary/20' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {card.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/cards/${card.id}`} className="text-xs font-bold uppercase tracking-wider text-primary border border-primary/30 px-3 py-1.5 rounded-sm hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 inline-block text-center cursor-pointer">
                          Edit
                        </Link>
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
