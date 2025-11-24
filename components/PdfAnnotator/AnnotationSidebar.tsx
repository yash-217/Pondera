import React from 'react';
import { Annotation } from '../../types';
import { BookOpen, Calculator, Lightbulb } from 'lucide-react';

interface AnnotationSidebarProps {
  annotations: Annotation[];
  isLoading: boolean;
  onAnnotationClick: (id: string) => void;
  activeAnnotationId?: string;
}

export const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({ 
  annotations, 
  isLoading,
  onAnnotationClick,
  activeAnnotationId
}) => {
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mb-4"></div>
        <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">Analyzing Page</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Gemini is identifying complex concepts...</p>
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-500">
        <BookOpen className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">No annotations for this page yet.</p>
        <p className="text-xs mt-2">Click "Analyze Page" to generate study notes.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Study Notes</h3>
      {annotations.sort((a, b) => a.verticalPosition - b.verticalPosition).map((anno) => {
        const Icon = anno.type === 'equation' ? Calculator : anno.type === 'concept' ? Lightbulb : BookOpen;
        const isActive = activeAnnotationId === anno.id;
        
        return (
          <div 
            key={anno.id}
            onClick={() => onAnnotationClick(anno.id)}
            className={`
              group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer
              ${isActive 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-md scale-[1.02]' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-blue-100 dark:hover:border-slate-600 hover:shadow-sm'
              }
            `}
          >
            <div className="flex items-start gap-3 mb-2">
              <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-slate-600 group-hover:text-blue-500 dark:group-hover:text-blue-300'}`}>
                <Icon size={16} />
              </div>
              <div>
                <h4 className={`font-semibold text-sm ${isActive ? 'text-blue-900 dark:text-blue-100' : 'text-slate-800 dark:text-slate-200'}`}>
                  {anno.title}
                </h4>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  {anno.type}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {anno.description}
            </p>
            
            {/* Visual indicator connecting to left side */}
            {isActive && (
              <div className="absolute top-1/2 -left-4 w-4 h-0.5 bg-blue-200 dark:bg-blue-800 hidden md:block"></div>
            )}
          </div>
        );
      })}
    </div>
  );
};