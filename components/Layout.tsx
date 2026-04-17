
import React, { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, isAdmin, onToggleAdmin }) => {
  const [clickCount, setClickCount] = useState(0);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSecretClick = () => {
    if (isAdmin) return;
    const newCount = clickCount + 1;
    if (newCount >= 5) {
      setShowPasswordPrompt(true);
      setClickCount(0);
    } else {
      setClickCount(newCount);
      const timer = setTimeout(() => setClickCount(0), 3000);
      return () => clearTimeout(timer);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'tama') {
      onToggleAdmin();
      setShowPasswordPrompt(false);
      setPassword('');
      setIsError(false);
    } else {
      setIsError(true);
      setTimeout(() => setIsError(false), 2000);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <header className="bg-[#A67C52] text-white border-b-2 border-[#D4AF37] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 sunburst-bg"></div>
        <div className="max-w-4xl mx-auto px-6 py-10 flex justify-between items-center relative z-10">
          <div className="flex items-center space-x-6">
            <div className="relative">
              <div className="w-16 h-16 border-2 border-[#D4AF37] rounded-full flex items-center justify-center shadow-lg bg-[#A67C52]">
                <span className="text-3xl font-black title-serif italic text-[#D4AF37]">A</span>
              </div>
              <div className="absolute -top-1 -left-1 w-18 h-18 border-t border-l border-[#D4AF37]/50 rounded-tl-xl"></div>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold uppercase title-serif tracking-widest leading-none text-[#E34234]">
                AKITA REVIEW CHAT SCF
              </h1>
              <p className="text-[10px] tracking-[0.6em] uppercase font-bold text-[#C0C0C0] mt-2">Scaffolding AI system</p>
            </div>
          </div>
          
          {isAdmin && (
            <button 
              onClick={onToggleAdmin}
              className="text-[10px] font-black border border-[#D4AF37] px-6 py-2 hover:bg-[#D4AF37] hover:text-[#A67C52] transition-all uppercase tracking-widest rounded-full"
            >
              Exit Dashboard
            </button>
          )}
        </div>
      </header>

      <main className="flex-grow container max-w-4xl mx-auto p-4 md:p-12 relative">
        {children}
      </main>

      <footer className="bg-[#A67C52] border-t-2 border-[#D4AF37] py-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 grid grid-cols-10 pointer-events-none">
          {[...Array(10)].map((_, i) => <div key={i} className="border-r border-[#D4AF37] h-full"></div>)}
        </div>
        <div className="relative z-10">
          <div className="flex justify-center space-x-4 mb-6">
            <div className="w-10 h-0.5 bg-[#D4AF37]"></div>
            <div className="w-1.5 h-1.5 bg-[#D4AF37] rounded-full"></div>
            <div className="w-10 h-0.5 bg-[#D4AF37]"></div>
          </div>
          <p 
            className="text-[#D4AF37] text-[10px] font-bold tracking-[0.4em] uppercase select-none opacity-80"
          >
            <span 
              className="hover:opacity-100 cursor-pointer transition-opacity" 
              onClick={handleSecretClick}
            >
              AKITA-PU
            </span> ACADEMIC SYSTEMS 2025
          </p>
        </div>
      </footer>

      {showPasswordPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#A67C52]/90 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md deco-panel p-10 shadow-2xl corner-stepped">
            <button 
              onClick={() => setShowPasswordPrompt(false)}
              className="absolute top-4 right-4 text-[#A67C52] font-bold text-xs hover:text-[#D4AF37]"
            >
              [CLOSE]
            </button>
            <div className="text-center space-y-8">
              <h3 className="text-2xl font-bold title-serif text-[#A67C52]">Access Required</h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-6">
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="SECURITY KEY"
                  className={`w-full px-4 py-4 border-b-2 text-center font-bold tracking-[0.4em] outline-none transition-all ${
                    isError ? 'border-red-500 bg-red-50' : 'border-[#A67C52] focus:border-[#D4AF37]'
                  }`}
                />
                <button 
                  type="submit"
                  className="w-full py-5 button-deco-primary"
                >
                  Verify
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
