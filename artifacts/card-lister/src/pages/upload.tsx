import { useState, useRef } from "react";
import { Shell } from "@/components/layout/shell";
import { UploadCloud, X, Loader2, CheckCircle2, AlertCircle, ArrowLeftRight } from "lucide-react";
import { useBatchAnalyzeCards, useGetBatchProgress } from "@workspace/api-client-react";
import { Link } from "wouter";

interface CardPair {
  id: string;
  front: { file: File; base64: string; id: string };
  back: { file: File; base64: string; id: string } | null;
}

function buildPairs(files: { file: File; base64: string; id: string }[], backFirst: boolean): CardPair[] {
  const pairs: CardPair[] = [];
  for (let i = 0; i < files.length; i += 2) {
    const a = files[i];
    const b = files[i + 1] ?? null;
    pairs.push({
      id: a.id,
      front: backFirst ? (b ?? a) : a,
      back:  backFirst ? a : b,
    });
  }
  return pairs;
}

export default function UploadPage() {
  const [images, setImages] = useState<{ file: File; base64: string; id: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [oddWarning, setOddWarning] = useState(false);
  const [backFirst, setBackFirst] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const batchAnalyze = useBatchAnalyzeCards();
  const { data: progressText } = useGetBatchProgress(jobId || "", {
    query: {
      enabled: !!jobId,
      queryKey: ["batchProgress", jobId],
      refetchInterval: 1000,
    }
  });

  const readFile = (file: File): Promise<{ file: File; base64: string; id: string }> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const full = e.target?.result as string;
        const base64 = full.split(",")[1] || full;
        resolve({ file, base64, id: Math.random().toString(36).slice(2) });
      };
      reader.readAsDataURL(file);
    });

  const processFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    const loaded = await Promise.all(imageFiles.map(readFile));
    setImages(prev => {
      const next = [...prev, ...loaded];
      setOddWarning(next.length % 2 !== 0);
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const next = prev.filter(img => img.id !== id);
      setOddWarning(next.length % 2 !== 0);
      return next;
    });
  };

  const swapPair = (pairIndex: number) => {
    setImages(prev => {
      const next = [...prev];
      const a = pairIndex * 2;
      const b = pairIndex * 2 + 1;
      if (b < next.length) [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) processFiles(Array.from(e.dataTransfer.files));
  };

  const startAnalysis = () => {
    if (images.length === 0 || images.length % 2 !== 0) return;
    const pairs = buildPairs(images, backFirst);
    batchAnalyze.mutate({
      data: {
        images: pairs.map(pair => ({
          imageBase64: pair.front.base64,
          ...(pair.back ? { imageBackBase64: pair.back.base64 } : {}),
        }))
      }
    }, {
      onSuccess: (data) => setJobId(data.jobId),
    });
  };

  const isAnalyzing = batchAnalyze.isPending || !!jobId;
  const progressData = progressText && typeof progressText === "object" ? progressText as { processed: number; total: number; done: boolean } : null;
  const processed = progressData?.processed ?? 0;
  const total = progressData?.total ?? (jobId ? images.length / 2 : 0);
  const percent = total > 0 ? (processed / total) * 100 : 0;
  const isDone = progressData?.done ?? false;

  const pairs = buildPairs(images, backFirst);
  const canAnalyze = images.length > 0 && images.length % 2 === 0;

  return (
    <Shell>
      <div className="flex flex-col gap-6 h-[calc(100vh-6rem)]">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Upload & Analyze</h1>
          <p className="text-muted-foreground mt-1">
            Upload front + back photos in pairs — every odd photo is a front, every even photo is the back of that card.
          </p>
        </div>

        {!isAnalyzing && (
          <div
            className="border-2 border-dashed border-primary/30 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center py-14 cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => e.target.files && processFiles(Array.from(e.target.files))}
            />
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-primary"
              style={{ background: "linear-gradient(135deg, hsl(225 100% 58% / 0.15), hsl(272 85% 60% / 0.15))" }}>
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="font-display font-bold text-xl mb-1">Click or drag images here</h3>
            <p className="text-sm text-muted-foreground mb-3">Upload in pairs — odd photo is front, even photo is back</p>
            <div
              onClick={e => { e.stopPropagation(); setBackFirst(v => !v); }}
              className="flex items-center gap-3 text-xs font-mono border border-border rounded px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors select-none"
            >
              <span className={backFirst ? "text-muted-foreground" : "text-primary font-bold"}>Front first</span>
              <div className="relative w-8 h-4 rounded-full transition-colors" style={{background: backFirst ? "hsl(272 85% 60%)" : "hsl(225 100% 58%)"}}>
                <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{left: backFirst ? "17px" : "2px"}} />
              </div>
              <span className={backFirst ? "font-bold" : "text-muted-foreground"} style={backFirst ? {color: "hsl(272 85% 65%)"} : {}}>Back first</span>
            </div>
          </div>
        )}

        {oddWarning && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded px-4 py-3 text-sm font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            You have an odd number of photos ({images.length}). Add one more back image, or remove the last unpaired front to continue.
          </div>
        )}

        {images.length > 0 && !isAnalyzing && (
          <div className="flex flex-col flex-1 overflow-hidden cockpit-panel">
            <div className="cockpit-header flex justify-between items-center">
              <span>{pairs.length} Card{pairs.length !== 1 ? "s" : ""} ({images.length} photos)</span>
              <button
                onClick={startAnalysis}
                disabled={!canAnalyze}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-sm text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {canAnalyze ? `Analyze ${pairs.length} Card${pairs.length !== 1 ? "s" : ""}` : "Need even number of photos"}
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex flex-col gap-3">
              {pairs.map((pair, i) => (
                <div key={pair.id} className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded">
                  <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">Card {i + 1}</span>

                  {/* Front */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">Front</span>
                    <div className="relative w-14 h-20 bg-muted rounded-sm border border-border overflow-hidden group">
                      <img src={`data:image/jpeg;base64,${pair.front.base64}`} alt="front" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(pair.front.id)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[56px]">{pair.front.file.name}</span>
                  </div>

                  <button
                    onClick={() => swapPair(i)}
                    title="Swap front and back"
                    className="flex flex-col items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span className="text-[9px] font-mono">swap</span>
                  </button>

                  {/* Back */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{color: "hsl(272 85% 65%)"}}>Back</span>
                    {pair.back ? (
                      <div className="relative w-14 h-20 bg-muted rounded-sm border border-border overflow-hidden group">
                        <img src={`data:image/jpeg;base64,${pair.back.base64}`} alt="back" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(pair.back!.id)}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-14 h-20 bg-amber-500/10 border border-amber-500/30 border-dashed rounded-sm flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      </div>
                    )}
                    {pair.back && (
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[56px]">{pair.back.file.name}</span>
                    )}
                  </div>

                  <div className="flex-1 text-xs text-muted-foreground font-mono pl-2">
                    AI will analyze the front image to identify this card
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex-1 flex flex-col items-center justify-center cockpit-panel p-8">
            {isDone ? (
              <div className="text-center flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{background: "hsl(160 80% 45% / 0.15)"}}>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-display font-bold mb-2">Analysis Complete!</h2>
                <p className="text-muted-foreground mb-8">
                  Successfully processed {total} card{total !== 1 ? "s" : ""} with front &amp; back images.
                </p>
                <Link href="/cards" className="bg-primary text-primary-foreground px-6 py-3 rounded-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors inline-block text-center cursor-pointer">
                  Review Queue
                </Link>
              </div>
            ) : (
              <div className="w-full max-w-md text-center flex flex-col items-center">
                <div className="mb-8">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                </div>
                <h2 className="text-xl font-display font-bold mb-2">Analyzing Cards…</h2>
                <p className="text-muted-foreground mb-6 text-sm">Identifying cards, checking conditions, and fetching eBay comps.</p>
                <div className="w-full bg-muted rounded-full h-3 mb-2 overflow-hidden border border-border">
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(percent, 5)}%`, background: "linear-gradient(90deg, hsl(225 100% 58%), hsl(272 85% 60%))" }}
                  />
                </div>
                <div className="flex justify-between w-full text-xs font-mono text-muted-foreground">
                  <span>{percent.toFixed(0)}%</span>
                  <span>{processed} / {total || Math.floor(images.length / 2)} cards</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
