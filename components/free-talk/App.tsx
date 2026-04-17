
import React, { useState } from 'react';
import { ChatRoom } from './ChatRoom';
import { PracticeLevel, SessionResult } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'chat' | 'report'>('home');
  const [level, setLevel] = useState<PracticeLevel>(PracticeLevel.INTERMEDIATE);
  const [result, setResult] = useState<SessionResult | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {view === 'home' && (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 space-y-8 animate-in fade-in duration-700">
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-indigo-600">Free Talk AI</h1>
              <p className="text-slate-500">Natural English Conversation Partner</p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">Select Your Level</label>
              <div className="grid grid-cols-3 gap-3">
                {Object.values(PracticeLevel).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`py-3 rounded-xl font-bold transition-all ${
                      level === l ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setView('chat')}
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
            >
              Start Conversation
            </button>
          </div>
        )}

        {view === 'chat' && (
          <ChatRoom
            level={level}
            onComplete={(res) => {
              setResult(res);
              setView('report');
            }}
            onCancel={() => setView('home')}
          />
        )}

        {view === 'report' && result && (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 space-y-8 animate-in zoom-in duration-500">
            <h2 className="text-3xl font-black text-indigo-600 text-center">Session Report</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-indigo-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-indigo-400 uppercase">CEFR Level</span>
                <p className="text-3xl font-black text-indigo-700">{result.cefr}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-emerald-400 uppercase">Pronunciation</span>
                <p className="text-3xl font-black text-emerald-700">{result.pronunciationScore}%</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 border-b pb-2">Corrections & Suggestions</h3>
              <ul className="space-y-2">
                {result.mistakes.map((m, i) => (
                  <li key={i} className="text-sm bg-slate-50 p-3 rounded-lg border-l-4 border-indigo-400">{m}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setView('home')}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
            >
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
