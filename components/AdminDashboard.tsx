
import React, { useState, useEffect } from 'react';
import { PracticeLevel, TeacherTask, SessionResult } from '../types';
import { updateGlobalTask, getUrlSource, getSpreadsheetId, getAudioFolderId } from '../services/integration';
import { GoogleGenAI } from "@google/genai";

interface AdminDashboardProps {
  onSaveTask: (task: TeacherTask) => void;
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSaveTask, onBack }) => {
  const [level, setLevel] = useState<PracticeLevel>(PracticeLevel.INTERMEDIATE);
  const [pdfName, setPdfName] = useState('');
  const [taskContext, setTaskContext] = useState('');
  const [gasUrl, setGasUrl] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState(getSpreadsheetId());
  const [audioFolderId, setAudioFolderId] = useState(getAudioFolderId());
  const [activeSource, setActiveSource] = useState<'MANUAL' | 'GLOBAL_CODE' | 'ENV' | 'NONE'>('NONE');
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    const manualUrl = localStorage.getItem('akita_gas_url');
    setGasUrl(manualUrl || '');
    
    const savedSsId = localStorage.getItem('akita_spreadsheet_id');
    if (savedSsId) setSpreadsheetId(savedSsId);
    
    const savedAudioId = localStorage.getItem('akita_audio_folder_id');
    if (savedAudioId) setAudioFolderId(savedAudioId);
    
    setActiveSource(getUrlSource());
  }, []);

  const handleSsIdChange = (val: string) => {
    setSpreadsheetId(val);
    localStorage.setItem('akita_spreadsheet_id', val);
  };

  const handleAudioIdChange = (val: string) => {
    setAudioFolderId(val);
    localStorage.setItem('akita_audio_folder_id', val);
  };

  const handleGasUrlChange = (val: string) => {
    const url = val.trim();
    setGasUrl(url);
    if (url) localStorage.setItem('akita_gas_url', url);
    else localStorage.removeItem('akita_gas_url');
    setActiveSource(getUrlSource());
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfName(file.name);
    setIsExtracting(true);

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please check your environment settings (VITE_GEMINI_API_KEY).");
      }

      const ai = new GoogleGenAI({ apiKey });

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
              parts: [
                { inlineData: { data: base64, mimeType: "application/pdf" } },
                { text: "Extract the FULL TEXT content from this academic PDF for Socratic discussion. Return only the extracted text." }
              ]
            }
          });

          const text = response.text;
          
          if (text) {
            setTaskContext(text.trim());
          }
        } catch (err) {
          console.error("Extraction error inside reader:", err);
          alert("Failed to extract text from PDF. Please check your API key and network.");
        } finally {
          setIsExtracting(false);
        }
      };
    } catch (err) {
      console.error(err);
      setIsExtracting(false);
      alert(err instanceof Error ? err.message : "Extraction failed.");
    }
  };

  const saveTask = async () => {
    if (!pdfName || !taskContext) return alert('Required fields are missing.');
    setIsSaving(true);
    const newTask: TeacherTask = { pdfName, pdfContent: taskContext, level, updatedAt: new Date().toISOString() };
    const success = await updateGlobalTask(newTask);
    if (success) {
      onSaveTask(newTask);
      alert('Global Task synced.');
    } else {
      alert('Sync failed.');
    }
    setIsSaving(false);
  };

  const gasCode = `/**
 * Google Apps Script for AKITA Review Chat mkII
 * [v2.2 - Unified Log & ID Configuration]
 */
const SPREADSHEET_ID = "${spreadsheetId}";
const AUDIO_FOLDER_ID = "${audioFolderId}";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (e && e.parameter.action === 'get_task') {
      const sheet = ss.getSheetByName('Config') || ss.insertSheet('Config');
      return ContentService.createTextOutput(sheet.getRange(1, 1).getValue() || "null").setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("System Online (" + SPREADSHEET_ID + ")");
  } catch(e) {
    return ContentService.createTextOutput("Error: " + e.toString());
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const data = payload.data;

    if (action === 'save_session') {
      // --- DUPLICATE CHECK ---
      const cache = CacheService.getScriptCache();
      const lockKey = "lock_" + (data.sessionId || "nosession");
      if (cache.get(lockKey)) {
        return ContentService.createTextOutput(JSON.stringify({status: 'duplicate'})).setMimeType(ContentService.MimeType.JSON);
      }
      cache.put(lockKey, "true", 300);

      // --- SPREADSHEET RECORDING (Per-Day Sheet) ---
      const today = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd");
      let sheet = ss.getSheetByName(today) || ss.insertSheet(today);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Email", "Mode", "Level", "CEFR", "Word Count", "Vocab", "Score", "Mistakes", "Advice", "Script", "Session ID"]);
        sheet.getRange(1, 1, 1, 12).setFontWeight("bold").setBackground("#EFEFEF");
      }
      sheet.appendRow([
        data.timestamp, data.email, data.mode, data.level, data.cefr, 
        data.wordCount, data.vocabComplexity, data.pronunciationScore + "/100", 
        data.mistakes, data.advice, data.script, data.sessionId
      ]);

      // --- AUDIO STORAGE ---
      if (data.audioBase64) {
        try {
          const folder = DriveApp.getFolderById(AUDIO_FOLDER_ID);
          const fileName = "AKITA_" + data.email.split('@')[0] + "_" + (data.timestamp || "").replace(/[:\\/]/g, "-") + ".wav";
          folder.createFile(Utilities.newBlob(Utilities.base64Decode(data.audioBase64), 'audio/wav', fileName));
        } catch (err) { console.log("Audio Storage Error: " + err.toString()); }
      }

      // --- EMAIL NOTIFICATION ---
      try {
        let body = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n";
        body += "   AKITA Review Chat mkII - Diagnostic Report\\n";
        body += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n";
        body += "【学生情報】\\n";
        body += "メールアドレス: " + data.email + "\\n";
        body += "実施日時:       " + data.timestamp + "\\n";
        body += "練習ティア:     " + data.level + " (" + data.mode + ")\\n\\n";
        
        body += "【セッション指標】\\n";
        body += "------------------------------------------------------\\n";
        body += "■ 推定CEFRレベル:  " + data.cefr + "\\n";
        body += "■ 発話総語数:      " + data.wordCount + " words\\n";
        body += "■ 推定発音スコア:  " + data.pronunciationScore + "/100\\n";
        body += "■ 語彙レベル:      " + data.vocabComplexity + "\\n\\n";
        
        body += "【添削と修正案】\\n";
        body += "------------------------------------------------------\\n";
        body += (data.mistakes ? data.mistakes.split('; ').join('\\n・') : "重大な間違いは見つかりませんでした。") + "\\n\\n";
        
        body += "【AIからのアドバイス】\\n";
        body += "------------------------------------------------------\\n";
        body += (data.advice || "継続して練習しましょう。") + "\\n\\n";
        
        body += "【会話の記録 (AI / STU)】\\n";
        body += "------------------------------------------------------\\n";
        body += data.script + "\\n\\n";
        
        body += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n";
        body += " Akita Provincial University - Academic Systems\\n";
        body += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
        
        MailApp.sendEmail({
          to: data.email,
          subject: "[AKITA] Review Feedback: Proficiency Analysis Complete",
          body: body
        });
      } catch (err) { console.log("Email Delivery Error: " + err.toString()); }

      return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'save_task') {
      const sheet = ss.getSheetByName('Config') || ss.insertSheet('Config');
      sheet.getRange(1, 1).setValue(JSON.stringify(data));
      return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({status: 'unknown'})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
`;

  return (
    <div className="space-y-10 animate-fadeIn relative z-10">
      <div className="flex justify-between items-end border-b border-[#A67C52]/10 pb-6">
        <div>
          <h2 className="text-4xl font-bold title-serif text-[#A67C52] uppercase tracking-widest">Admin Registry</h2>
          <p className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-[0.5em] mt-2">Central Management Console</p>
        </div>
        <button onClick={onBack} className="text-[10px] font-bold text-[#A67C52] uppercase tracking-widest border border-[#A67C52] px-4 py-1 rounded-full hover:bg-[#A67C52] hover:text-white transition-all">Exit Dashboard</button>
      </div>

      <div className="grid md:grid-cols-2 gap-10">
        <div className="space-y-10">
          <div className="deco-panel p-10 bg-[#A67C52] text-white corner-stepped">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-8 flex items-center">
              <span className="w-1.5 h-6 bg-white mr-3"></span> Registry Link
            </h3>
            <div className="space-y-4">
               <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Active Apps Script URL</label>
               <input 
                 type="text" 
                 value={gasUrl}
                 onChange={(e) => handleGasUrlChange(e.target.value)}
                 placeholder="Paste Web App URL here..."
                 className="w-full p-4 border border-white/10 bg-white/5 outline-none font-mono text-[10px] text-white rounded-xl"
               />
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[8px] font-bold text-white/40 uppercase">Spreadsheet ID</label>
                   <input 
                     type="text" 
                     value={spreadsheetId}
                     onChange={(e) => handleSsIdChange(e.target.value)}
                     className="w-full p-3 border border-white/10 bg-white/5 outline-none font-mono text-[9px] text-white rounded-lg"
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[8px] font-bold text-white/40 uppercase">Audio Folder ID</label>
                   <input 
                     type="text" 
                     value={audioFolderId}
                     onChange={(e) => handleAudioIdChange(e.target.value)}
                     className="w-full p-3 border border-white/10 bg-white/5 outline-none font-mono text-[9px] text-white rounded-lg"
                   />
                 </div>
               </div>
               
               <p className="text-[8px] text-[#D4AF37] uppercase opacity-70">Update the IDs above before copying the script.</p>
            </div>
          </div>

          <div className="deco-panel p-10 space-y-8 corner-stepped">
            <h3 className="text-xs font-bold text-[#A67C52] uppercase tracking-[0.2em] flex items-center">
              <span className="w-1.5 h-6 bg-[#D4AF37] mr-3"></span> Task Orchestrator
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Difficulty Tier</label>
                <select value={level} onChange={(e) => setLevel(e.target.value as PracticeLevel)} className="w-full p-4 border border-slate-200 font-bold text-sm bg-white rounded-xl">
                  {Object.values(PracticeLevel).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PDF Source</label>
                <input type="file" accept=".pdf" onChange={handleUpload} className="block w-full text-[10px] text-slate-500 file:mr-4 file:py-2 file:px-4 file:border file:border-[#A67C52] file:text-[9px] file:font-bold file:bg-[#A67C52] file:text-white"/>
              </div>
              <textarea 
                value={taskContext} 
                onChange={(e) => setTaskContext(e.target.value)} 
                placeholder="AI Context..." 
                className="w-full p-4 border border-slate-200 h-64 text-sm outline-none focus:border-[#D4AF37] bg-white leading-relaxed font-medium rounded-2xl"
              />
              <button onClick={saveTask} disabled={isSaving || isExtracting} className="w-full py-5 button-deco-primary disabled:opacity-50">
                Sync Task
              </button>
            </div>
            
            <div className="p-8 corner-stepped mt-12 bg-blue-50/50 border-blue-200">
              <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-4">Vercel 連携ガイド (Vercel Guide)</h4>
              <div className="space-y-4 text-[10px] text-blue-700 leading-relaxed font-medium">
                <p>
                  Vercelでメール・シート連携を有効にするには、
                  Vercelのプロジェクト設定で以下の変数を追加してください：
                </p>
                <div className="bg-white/50 p-4 space-y-1 border border-blue-100 rounded font-mono">
                  <div>VITE_GAS_APP_URL</div>
                  <div>VITE_SPREADSHEET_ID</div>
                  <div>VITE_GEMINI_API_KEY</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="deco-panel p-10 corner-stepped bg-white/50 flex flex-col">
          <h3 className="text-xs font-bold text-[#A67C52] uppercase tracking-[0.2em] mb-6 flex items-center">
            <span className="w-1.5 h-6 bg-[#A67C52] mr-3"></span> GAS Script Manifest
          </h3>
          <div className="relative group flex-grow">
            <pre className="bg-[#A67C52] text-white p-6 rounded-[2rem] text-[8px] font-mono overflow-auto h-[500px] leading-relaxed">
              {gasCode}
            </pre>
            <button onClick={() => { navigator.clipboard.writeText(gasCode); alert('GAS Code Copied!'); }} className="absolute top-4 right-4 bg-[#D4AF37] text-[#A67C52] px-4 py-2 text-[10px] font-bold shadow-xl rounded-full">COPY TO CLIPBOARD</button>
          </div>
        </div>
      </div>
    </div>
  );
};
