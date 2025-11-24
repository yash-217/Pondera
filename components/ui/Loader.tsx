import React from 'react';

export const Loader: React.FC<{ text?: string }> = ({ text = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center p-8 text-slate-500">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
    <p className="text-sm font-medium animate-pulse">{text}</p>
  </div>
);