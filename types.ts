
export interface Annotation {
  id: string;
  title: string;
  description: string;
  verticalPosition: number; // 0 to 100 percentage down the page
  type: 'concept' | 'equation' | 'summary';
}

export interface PageAnnotations {
  [pageNumber: number]: Annotation[];
}

export interface Drawing {
  id: string;
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[]; // Normalized 0-1 coordinates
}

export interface PageDrawings {
  [pageNumber: number]: Drawing[];
}

export enum AppMode {
  PDF_ANNOTATOR = 'PDF_ANNOTATOR',
  IMAGE_EDITOR = 'IMAGE_EDITOR',
}

export enum StudyMode {
  READ = 'READ',
  STUDY = 'STUDY',
}

export interface GeminiError {
  message: string;
}
