import React, { useState, useRef, useEffect } from 'react';
import { Send, Crop, X, MessageSquare, Bot, User, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { chatWithGemini } from '../../services/geminiService';
import { CaptureOverlay } from './CaptureOverlay';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64
}

interface ChatSidebarProps {
  isOpen: boolean;
  toggle: () => void;
  isDarkMode: boolean;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, toggle, isDarkMode }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'model', text: "Hi! I'm your Gemini study assistant. 🎨 \n\nI can help explain complex topics with colorful analogies. I can even **doodle** illustrations for you—just ask!" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // Full screen capture
  const [isCapturing, setIsCapturing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (text: string, imageBase64?: string) => {
    if (!text.trim() && !imageBase64) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      image: imageBase64
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Destructure the response to get both text and potentially a generated image
      const { text: responseText, image: responseImage } = await chatWithGemini(text, imageBase64);
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        image: responseImage // This will display the generated doodle/illustration
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Sorry, something went wrong. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startCapture = async () => {
    // Close sidebar immediately to give user view of content
    toggle();

    try {
      // Use the Screen Capture API
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "never" } as any, 
        audio: false 
      });
      
      // Create a video element to play the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.play();

      // Wait for the video to load enough data to render a frame
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          resolve();
        };
      });
      
      // Ensure the video has dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
         await new Promise(r => setTimeout(r, 100)); // small delay if dimensions aren't ready
      }

      // Draw the video frame to a canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setCapturedImage(canvas.toDataURL('image/png'));
        setIsCapturing(true);
      }

      // Stop all tracks to release the screen share
      stream.getTracks().forEach(track => track.stop());
      
      // Clean up video element
      video.remove();

    } catch (err) {
      console.error("Error capturing screen:", err);
      // Re-open sidebar if there was an error or user cancelled
      toggle();
      
      // Handle user cancellation or permission denial gracefully
      if (err instanceof Error && err.name !== 'NotAllowedError') {
          alert("Could not capture screen. Please ensure your browser supports screen sharing.");
      }
    }
  };

  const handleCropConfirm = (croppedBase64: string) => {
    setCapturedImage(null);
    setIsCapturing(false);
    
    // Re-open sidebar to show results
    toggle();

    // Automatically analyze the cropped image
    handleSendMessage("Analyze this section of the document:", croppedBase64);
  };

  return (
    <>
      {/* Capture Overlay (Modal) */}
      {isCapturing && capturedImage && (
        <CaptureOverlay 
          imageSrc={capturedImage} 
          onConfirm={handleCropConfirm}
          onCancel={() => { 
            setIsCapturing(false); 
            setCapturedImage(null); 
            toggle(); // Re-open sidebar on cancel
          }}
        />
      )}

      {/* Sidebar Container */}
      <div 
        className={`
          fixed inset-y-0 right-0 z-40 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out border-l
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          ${isDarkMode ? 'bg-black border-neutral-800' : 'bg-white border-slate-200'}
          w-96
        `}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <Bot className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} size={20} />
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Study Assistant</h3>
          </div>
          <button 
            onClick={toggle}
            className={`p-1 rounded-full hover:bg-opacity-10 ${isDarkMode ? 'hover:bg-white text-neutral-400' : 'hover:bg-black text-slate-400'}`}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`
                max-w-[90%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm
                ${msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : (isDarkMode ? 'bg-neutral-900 text-slate-200 rounded-bl-none border border-neutral-800' : 'bg-slate-100 text-slate-800 rounded-bl-none')
                }
              `}>
                {/* Display uploaded or generated image */}
                {msg.image && (
                  <div className="mb-2 overflow-hidden rounded-lg border border-white/20 bg-black/20">
                      <img 
                        src={`data:image/png;base64,${msg.image}`} 
                        alt="Content" 
                        className="w-full h-auto object-contain max-h-60"
                      />
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
              <span className="text-[10px] text-slate-400 px-1 opacity-70">
                {msg.role === 'user' ? 'You' : 'Gemini'}
              </span>
            </div>
          ))}
          {isLoading && (
             <div className="flex items-start gap-2">
               <div className={`p-3 rounded-2xl rounded-bl-none ${isDarkMode ? 'bg-neutral-900' : 'bg-slate-100'}`}>
                 <div className="flex gap-1">
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className={`p-4 border-t shrink-0 flex flex-col gap-3 ${isDarkMode ? 'border-neutral-800 bg-black' : 'border-slate-100 bg-white'}`}>
          {/* Tool Button */}
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={startCapture}
            className={`w-full flex items-center justify-center gap-2 py-3 border-dashed ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
          >
            <Crop size={16} />
            <span>Select Area to Analyze</span>
          </Button>

          {/* Chat Input */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
              placeholder="Ask a question..."
              className={`
                w-full pl-4 pr-12 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all
                ${isDarkMode 
                  ? 'bg-neutral-900 text-white placeholder-neutral-500 border border-neutral-800' 
                  : 'bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200'
                }
              `}
            />
            <button 
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              className={`
                absolute right-2 p-2 rounded-lg transition-colors
                ${inputValue.trim() 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                  : 'bg-transparent text-slate-400 cursor-not-allowed'
                }
              `}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};