import React, { useState, useEffect } from 'react';
import { PdfViewer } from './components/PdfAnnotator/PdfViewer';
import { ChatSidebar } from './components/SidebarAssistant/ChatSidebar';
import { Bot } from 'lucide-react';

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  // Apply dark mode class to the HTML element for global consistency
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-50 dark:bg-black transition-colors duration-300 relative">
      
      {/* Floating Assistant Toggle Button */}
      <button
        onClick={toggleSidebar}
        className={`
          fixed bottom-6 left-6 z-[60] p-4 rounded-full shadow-xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-4
          ${isSidebarOpen 
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
            : 'bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:scale-105'
          }
        `}
        title={isSidebarOpen ? "Close Assistant" : "Open Assistant"}
      >
        <Bot size={24} />
      </button>

      {/* Content Area */}
      <div className={`flex-1 h-full overflow-hidden relative transition-all duration-300 ease-in-out ${isSidebarOpen ? 'mr-96' : 'mr-0'}`}>
        <PdfViewer isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
      </div>

      {/* Right Sidebar (Assistant) */}
      <ChatSidebar 
        isOpen={isSidebarOpen} 
        toggle={toggleSidebar} 
        isDarkMode={isDarkMode} 
      />
      
    </div>
  );
};

export default App;