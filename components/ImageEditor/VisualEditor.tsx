import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Wand2, Download, Upload, X, Moon, Sun } from 'lucide-react';
import { Button } from '../ui/Button';
import { editImageWithGemini } from '../../services/geminiService';

interface VisualEditorProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const VisualEditor: React.FC<VisualEditorProps> = ({ isDarkMode, toggleTheme }) => {
  const [image, setImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResultImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!image || !prompt) return;
    
    setIsLoading(true);
    try {
      // Extract base64 data
      const base64Data = image.split(',')[1];
      const mimeType = image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || 'image/png';
      
      const resultBase64 = await editImageWithGemini(base64Data, prompt, mimeType);
      
      if (resultBase64) {
        setResultImage(`data:image/png;base64,${resultBase64}`);
      } else {
        alert("Failed to generate image. Please try a different prompt.");
      }
    } catch (error) {
      console.error(error);
      alert("Error processing image.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImage = () => {
    if (resultImage) {
      const link = document.createElement('a');
      link.href = resultImage;
      link.download = `gemini-edit-${Date.now()}.png`;
      link.click();
    }
  };

  return (
    <div className={`flex flex-col h-full transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-hidden">
        
        {/* Editor Panel */}
        <div className={`w-full md:w-1/3 rounded-2xl p-6 flex flex-col shadow-xl border transition-all ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-200'}`}>
          <div className="mb-6 flex justify-between items-start">
            <div>
                <h2 className={`text-2xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                <Wand2 className="w-6 h-6" />
                Magic Editor
                </h2>
                <p className={`text-sm mt-2 ${isDarkMode ? 'text-neutral-400' : 'text-slate-500'}`}>
                Use natural language to edit images with Gemini 2.5.
                </p>
            </div>
            <button 
                onClick={toggleTheme}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-neutral-400 hover:bg-neutral-800' : 'text-slate-500 hover:bg-slate-100'}`}
            >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-4">
             <div 
               onClick={() => !image && fileInputRef.current?.click()}
               className={`
                 relative flex-1 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden group
                 ${image 
                   ? (isDarkMode ? 'border-neutral-700 bg-black' : 'border-slate-300 bg-slate-100')
                   : (isDarkMode ? 'border-neutral-700 hover:border-blue-500 hover:bg-neutral-800' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50 cursor-pointer')
                 }
               `}
             >
                {image ? (
                  <>
                    <img src={image} alt="Original" className="w-full h-full object-contain p-2" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setImage(null); setResultImage(null); }}
                      className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-red-500 rounded-full text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-6">
                    <ImageIcon className={`w-12 h-12 mx-auto mb-3 transition-colors ${isDarkMode ? 'text-neutral-600 group-hover:text-blue-400' : 'text-slate-400 group-hover:text-blue-500'}`} />
                    <p className={`font-medium ${isDarkMode ? 'text-neutral-300' : 'text-slate-600'}`}>Click to upload image</p>
                    <p className="text-xs text-slate-500 mt-1">PNG, JPG supported</p>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                  accept="image/*" 
                />
             </div>

             <div className="space-y-3 mt-auto">
               <label className={`text-sm font-medium ${isDarkMode ? 'text-neutral-300' : 'text-slate-700'}`}>Instructions</label>
               <textarea
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 placeholder="Describe how to transform the image..."
                 className={`w-full rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-24 transition-colors
                    ${isDarkMode ? 'bg-black border-neutral-700 text-white placeholder-neutral-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}
                 `}
               />
               <Button 
                 onClick={handleGenerate}
                 disabled={!image || !prompt}
                 isLoading={isLoading}
                 className="w-full"
               >
                 Generate Edit
               </Button>
             </div>
          </div>
        </div>

        {/* Result View */}
        <div className={`flex-1 rounded-2xl p-1 shadow-xl border relative overflow-hidden flex items-center justify-center transition-all ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-200'}`}>
           {!resultImage ? (
             <div className="text-center p-10 opacity-30">
               {isLoading ? (
                 <div className="animate-pulse flex flex-col items-center">
                    <div className="h-32 w-32 bg-blue-500 rounded-full blur-3xl absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                    <Wand2 className={`w-16 h-16 mb-4 relative z-10 ${isDarkMode ? 'text-white' : 'text-slate-900'}`} />
                    <p className={`text-lg font-medium relative z-10 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Dreaming up pixels...</p>
                 </div>
               ) : (
                 <>
                   <ImageIcon className={`w-24 h-24 mx-auto mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`} />
                   <p className={`text-xl font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Result will appear here</p>
                 </>
               )}
             </div>
           ) : (
             <div className="relative w-full h-full group">
                <img src={resultImage} alt="Result" className="w-full h-full object-contain" />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Button onClick={downloadImage} className="bg-white text-slate-900 hover:bg-slate-200 shadow-xl">
                    <Download size={18} className="mr-2" /> Download
                  </Button>
                </div>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};