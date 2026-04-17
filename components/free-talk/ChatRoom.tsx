
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { PracticeLevel, SessionResult } from './types';
import { analyzeSession } from './gemini';

// Helper for audio encoding/decoding (simplified)
const encode = (buffer: Uint8Array) => btoa(String.fromCharCode(...buffer));
const decode = (base64: string) => new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));

interface ChatRoomProps {
  level: PracticeLevel;
  onComplete: (result: SessionResult) => void;
  onCancel: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ level, onComplete, onCancel }) => {
  const [status, setStatus] = useState('Connecting...');
  const [aiText, setAiText] = useState('');
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const sessionRef = useRef<any>(null);
  const transcriptRef = useRef<string[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    startSession();
    const timer = setInterval(() => setTimeLeft(t => t > 0 ? t - 1 : 0), 1000);
    return () => {
      clearInterval(timer);
      if (sessionRef.current) sessionRef.current.close();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const startSession = async () => {
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey! });
      
      const systemInstruction = `You are a friendly English conversation partner. 
      Keep your responses short (max 2 sentences). 
      Ask interesting follow-up questions about the user's life, hobbies, or opinions.
      Adapt your vocabulary to ${level} level.`;

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          systemInstruction,
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus('Speak Now');
            session.sendRealtimeInput({ text: "Hi there! I'm your English partner. How are you doing today?" });
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              playAudio(msg.serverContent.modelTurn.parts[0].inlineData.data);
            }
            if (msg.serverContent?.outputTranscription) {
              setAiText(prev => prev + msg.serverContent!.outputTranscription!.text);
            }
            if (msg.serverContent?.inputTranscription) {
              const studentText = msg.serverContent.inputTranscription.text;
              if (studentText) transcriptRef.current.push(`STU: ${studentText}`);
            }
            if (msg.serverContent?.turnComplete) {
              if (aiText) transcriptRef.current.push(`AI: ${aiText}`);
              setAiText('');
            }
          }
        }
      });
      sessionRef.current = session;
      setupMic(session);
    } catch (e) {
      console.error(e);
      setStatus('Connection Failed');
    }
  };

  const setupMic = async (session: any) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
      session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  };

  const playAudio = async (base64: string) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    const buffer = await audioCtxRef.current.decodeAudioData(decode(base64).buffer);
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtxRef.current.destination);
    source.start();
  };

  const finish = async () => {
    setStatus('Analyzing...');
    const report = await analyzeSession(transcriptRef.current.join('\n'), level);
    onComplete({
      ...report,
      sessionId: Date.now().toString(),
      timestamp: new Date().toLocaleString(),
      level,
      script: transcriptRef.current.join('\n')
    });
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 space-y-8 text-center">
      <div className="flex justify-between items-center">
        <span className="px-4 py-1 bg-indigo-100 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-widest">{status}</span>
        <span className="font-mono font-bold text-slate-400">{Math.floor(timeLeft/60)}:{timeLeft%60<10?'0':''}{timeLeft%60}</span>
      </div>

      <div className="h-48 flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-6">
        <p className="text-xl font-medium text-slate-700 italic">"{aiText || 'Listening to you...'}"</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
        <button onClick={finish} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700">Finish Session</button>
      </div>
    </div>
  );
};
