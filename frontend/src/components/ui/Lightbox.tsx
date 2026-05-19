import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface LightboxProps {
  images: string[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function Lightbox({ images, startIndex = 0, open, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open || images.length === 0) return null;

  const current = images[index];
  const hasMany = images.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>

      {hasMany && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img
        src={current}
        alt={`Foto ${index + 1} de ${images.length}`}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
      />

      {hasMany && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
