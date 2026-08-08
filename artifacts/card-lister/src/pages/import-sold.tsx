import { useState, useRef } from "react";
import { Shell } from "@/components/layout/shell";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowLeft, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface SoldResult {
  matched: number;
  skipped: number;
  alreadySold: number;
  totalRevenue: number;
  total: number;
}

export default function ImportSoldPage() {
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SoldResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const countRows = (csv: string) =>
    Math.max(0, csv.split(/\r?\n/).filter(l => l.trim()).length - 1);

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast({ title: "Invalid file", description: "Please upload an eBay orders CSV file.", variant: "destructive" });
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

  const runImport = async () => {
    if (!csvContent) return;
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/listings/import/ebay-sold-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        toast({ title: "Import failed", description: err.error, variant: "destructive" });
        return;
      }
      const data = await res.json() as SoldResult;
      setResult(data);
    } catch {
      toast({ title: "Import failed", description: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCsvContent(null);
    setFileName(null);
    setPreviewCount(0);
    setResult(null);
  };

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/listings" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">Import Sold Orders</h1>
            <p className="text-muted-foreground mt-1">
              Upload your eBay orders CSV to mark cards as sold and track revenue.
            </p>
          </div>
        </div>

        {/* Instructions */}
        {!result && (
          <div className="cockpit-panel p-4 text-sm space-y-2">
            <div className="font-display font-semibold text-sm mb-3">How to export your orders from eBay Seller Hub:</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground font-mono text-xs">
              <li>Go to <span className="text-foreground">eBay Seller Hub → Orders</span></li>
              <li>Click <span className="text-foreground">Download order report</span> (top right)</li>
              <li>Select a date range and download the CSV</li>
              <li>Upload it below</li>
            </ol>
            <div className="text-xs text-amber-400 font-mono pt-1">
              ⚠ Do this periodically (weekly or monthly) to keep your sold counts and revenue up to date.
            </div>
          </div>
        )}

        {/* File drop zone */}
        {!result && !csvContent && (
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
            <h3 className="font-display font-bold text-xl mb-1">Click or drag your orders CSV here</h3>
            <p className="text-sm text-muted-foreground">The file from eBay Seller Hub "Download order report"</p>
          </div>
        )}

        {/* Preview & confirm */}
        {!result && csvContent && (
          <div className="cockpit-panel p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary shrink-0" />
              <div>
                <div className="font-display font-bold text-lg">{fileName}</div>
                <div className="text-sm text-muted-foreground font-mono">{previewCount.toLocaleString()} orders found</div>
              </div>
            </div>

            <div className="bg-accent/40 border border-border rounded p-3 text-sm space-y-1">
              <div className="font-semibold text-foreground">What happens:</div>
              <ul className="text-muted-foreground space-y-0.5 text-xs font-mono">
                <li>• Each order is matched to a listing by eBay Item ID</li>
                <li>• Matched listings and cards are marked as <span className="text-emerald-400">sold</span></li>
                <li>• Sale price is recorded for revenue tracking</li>
                <li>• Listings not found in your collection are skipped</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={runImport}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Processing…" : `Import ${previewCount.toLocaleString()} Orders`}
              </button>
              <button
                onClick={reset}
                className="px-4 py-3 border border-border rounded-sm text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="cockpit-panel p-8 flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "hsl(160 80% 45% / 0.15)" }}>
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold mb-2">Import Complete!</h2>
              <p className="text-muted-foreground">Sold orders have been recorded.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="cockpit-panel p-4">
                <div className="text-3xl font-mono font-bold text-emerald-400">{result.matched}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">Marked Sold</div>
              </div>
              <div className="cockpit-panel p-4">
                <div className="text-3xl font-mono font-bold text-primary flex items-center justify-center gap-1">
                  <DollarSign className="w-6 h-6" />{result.totalRevenue.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">Revenue Recorded</div>
              </div>
              {result.alreadySold > 0 && (
                <div className="cockpit-panel p-4">
                  <div className="text-3xl font-mono font-bold text-muted-foreground">{result.alreadySold}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">Already Sold</div>
                </div>
              )}
              {result.skipped > 0 && (
                <div className="cockpit-panel p-4">
                  <div className="text-3xl font-mono font-bold text-amber-400">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">Not Found / Skipped</div>
                </div>
              )}
            </div>

            {result.skipped > 0 && (
              <div className="w-full flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded p-3 text-left">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{result.skipped} orders couldn't be matched — they may have sold before you imported your listings into FischTCG.</span>
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href="/listings"
                className="bg-primary text-primary-foreground px-6 py-3 rounded-sm font-semibold hover:bg-primary/90 transition-colors inline-block cursor-pointer"
              >
                View Listings
              </Link>
              <button
                onClick={reset}
                className="border border-border px-6 py-3 rounded-sm font-semibold hover:bg-muted transition-colors cursor-pointer"
              >
                Import Another
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
