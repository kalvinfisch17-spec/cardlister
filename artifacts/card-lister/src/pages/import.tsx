import { useState, useRef } from "react";
import { Shell } from "@/components/layout/shell";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ImportJob {
  jobId: string;
  total: number;
}

interface ImportProgress {
  processed: number;
  total: number;
  done: boolean;
  imported: number;
  priced: number;
  errors: number;
}

export default function ImportPage() {
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number>(0);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const countRows = (csv: string): number => {
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    return Math.max(0, lines.length - 1); // subtract header
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast({ title: "Invalid file", description: "Please upload an eBay CSV export file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvContent(text);
      setFileName(file.name);
      setPreviewCount(countRows(text));
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const startImport = async () => {
    if (!csvContent) return;
    setIsStarting(true);
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/listings/import/ebay-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        toast({ title: "Import failed", description: err.error, variant: "destructive" });
        return;
      }
      const data = await res.json() as ImportJob;
      setJob(data);
      setProgress({ processed: 0, total: data.total, done: false, imported: 0, priced: 0, errors: 0 });

      // Poll for progress
      const base2 = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${base2}/api/listings/import/${data.jobId}/progress`);
          if (r.ok) {
            const p = await r.json() as ImportProgress;
            setProgress(p);
            if (p.done && pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch { /* keep polling */ }
      }, 1000);
    } catch {
      toast({ title: "Import failed", description: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setIsStarting(false);
    }
  };

  const percent = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;
  const isDone = progress?.done ?? false;

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/listings" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">Import eBay Listings</h1>
            <p className="text-muted-foreground mt-1">
              Upload your eBay Seller Hub active listings export — we'll re-price, rewrite titles &amp; descriptions for all of them.
            </p>
          </div>
        </div>

        {/* Instructions */}
        {!job && (
          <div className="cockpit-panel p-4 text-sm space-y-2">
            <div className="font-display font-semibold text-sm mb-3">How to export from eBay Seller Hub:</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground font-mono text-xs">
              <li>Go to <span className="text-foreground">eBay Seller Hub → Listings → Active</span></li>
              <li>Click <span className="text-foreground">Download active listings</span></li>
              <li>Save the CSV file and upload it below</li>
            </ol>
          </div>
        )}

        {/* File upload */}
        {!job && !csvContent && (
          <div
            className="border-2 border-dashed border-primary/30 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center py-14 cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              ref={fileInputRef}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg, hsl(225 100% 58% / 0.15), hsl(272 85% 60% / 0.15))" }}>
              <UploadCloud className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-display font-bold text-xl mb-1">Click or drag your eBay CSV here</h3>
            <p className="text-sm text-muted-foreground">The file from eBay Seller Hub "Download active listings"</p>
          </div>
        )}

        {/* Preview & confirm */}
        {!job && csvContent && (
          <div className="cockpit-panel p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary shrink-0" />
              <div>
                <div className="font-display font-bold text-lg">{fileName}</div>
                <div className="text-sm text-muted-foreground font-mono">{previewCount.toLocaleString()} listings found</div>
              </div>
            </div>

            <div className="bg-accent/40 border border-border rounded p-3 text-sm space-y-1">
              <div className="font-semibold text-foreground">What happens next:</div>
              <ul className="text-muted-foreground space-y-0.5 text-xs font-mono">
                <li>• Each listing title is parsed to identify the card</li>
                <li>• eBay sold history is checked (up to 50 recent sales) for fresh pricing</li>
                <li>• Titles &amp; descriptions are rewritten with FischTCG formatting</li>
                <li>• All {previewCount.toLocaleString()} listings land in your collection, ready for Revise CSV export</li>
                <li className="text-amber-400 pt-1">• With {previewCount.toLocaleString()} listings this may take {Math.round(previewCount / 5 * 1.2)} – {Math.round(previewCount / 5 * 2)} minutes</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startImport}
                disabled={isStarting}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isStarting ? "Starting…" : `Import ${previewCount.toLocaleString()} Listings`}
              </button>
              <button
                onClick={() => { setCsvContent(null); setFileName(null); setPreviewCount(0); }}
                className="px-4 py-3 border border-border rounded-sm text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {job && progress && !isDone && (
          <div className="cockpit-panel p-8 flex flex-col items-center gap-6">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <div className="text-center">
              <h2 className="text-xl font-display font-bold mb-1">Importing Listings…</h2>
              <p className="text-muted-foreground text-sm">Parsing titles, fetching eBay prices, and rewriting descriptions.</p>
            </div>

            <div className="w-full space-y-2">
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden border border-border">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.max(percent, 2)}%`, background: "linear-gradient(90deg, hsl(225 100% 58%), hsl(272 85% 60%))" }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>{percent}%</span>
                <span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()} listings</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full text-center">
              <div className="cockpit-panel p-3">
                <div className="text-2xl font-mono font-bold text-emerald-400">{progress.imported}</div>
                <div className="text-xs text-muted-foreground mt-1">Imported</div>
              </div>
              <div className="cockpit-panel p-3">
                <div className="text-2xl font-mono font-bold text-primary">{progress.priced}</div>
                <div className="text-xs text-muted-foreground mt-1">Re-priced</div>
              </div>
              <div className="cockpit-panel p-3">
                <div className="text-2xl font-mono font-bold text-amber-400">{progress.errors}</div>
                <div className="text-xs text-muted-foreground mt-1">Skipped</div>
              </div>
            </div>
          </div>
        )}

        {/* Done */}
        {job && progress && isDone && (
          <div className="cockpit-panel p-8 flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "hsl(160 80% 45% / 0.15)" }}>
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold mb-2">Import Complete!</h2>
              <p className="text-muted-foreground">Your eBay listings are now in FischTCG.</p>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full">
              <div className="cockpit-panel p-4">
                <div className="text-3xl font-mono font-bold text-emerald-400">{progress.imported}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">Imported</div>
              </div>
              <div className="cockpit-panel p-4">
                <div className="text-3xl font-mono font-bold text-primary">{progress.priced}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">Re-priced</div>
              </div>
              <div className="cockpit-panel p-4">
                <div className="text-3xl font-mono font-bold text-amber-400">{progress.errors}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">Skipped</div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href="/cards"
                className="bg-primary text-primary-foreground px-6 py-3 rounded-sm font-semibold hover:bg-primary/90 transition-colors inline-block cursor-pointer"
              >
                View Collection
              </Link>
              <button
                className="border border-border px-6 py-3 rounded-sm font-semibold hover:bg-muted transition-colors cursor-pointer"
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
              >
                Export Revise CSV
              </button>
            </div>

            {progress.errors > 0 && (
              <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded p-3 text-left">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{progress.errors} rows were skipped — they may have been missing an Item ID or Title in the CSV.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
