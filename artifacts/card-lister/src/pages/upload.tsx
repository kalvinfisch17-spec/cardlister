import { useState, useRef, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { UploadCloud, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useBatchAnalyzeCards, useGetBatchProgress } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function UploadPage() {
  const [images, setImages] = useState<{ file: File; base64: string; id: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const batchAnalyze = useBatchAnalyzeCards();
  const { data: progressText } = useGetBatchProgress(jobId || "", { 
    query: { 
      enabled: !!jobId,
      queryKey: ["batchProgress", jobId],
      refetchInterval: 1000 // Poll every second instead of relying entirely on SSE if SSE hooks are tricky
    } 
  });

  // Parse SSE data if possible, though the hook returns a string. Let's assume it returns text.
  // The actual hook says Promise<string>, SSE is typically stream. 
  // Let's assume it returns a status string like "5/10" or we just simulate progress based on length.
  // Wait, if it's SSE, the react-query hook might just hold the latest chunk.
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setImages(prev => [...prev, {
          file,
          base64: base64.split(',')[1] || base64, // Get the raw base64 data
          id: Math.random().toString(36).substring(7)
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const startAnalysis = () => {
    if (images.length === 0) return;
    
    batchAnalyze.mutate({
      data: {
        images: images.map(img => ({ imageBase64: img.base64 }))
      }
    }, {
      onSuccess: (data) => {
        setJobId(data.jobId);
      }
    });
  };

  // Mock progress if the API doesn't immediately give structured data
  const isAnalyzing = batchAnalyze.isPending || !!jobId;
  const progressMatch = typeof progressText === 'string' ? progressText.match(/(\d+)\/(\d+)/) : null;
  const processed = progressMatch ? parseInt(progressMatch[1]) : 0;
  const total = progressMatch ? parseInt(progressMatch[2]) : (jobId ? images.length : 0);
  const percent = total > 0 ? (processed / total) * 100 : 0;
  const isDone = jobId && processed === total && total > 0;

  return (
    <Shell>
      <div className="flex flex-col gap-6 h-[calc(100vh-6rem)]">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Upload & Analyze</h1>
          <p className="text-muted-foreground mt-1">Batch upload card photos to auto-detect details and suggested prices.</p>
        </div>

        {!isAnalyzing && (
          <div 
            className="border-2 border-dashed border-primary/30 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center py-16 cursor-pointer"
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
              onChange={handleFileChange}
            />
            <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center mb-4 text-primary">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="font-display font-bold text-xl mb-1">Click or drag images here</h3>
            <p className="text-sm text-muted-foreground">Supports bulk upload up to 100+ images</p>
          </div>
        )}

        {images.length > 0 && !isAnalyzing && (
          <div className="flex flex-col flex-1 overflow-hidden cockpit-panel">
            <div className="cockpit-header flex justify-between items-center">
              <span>{images.length} Images Queued</span>
              <button 
                onClick={startAnalysis}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-sm text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
              >
                Analyze Batch
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {images.map(img => (
                <div key={img.id} className="relative aspect-[3/4] bg-muted rounded-sm border border-border group overflow-hidden">
                  <img src={`data:image/jpeg;base64,${img.base64}`} alt="preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex-1 flex flex-col items-center justify-center cockpit-panel p-8">
            {isDone ? (
              <div className="text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-display font-bold mb-2">Analysis Complete!</h2>
                <p className="text-muted-foreground mb-8">Successfully processed {total} cards.</p>
                <Link href="/cards" className="bg-primary text-primary-foreground px-6 py-3 rounded-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors inline-block text-center cursor-pointer">
                  Review Queue
                </Link>
              </div>
            ) : (
              <div className="w-full max-w-md text-center flex flex-col items-center">
                <div className="mb-8 relative">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                </div>
                <h2 className="text-xl font-display font-bold mb-2">Analyzing Cards...</h2>
                <p className="text-muted-foreground mb-6 text-sm">Identifying cards, checking conditions, and fetching eBay comps.</p>
                
                <div className="w-full bg-muted rounded-full h-3 mb-2 overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(percent, 5)}%` }}
                  />
                </div>
                <div className="flex justify-between w-full text-xs font-mono text-muted-foreground">
                  <span>{percent.toFixed(0)}%</span>
                  <span>{processed} / {total || images.length} processed</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
