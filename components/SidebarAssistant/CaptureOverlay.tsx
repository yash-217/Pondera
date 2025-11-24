import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface CaptureOverlayProps {
  imageSrc: string;
  onConfirm: (croppedImageBase64: string) => void;
  onCancel: () => void;
}

export const CaptureOverlay: React.FC<CaptureOverlayProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw image and selection
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw dimmed background
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear selection area
      if (selection) {
        ctx.drawImage(
          img,
          selection.x, selection.y, selection.w, selection.h,
          selection.x, selection.y, selection.w, selection.h
        );
        
        // Draw border
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineWidth = 2;
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      }
    };
  }, [imageSrc, selection]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setStartPos({ x, y });
    setSelection({ x, y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    const w = currentX - startPos.x;
    const h = currentY - startPos.y;

    setSelection({
      x: w < 0 ? currentX : startPos.x,
      y: h < 0 ? currentY : startPos.y,
      w: Math.abs(w),
      h: Math.abs(h)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    setStartPos({ x, y });
    setSelection({ x, y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const touch = e.touches[0];
    const currentX = (touch.clientX - rect.left) * scaleX;
    const currentY = (touch.clientY - rect.top) * scaleY;

    const w = currentX - startPos.x;
    const h = currentY - startPos.y;

    setSelection({
      x: w < 0 ? currentX : startPos.x,
      y: h < 0 ? currentY : startPos.y,
      w: Math.abs(w),
      h: Math.abs(h)
    });
  };

  const handleConfirm = () => {
    if (!selection || selection.w === 0 || selection.h === 0 || !canvasRef.current) return;

    const sourceCanvas = canvasRef.current;
    const destCanvas = document.createElement('canvas');
    destCanvas.width = selection.w;
    destCanvas.height = selection.h;
    const destCtx = destCanvas.getContext('2d');

    if (destCtx) {
      destCtx.drawImage(
        sourceCanvas,
        selection.x, selection.y, selection.w, selection.h,
        0, 0, selection.w, selection.h
      );
      onConfirm(destCanvas.toDataURL('image/png').split(',')[1]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-medium pointer-events-none select-none border border-white/10">
        Drag to select an area to analyze
      </div>
      
      <div 
        ref={containerRef} 
        className="relative max-w-full max-h-[80vh] overflow-hidden border border-white/20 shadow-2xl rounded-lg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      >
        <canvas 
          ref={canvasRef} 
          className="cursor-crosshair max-w-full max-h-[80vh] object-contain block touch-none"
        />
      </div>

      <div className="flex gap-4 mt-6">
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors font-medium backdrop-blur-sm"
        >
          <X size={18} /> Cancel
        </button>
        <button 
          onClick={handleConfirm}
          disabled={!selection || selection.w < 5 || selection.h < 5}
          className="flex items-center gap-2 px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium shadow-lg shadow-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={18} /> Analyze Selection
        </button>
      </div>
    </div>
  );
};
