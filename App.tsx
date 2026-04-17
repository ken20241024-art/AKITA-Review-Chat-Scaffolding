
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Home } from './components/Home';
import { ChatRoom } from './components/ChatRoom';
import { AnalysisReportView } from './components/AnalysisReportView';
import { AdminDashboard } from './components/AdminDashboard';
import { AppMode, PracticeLevel, SessionResult, TeacherTask } from './types';
import { fetchGlobalTask } from './services/integration';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'chat' | 'report' | 'admin'>('home');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<AppMode>(AppMode.TEACHER_TASK);
  const [level, setLevel] = useState<PracticeLevel>(PracticeLevel.BEGINNER);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selfStudyText, setSelfStudyText] = useState<string>(''); 
  const [currentResult, setCurrentResult] = useState<SessionResult | null>(null);
  const [teacherTask, setTeacherTask] = useState<TeacherTask | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReadingPdf, setIsReadingPdf] = useState(false);

  useEffect(() => {
    const syncTask = async () => {
      setIsSyncing(true);
      const remoteTask = await fetchGlobalTask();
      if (remoteTask) {
        setTeacherTask(remoteTask);
        localStorage.setItem('akita_teacher_task', JSON.stringify(remoteTask));
      } else {
        const savedTask = localStorage.getItem('akita_teacher_task');
        if (savedTask) setTeacherTask(JSON.parse(savedTask));
      }
      setIsSyncing(false);
    };
    syncTask();
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const handleStart = async () => {
    if (!email || !email.includes('@akita-pu.ac.jp')) {
      alert('Error: Please enter a valid @akita-pu.ac.jp email address.');
      return;
    }

    if (mode === AppMode.SELF_STUDY) {
      if (!uploadedFile) {
        alert('Please upload a PDF for self-study.');
        return;
      }
      
      setIsReadingPdf(true);
      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("Gemini API Key is missing. Please check your environment settings (VITE_GEMINI_API_KEY).");
        }

        const ai = new GoogleGenAI({ apiKey });
        const base64 = await fileToBase64(uploadedFile);
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64, mimeType: "application/pdf" } },
              { text: "Extract all detailed academic information from this PDF. Focus on key arguments, data, and terminology. This will be used for a professional Socratic discussion." }
            ]
          }
        });
        
        setSelfStudyText(response.text || '');
        setView('chat');
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Failed to analyze the PDF. Please ensure it is a valid text-based PDF.');
      } finally {
        setIsReadingPdf(false);
      }
    } else {
      if (!teacherTask) {
        alert('Synchronizing teacher task... Please wait.');
        return;
      }
      setView('chat');
    }
  };

  return (
    <Layout isAdmin={view === 'admin'} onToggleAdmin={() => setView(view === 'admin' ? 'home' : 'admin')}>
      {view === 'home' && (
        <Home
          email={email}
          setEmail={setEmail}
          mode={mode}
          setMode={setMode}
          level={level}
          setLevel={setLevel}
          uploadedFile={uploadedFile}
          onFileChange={setUploadedFile}
          onStart={handleStart}
          teacherTask={teacherTask}
          isSyncing={isSyncing || isReadingPdf}
        />
      )}
      {view === 'chat' && (
        <ChatRoom
          email={email}
          mode={mode}
          level={mode === AppMode.TEACHER_TASK ? teacherTask!.level : level}
          file={mode === AppMode.SELF_STUDY ? uploadedFile : null}
          selfStudyText={selfStudyText}
          teacherTask={mode === AppMode.TEACHER_TASK ? teacherTask : null}
          onComplete={handleSessionEnd}
          onCancel={() => setView('home')}
        />
      )}
      {view === 'report' && currentResult && (
        <AnalysisReportView 
          result={currentResult} 
          onBack={() => setView('home')} 
        />
      )}
      {view === 'admin' && (
        <AdminDashboard 
          onSaveTask={(task) => {
            setTeacherTask(task);
            localStorage.setItem('akita_teacher_task', JSON.stringify(task));
            setView('home');
          }}
          onBack={() => setView('home')}
        />
      )}
    </Layout>
  );

  function handleSessionEnd(result: SessionResult) {
    setCurrentResult(result);
    
    // Create a lean version of the history to avoid QuotaExceededError
    const leanResult = { ...result };
    delete leanResult.audioBase64; // Remove heavy audio data from local history

    try {
      const history = JSON.parse(localStorage.getItem('akita_session_history') || '[]');
      history.push(leanResult);
      // Keep only last 20 records to save space
      const trimmedHistory = history.slice(-20);
      localStorage.setItem('akita_session_history', JSON.stringify(trimmedHistory));
    } catch (e) {
      console.warn("Could not save to local history (Storage Full)", e);
    }
    
    setView('report');
  }
};

export default App;
