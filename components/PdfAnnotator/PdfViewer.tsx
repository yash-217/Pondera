import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ScanSearch, FileUp, 
  Eye, EyeOff, Moon, Sun, Link as LinkIcon, UploadCloud, ChevronDown,
  X, Lightbulb, Calculator, BookOpen, Maximize, PenTool, Eraser, Trash2,
  RotateCcw, RotateCw, Check
} from 'lucide-react';
import { Button } from '../ui/Button';
import { analyzePdfPage } from '../../services/geminiService';
import { PageAnnotations, StudyMode, PageDrawings, Drawing } from '../../types';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const COLORS = [
  { id: 'red', value: '#ef4444' },
  { id: 'yellow', value: '#eab308' },
  { id: 'green', value: '#22c55e' },
  { id: 'blue', value: '#3b82f6' },
];

export const PdfViewer: React.FC<PdfViewerProps> = ({ isDarkMode, toggleTheme }) => {
  const [file, setFile] = useState<File | string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [activePage, setActivePage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [fitToWidth, setFitToWidth] = useState<boolean>(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [isZoomControlExpanded, setIsZoomControlExpanded] = useState(false);
  
  // Annotation/Drawing State
  const [annotations, setAnnotations] = useState<PageAnnotations>({});
  const [drawings, setDrawings] = useState<PageDrawings>({});
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [penColor, setPenColor] = useState<string>(COLORS[0].value);
  const [currentPath, setCurrentPath] = useState<{x: number, y: number}[]>([]);
  
  // Undo/Redo Stacks (per page)
  const [history, setHistory] = useState<{[key: number]: Drawing[][]}>({});
  const [future, setFuture] = useState<{[key: number]: Drawing[][]}>({});
  
  const [analyzingPages, setAnalyzingPages] = useState<Set<number>>(new Set());
  const [studyMode, setStudyMode] = useState<StudyMode>(StudyMode.READ);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | undefined>(undefined);
  
  // Upload Menu State
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
        setIsUploadMenuOpen(false);
        setShowUrlInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close active annotation when clicking elsewhere
  useEffect(() => {
    const handleDocumentClick = () => setActiveAnnotationId(undefined);
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // Measure container width for Fit Width
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 64); // Subtract padding
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    updateWidth();

    return () => observer.disconnect();
  }, []);

  // Intersection Observer to track active page
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '1', 10);
            setActivePage(pageNum);
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.4, // 40% visibility triggers page change
      }
    );

    // Observe all page elements
    Object.values(pageRefs.current).forEach((el) => {
      if (el instanceof Element) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [numPages, file]);

  // Helper to analyze a specific page
  const analyzePage = useCallback(async (pageNum: number) => {
    if (pageNum < 1 || pageNum > numPages) return;
    if (annotations[pageNum] || analyzingPages.has(pageNum)) return;

    const pageEl = pageRefs.current[pageNum];
    const canvas = pageEl?.querySelector('canvas'); // The main PDF canvas
    
    if (!canvas) return;

    setAnalyzingPages(prev => new Set(prev).add(pageNum));
    
    try {
      // Export as JPEG with 0.7 quality to reduce payload size and avoid 500 errors
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      const pageAnnotations = await analyzePdfPage(base64);
      setAnnotations(prev => ({
        ...prev,
        [pageNum]: pageAnnotations
      }));
    } catch (e) {
      console.error(`Failed to analyze page ${pageNum}`, e);
    } finally {
      setAnalyzingPages(prev => {
        const next = new Set(prev);
        next.delete(pageNum);
        return next;
      });
    }
  }, [numPages, annotations, analyzingPages]);

  // Auto-analyze Effect for Active View (Immediate Priority)
  useEffect(() => {
    if (studyMode === StudyMode.STUDY && file) {
      // Prioritize Active Page
      if (!annotations[activePage]) {
        analyzePage(activePage);
      }
      
      // Prioritize Next Page (Pre-fetch)
      const nextPage = activePage + 1;
      if (nextPage <= numPages && !annotations[nextPage]) {
        const timer = setTimeout(() => {
            analyzePage(nextPage);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [activePage, studyMode, file, numPages, annotations, analyzePage]);

  // Background Analysis Queue (Sequential Processing for Whole Document)
  useEffect(() => {
    // Only run in Study Mode, with a file, and if the user isn't actively analyzing 2+ pages (keep concurrency low)
    if (studyMode !== StudyMode.STUDY || !file || numPages === 0 || analyzingPages.size > 0) return;

    const findNextUnanalyzedPage = () => {
        for (let i = 1; i <= numPages; i++) {
            if (!annotations[i] && !analyzingPages.has(i)) {
                return i;
            }
        }
        return null;
    };

    const nextPage = findNextUnanalyzedPage();

    if (nextPage) {
        // Process next page in queue with a delay to yield to UI thread
        const timer = setTimeout(() => {
            analyzePage(nextPage);
        }, 1500); // 1.5s delay between background tasks to be gentle

        return () => clearTimeout(timer);
    }
  }, [studyMode, file, numPages, annotations, analyzingPages, analyzePage]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      setFile(files[0]);
      resetViewer();
    }
    setIsUploadMenuOpen(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        resetViewer();
      } else {
        alert("Please drop a PDF file.");
      }
    }
  };

  const onUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      setFile(urlInput.trim());
      resetViewer();
      setIsUploadMenuOpen(false);
      setShowUrlInput(false);
      setUrlInput('');
    }
  };

  const resetViewer = () => {
    setActivePage(1);
    setAnnotations({});
    setDrawings({});
    setHistory({});
    setFuture({});
    setStudyMode(StudyMode.READ);
    setAnalyzingPages(new Set());
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const scrollToPage = (pageNum: number) => {
    const targetPage = Math.min(Math.max(1, pageNum), numPages);
    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth' });
    setActivePage(targetPage);
  };

  // --- Drawing Handlers (Mouse & Touch) ---

  const saveHistory = (pageNum: number) => {
    const currentDrawings = drawings[pageNum] || [];
    setHistory(prev => ({
        ...prev,
        [pageNum]: [...(prev[pageNum] || []), currentDrawings]
    }));
    // Clear future stack when new action occurs
    setFuture(prev => ({
        ...prev,
        [pageNum]: []
    }));
  };

  const undo = () => {
    const pageHistory = history[activePage] || [];
    if (pageHistory.length === 0) return;

    const previousState = pageHistory[pageHistory.length - 1];
    const newHistory = pageHistory.slice(0, -1);

    setFuture(prev => ({
        ...prev,
        [activePage]: [...(prev[activePage] || []), drawings[activePage] || []]
    }));

    setHistory(prev => ({
        ...prev,
        [activePage]: newHistory
    }));

    setDrawings(prev => ({
        ...prev,
        [activePage]: previousState
    }));
  };

  const redo = () => {
    const pageFuture = future[activePage] || [];
    if (pageFuture.length === 0) return;

    const nextState = pageFuture[pageFuture.length - 1];
    const newFuture = pageFuture.slice(0, -1);

    setHistory(prev => ({
        ...prev,
        [activePage]: [...(prev[activePage] || []), drawings[activePage] || []]
    }));

    setFuture(prev => ({
        ...prev,
        [activePage]: newFuture
    }));

    setDrawings(prev => ({
        ...prev,
        [activePage]: nextState
    }));
  };

  const clearPageDrawings = () => {
    const currentDrawings = drawings[activePage] || [];
    if (currentDrawings.length === 0) return;
    
    saveHistory(activePage);
    setDrawings(prev => ({ ...prev, [activePage]: [] }));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, pageNum: number) => {
    if (!isDrawingMode) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath([{ x, y }]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || currentPath.length === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>, pageNum: number) => {
    if (!isDrawingMode) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    setCurrentPath([{ x, y }]);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || currentPath.length === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const handleEnd = (pageNum: number) => {
    if (!isDrawingMode || currentPath.length === 0) return;
    
    saveHistory(pageNum);

    const newDrawing: Drawing = {
      id: `draw-${Date.now()}`,
      color: penColor,
      strokeWidth: penColor === 'eraser' ? 20 : 4,
      points: currentPath
    };

    setDrawings(prev => ({
      ...prev,
      [pageNum]: [...(prev[pageNum] || []), newDrawing]
    }));
    setCurrentPath([]);
  };

  // Render drawings on a canvas
  const renderDrawings = (canvas: HTMLCanvasElement | null, pageNum: number) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Helper to draw a path
    const drawPath = (points: {x: number, y: number}[], color: string, width: number) => {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * canvas.width, points[i].y * canvas.height);
      }
      
      if (color === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 20;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
      }
      
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      
      // Reset composite op
      ctx.globalCompositeOperation = 'source-over';
    };

    // Draw saved drawings
    const pageDrawings = drawings[pageNum] || [];
    pageDrawings.forEach(d => drawPath(d.points, d.color, d.strokeWidth));
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'equation': return Calculator;
      case 'concept': return Lightbulb;
      default: return BookOpen;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-black transition-colors duration-300 relative">
      <input
        type="file"
        accept="application/pdf"
        onChange={onFileChange}
        className="hidden"
        ref={fileInputRef}
      />
      
      {/* Toolbar - Only show when file exists */}
      {file && (
      <div className="h-16 bg-white dark:bg-black border-b border-slate-200 dark:border-neutral-800 flex items-center justify-between px-4 shadow-sm shrink-0 z-50 transition-colors duration-300 relative">
        
        {/* Left Group: Upload & Tools */}
        <div className="flex items-center gap-4">
           {/* Upload Button */}
           <div className="relative" ref={uploadMenuRef}>
             <Button 
               variant="secondary" 
               size="sm" 
               className="gap-2 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-800 dark:hover:bg-neutral-800"
               onClick={(e) => { e.stopPropagation(); setIsUploadMenuOpen(!isUploadMenuOpen); }}
             >
               <FileUp size={16} />
               {file ? 'PDF' : 'Upload'}
               <ChevronDown size={14} className={`transition-transform ${isUploadMenuOpen ? 'rotate-180' : ''}`} />
             </Button>

             {isUploadMenuOpen && (
               <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-slate-200 dark:border-neutral-700 p-2 z-50 animate-in fade-in slide-in-from-top-2">
                 {!showUrlInput ? (
                   <div className="flex flex-col gap-1">
                     <button 
                       onClick={() => fileInputRef.current?.click()}
                       className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors text-left group"
                     >
                       <div className="bg-blue-50 dark:bg-black p-2 rounded-md text-blue-600 dark:text-blue-400 group-hover:bg-white dark:group-hover:bg-neutral-700 transition-colors">
                         <UploadCloud size={18} />
                       </div>
                       <div>
                         <span className="block text-sm font-medium text-slate-700 dark:text-neutral-200">Upload File</span>
                         <span className="block text-xs text-slate-500 dark:text-neutral-400">From your computer</span>
                       </div>
                     </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowUrlInput(true); }}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors text-left group"
                      >
                        <div className="bg-purple-50 dark:bg-black p-2 rounded-md text-purple-600 dark:text-purple-400 group-hover:bg-white dark:group-hover:bg-neutral-700 transition-colors">
                          <LinkIcon size={18} />
                        </div>
                        <div>
                          <span className="block text-sm font-medium text-slate-700 dark:text-neutral-200">From URL</span>
                          <span className="block text-xs text-slate-500 dark:text-neutral-400">Link to a PDF file</span>
                        </div>
                      </button>
                   </div>
                 ) : (
                   <form onSubmit={onUrlSubmit} className="p-2">
                     <label className="block text-xs font-medium text-slate-700 dark:text-neutral-300 mb-1.5">Enter PDF URL</label>
                     <input 
                       type="url" 
                       autoFocus
                       placeholder="https://example.com/file.pdf"
                       className="w-full text-sm p-2 rounded-md border border-slate-300 dark:border-neutral-700 bg-white dark:bg-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none mb-2"
                       value={urlInput}
                       onChange={(e) => setUrlInput(e.target.value)}
                       onClick={(e) => e.stopPropagation()}
                     />
                     <div className="flex gap-2 justify-end">
                       <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); setShowUrlInput(false); }}
                          className="text-xs h-8 dark:text-neutral-400 dark:hover:text-white"
                        >
                         Back
                       </Button>
                       <Button 
                          type="submit" 
                          size="sm"
                          className="text-xs h-8"
                          disabled={!urlInput}
                        >
                         Load
                       </Button>
                     </div>
                   </form>
                 )}
               </div>
             )}
           </div>
           
           <div className="h-6 w-px bg-slate-300 dark:bg-neutral-800"></div>
              
           {/* Fit Width Toggle */}
           <button
             onClick={() => setFitToWidth(!fitToWidth)}
             className={`p-2 rounded-lg transition-colors ${fitToWidth ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
             title="Fit to Width"
           >
             <Maximize size={18} />
           </button>

           {/* Annotate Toggle */}
           <button
             onClick={() => setIsDrawingMode(!isDrawingMode)}
             className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${isDrawingMode ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300' : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
             title="Annotate"
           >
             <PenTool size={18} />
             {isDrawingMode && <span className="text-xs font-medium hidden md:block">Drawing</span>}
           </button>

           {/* Color Palette (Visible only when drawing) */}
           {isDrawingMode && (
             <div className={`
                 bg-white dark:bg-neutral-900 p-2 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-xl
                 flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4
                 absolute top-20 left-4 right-4 md:static md:top-auto md:left-auto md:right-auto md:w-auto md:shadow-none md:border-none md:p-1 md:bg-slate-100 md:dark:bg-neutral-900 md:rounded-lg
             `}>
               <div className="flex items-center gap-2 md:gap-1 flex-1 md:flex-none justify-center">
                 {COLORS.map(c => (
                     <button
                     key={c.id}
                     onClick={() => setPenColor(c.value)}
                     className={`w-6 h-6 md:w-5 md:h-5 rounded-full border-2 transition-transform hover:scale-110 ${penColor === c.value ? 'border-slate-600 dark:border-white scale-110' : 'border-transparent'}`}
                     style={{ backgroundColor: c.value }}
                     title={c.id}
                     />
                 ))}
               </div>
               
               <div className="w-px h-6 md:h-4 bg-slate-300 dark:bg-neutral-700 mx-1"></div>
               
               <div className="flex items-center gap-2 md:gap-1">
                 {/* Eraser Tool */}
                 <button
                     onClick={() => setPenColor('eraser')}
                     className={`p-2 md:p-1.5 rounded-md transition-colors ${penColor === 'eraser' ? 'bg-slate-200 dark:bg-neutral-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                     title="Eraser"
                 >
                     <Eraser size={18} className="md:w-4 md:h-4" />
                 </button>

                 {/* Undo / Redo */}
                 <button 
                     onClick={undo}
                     disabled={!(history[activePage] && history[activePage].length > 0)}
                     className="p-2 md:p-1.5 text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white disabled:opacity-30"
                     title="Undo"
                 >
                     <RotateCcw size={18} className="md:w-4 md:h-4" />
                 </button>
                 <button 
                     onClick={redo}
                     disabled={!(future[activePage] && future[activePage].length > 0)}
                     className="p-2 md:p-1.5 text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white disabled:opacity-30"
                     title="Redo"
                 >
                     <RotateCw size={18} className="md:w-4 md:h-4" />
                 </button>

                 {/* Clear Page Button */}
                 <button 
                     onClick={clearPageDrawings}
                     className="p-2 md:p-1.5 text-slate-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400"
                     title="Clear All Drawings on Page"
                 >
                     <Trash2 size={18} className="md:w-4 md:h-4" />
                 </button>
               </div>
               
               {/* Close/Done Button (Mobile Only) */}
               <div className="md:hidden ml-auto border-l border-slate-200 dark:border-neutral-700 pl-2">
                  <button
                     onClick={() => setIsDrawingMode(false)}
                     className="p-2 text-blue-600 dark:text-blue-400 font-medium text-xs flex items-center gap-1"
                  >
                     <Check size={16} /> Done
                  </button>
               </div>

             </div>
           )}
        </div>

        {/* Middle Group: Pagination (only if file loaded) */}
        {file && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex items-center gap-2">
            <button onClick={() => scrollToPage(activePage - 1)} disabled={activePage <= 1} className="p-1.5 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 rounded-full disabled:opacity-30 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-medium text-slate-600 dark:text-neutral-400 min-w-[60px] text-center">
              {activePage} / {numPages}
            </span>
            <button onClick={() => scrollToPage(activePage + 1)} disabled={activePage >= numPages} className="p-1.5 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 rounded-full disabled:opacity-30 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Right Group: View Controls */}
        <div className="flex items-center gap-2">
          {file && (
             <div className="flex items-center gap-1 mr-2">
               <button 
                 onClick={() => setStudyMode(StudyMode.READ)}
                 className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                   studyMode === StudyMode.READ 
                    ? 'bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white' 
                    : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700'
                 }`}
               >
                 Read
               </button>
               <button 
                 onClick={() => setStudyMode(StudyMode.STUDY)}
                 className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                   studyMode === StudyMode.STUDY 
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                    : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700'
                 }`}
               >
                 Study
               </button>
             </div>
          )}

          {/* Desktop Zoom Controls - Hidden on Tablet/Mobile (xl breakpoint) */}
          <div className="hidden xl:flex items-center gap-1 bg-slate-100 dark:bg-neutral-900 rounded-lg p-0.5">
            <button onClick={() => { setFitToWidth(false); setScale(s => Math.max(0.5, s - 0.1)); }} className="p-1.5 text-slate-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-black rounded-md transition-colors">
              <ZoomOut size={14} />
            </button>
            <span className="text-[10px] font-medium text-slate-500 dark:text-neutral-400 w-8 text-center">
              {fitToWidth ? 'Fit' : `${Math.round(scale * 100)}%`}
            </span>
            <button onClick={() => { setFitToWidth(false); setScale(s => Math.min(2.0, s + 0.1)); }} className="p-1.5 text-slate-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-black rounded-md transition-colors">
              <ZoomIn size={14} />
            </button>
          </div>
          
          <div className="h-6 w-px bg-slate-300 dark:bg-neutral-800 mx-1"></div>
          
          <button 
            onClick={toggleTheme}
            className="p-2 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 rounded-full transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {file && (
              <Button 
                onClick={() => analyzePage(activePage)} 
                isLoading={analyzingPages.has(activePage)}
                className="ml-2 gap-2 hidden sm:flex"
                disabled={!!annotations[activePage]}
                variant={annotations[activePage] ? "secondary" : "primary"}
                size="sm"
              >
                <ScanSearch size={14} />
                {annotations[activePage] ? 'Done' : 'Analyze'}
              </Button>
          )}
        </div>
      </div>
      )}

      {/* Floating Zoom Control (Mobile/Tablet - Visible up to xl breakpoint) */}
      {file && (
        <div className={`fixed bottom-6 right-6 z-50 xl:hidden flex flex-col items-center bg-white dark:bg-neutral-900 rounded-full shadow-xl border border-slate-200 dark:border-neutral-800 transition-all duration-300 overflow-hidden ${isZoomControlExpanded ? 'h-32 py-2 w-12' : 'h-12 w-12 justify-center'}`}>
             {!isZoomControlExpanded ? (
                 <button 
                    onClick={() => setIsZoomControlExpanded(true)}
                    className="w-full h-full flex items-center justify-center text-slate-600 dark:text-neutral-400"
                 >
                    <span className="text-xs font-bold">{Math.round(scale * 100)}</span>
                 </button>
             ) : (
                 <div className="flex flex-col items-center gap-2 h-full justify-between">
                     <button 
                        onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(2.0, s + 0.1)); }}
                        className="p-1 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-full"
                     >
                         <ZoomIn size={16} />
                     </button>
                     <button 
                        onClick={() => setIsZoomControlExpanded(false)}
                        className="text-[10px] font-bold text-slate-500 dark:text-neutral-500"
                     >
                         {Math.round(scale * 100)}%
                     </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.1)); }}
                        className="p-1 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-full"
                     >
                         <ZoomOut size={16} />
                     </button>
                 </div>
             )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {!file ? (
             <div 
               className="flex flex-col items-center justify-center w-full h-full bg-slate-50 dark:bg-black p-4 relative"
               onDragOver={(e) => e.preventDefault()}
               onDrop={onDrop}
             >
                <div className="mb-12 text-center">
                  <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 tracking-tight mb-4">
                    Pondera
                  </h1>
                  <p className="text-lg text-slate-500 dark:text-slate-400">The smart way to read and understand complex papers.</p>
                </div>

                <h2 className="text-xl font-medium text-slate-700 dark:text-slate-300 mb-6">Drop a research paper to read</h2>
                
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full max-w-[600px] h-48 border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors group z-10"
                >
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-100 dark:bg-neutral-800 rounded-full text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                        <UploadCloud size={32} />
                      </div>
                      <span className="text-sm text-slate-500 dark:text-neutral-400 font-medium">click to upload pdf</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-8 text-center">
                    <p className="text-sm font-medium text-slate-400 dark:text-neutral-500">
                        # Powered by Gemini 3.0 and Nano Banana Pro
                    </p>
                </div>
            </div>
        ) : (
        <div 
            className="flex-1 overflow-auto bg-slate-100 dark:bg-black relative p-4 md:p-8 transition-colors duration-300 scroll-smooth" 
            ref={containerRef}
        >
          {file && (
            <div className="flex flex-col items-center gap-8 min-h-full pb-20">
              <Document
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<div className="p-10 text-slate-400">Loading PDF...</div>}
                className="flex flex-col gap-8"
                error={<div className="p-10 text-red-500 bg-white rounded-lg shadow">Failed to load PDF. <br/><span className="text-xs text-slate-500 mt-2 block">If using a URL, ensure CORS is enabled on the server.</span></div>}
              >
                {Array.from(new Array(numPages), (_, index) => {
                    const pageNum = index + 1;
                    const currentAnnotations = annotations[pageNum] || [];
                    const isAnalyzing = analyzingPages.has(pageNum);

                    return (
                        <div 
                            key={`page_${pageNum}`}
                            ref={(el) => { pageRefs.current[pageNum] = el; }}
                            data-page-number={pageNum}
                            className="relative shadow-lg transition-all duration-300 group"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <Page 
                                pageNumber={pageNum} 
                                scale={fitToWidth ? undefined : scale}
                                width={fitToWidth ? containerWidth : undefined}
                                renderTextLayer={false} 
                                renderAnnotationLayer={false}
                                className="bg-white"
                                loading={
                                    <div className="h-[800px] w-[600px] bg-white flex items-center justify-center text-slate-300">
                                        Loading Page {pageNum}...
                                    </div>
                                }
                            />
                            
                            {/* Drawing Layer */}
                            <DrawingCanvas 
                              pageNum={pageNum}
                              isDrawingMode={isDrawingMode}
                              drawings={drawings[pageNum] || []}
                              currentPath={currentPath}
                              isDrawingCurrent={currentPath.length > 0} // simplistic check, ideally we check if mouse is over this specific canvas
                              renderDrawings={renderDrawings}
                              onMouseDown={handleMouseDown}
                              onMouseMove={handleMouseMove}
                              onMouseUp={handleEnd}
                              onTouchStart={handleTouchStart}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleEnd}
                              penColor={penColor} // passed to force re-render if color changes (though logic is in main comp)
                            />

                            {/* Page Info Badge */}
                            <div className="absolute -left-10 top-0 text-xs font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hidden xl:block">
                                Page {pageNum}
                            </div>

                            {/* Loading Overlay */}
                            {isAnalyzing && (
                                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-20 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                                    <div className="bg-white dark:bg-neutral-900 px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
                                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                        <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">Analyzing...</span>
                                    </div>
                                </div>
                            )}

                            {/* Annotations */}
                            {studyMode === StudyMode.STUDY && currentAnnotations.map((anno, idx) => {
                                const isActive = activeAnnotationId === anno.id;
                                const Icon = getIcon(anno.type);
                                
                                return (
                                <div
                                    key={anno.id}
                                    className="absolute right-0 transform translate-x-1/2 z-30 flex flex-col items-start"
                                    style={{ top: `${anno.verticalPosition}%` }}
                                >
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveAnnotationId(isActive ? undefined : anno.id);
                                            }}
                                            className={`
                                                flex items-center justify-center w-8 h-8 rounded-full shadow-lg transition-all duration-300
                                                ${isActive 
                                                    ? 'bg-blue-600 text-white scale-110 ring-4 ring-blue-100 dark:ring-blue-900' 
                                                    : 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-neutral-700 hover:scale-110'
                                                }
                                            `}
                                            title={anno.title}
                                        >
                                            {isActive ? <X size={14} /> : <span className="text-xs font-bold">{idx + 1}</span>}
                                        </button>

                                        {isActive && (
                                            <div 
                                                className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-72 md:w-80 bg-white dark:bg-neutral-900 p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-800 animate-in fade-in zoom-in-95 slide-in-from-right-2 origin-right z-40 text-left cursor-auto"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-neutral-900 border-t border-r border-slate-200 dark:border-neutral-800 transform rotate-45"></div>
                                                <div className="flex items-start gap-3 mb-2 relative z-10">
                                                    <div className={`p-2 rounded-lg shrink-0 ${anno.type === 'equation' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                                                            <Icon size={16} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-900 dark:text-white leading-tight text-sm">{anno.title}</h4>
                                                        <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-neutral-500 tracking-wider">{anno.type}</span>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-600 dark:text-neutral-300 leading-relaxed relative z-10">
                                                    {anno.description}
                                                </p>
                                            </div>
                                        )}
                                </div>
                                );
                            })}
                        </div>
                    );
                })}
              </Document>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

// Sub-component for the Drawing Canvas Layer
interface DrawingCanvasProps {
  pageNum: number;
  isDrawingMode: boolean;
  drawings: Drawing[];
  currentPath: {x: number, y: number}[];
  isDrawingCurrent: boolean;
  penColor: string;
  renderDrawings: (canvas: HTMLCanvasElement | null, pageNum: number) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>, pageNum: number) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (pageNum: number) => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>, pageNum: number) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (pageNum: number) => void;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  pageNum, isDrawingMode, drawings, currentPath, isDrawingCurrent, renderDrawings, 
  onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove, onTouchEnd, penColor
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Re-render canvas when drawings change or window resizes (handled by parent re-render usually, but we use effect here)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Match parent size
      const parent = canvas.parentElement;
      if (parent) {
         // We need to sync canvas resolution to display size for sharp rendering
         // However, to keep coordinate mapping simple (0-1), we just use clientWidth/Height
         // In a real app, we'd handle DPR.
         const rect = parent.getBoundingClientRect();
         if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
         }
      }
      
      renderDrawings(canvas, pageNum);
      
      // If this canvas is currently being drawn on, render the current path on top
      // Note: This is a simple approach. 
      if (isDrawingCurrent && currentPath.length > 1) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(currentPath[0].x * canvas.width, currentPath[0].y * canvas.height);
          for (let i = 1; i < currentPath.length; i++) {
            ctx.lineTo(currentPath[i].x * canvas.width, currentPath[i].y * canvas.height);
          }
          
          if (penColor === 'eraser') {
             ctx.globalCompositeOperation = 'destination-out';
             ctx.lineWidth = 20;
          } else {
             ctx.globalCompositeOperation = 'source-over';
             ctx.strokeStyle = penColor;
             ctx.lineWidth = 4;
          }

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          
          // Reset
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
  });

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 z-10 touch-none ${isDrawingMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onMouseDown={(e) => onMouseDown(e, pageNum)}
      onMouseMove={onMouseMove}
      onMouseUp={() => onMouseUp(pageNum)}
      onMouseLeave={() => onMouseUp(pageNum)}
      onTouchStart={(e) => onTouchStart(e, pageNum)}
      onTouchMove={onTouchMove}
      onTouchEnd={() => onTouchEnd(pageNum)}
    />
  );
};