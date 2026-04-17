
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AppMode, PracticeLevel, TeacherTask, SessionResult } from '../types';
import { decode, encode, decodeAudioData } from '../utils/audio';
import { analyzeSession } from '../services/gemini';
import { sendSessionToIntegration } from '../services/integration';

interface ChatRoomProps {
  email: string;
  mode: AppMode;
  level: PracticeLevel;
  file: File | null;
  selfStudyText?: string;
  teacherTask: TeacherTask | null;
  onComplete: (result: SessionResult) => void;
  onCancel: () => void;
}

const SESSION_DURATION = 300; 
const MAX_RETRIES = 3;

export const ChatRoom: React.FC<ChatRoomProps> = ({
  email, mode, level, file, selfStudyText, teacherTask, onComplete, onCancel
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);
  const [currentAiText, setCurrentAiText] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [status, setStatus] = useState('Syncing');

  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const currentAiTurnBuffer = useRef("");
  const currentStudentTurnBuffer = useRef("");
  const transcriptRef = useRef<string[]>([]);
  const isStoppingRef = useRef(false);
  const isFinalizingRef = useRef(false); 
  const isSessionActiveRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const retryCountRef = useRef(0);

  const studentAudioChunksRef = useRef<Int16Array[]>([]);

  useEffect(() => {
    startSession();
    return () => {
      cleanupSession();
    };
  }, []);

  const cleanupSession = () => {
    sessionClosedRef.current = true;
    isSessionActiveRef.current = false;
    
    if (micProcessorRef.current) {
      try { micProcessorRef.current.disconnect(); } catch(e) {}
      micProcessorRef.current = null;
    }
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    
    if (audioContextsRef.current) {
      try { audioContextsRef.current.input.close(); } catch(e) {}
      try { audioContextsRef.current.output.close(); } catch(e) {}
      audioContextsRef.current = null;
    }

    sourcesRef.current.forEach(src => { try { src.stop(); } catch(e) {} });
    sourcesRef.current.clear();
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setSessionActive(true);
      isSessionActiveRef.current = true;
      setCountdown(null);
    }
  }, [countdown]);

  useEffect(() => {
    let interval: number | null = null;
    if (sessionActive && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleStop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000) as unknown as number;
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive, timeLeft]);

  const startSession = async () => {
    if (isStoppingRef.current) return;
    
    setStatus(retryCountRef.current > 0 ? `Reconnecting (${retryCountRef.current}/${MAX_RETRIES})...` : 'Syncing');
    sessionClosedRef.current = false;

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please check your environment settings (VITE_GEMINI_API_KEY).");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      if (!audioContextsRef.current) {
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextsRef.current = { input: inputCtx, output: outputCtx };
      }

      const { input: inputCtx, output: outputCtx } = audioContextsRef.current;

      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      const docContent = mode === AppMode.TEACHER_TASK ? teacherTask?.pdfContent : selfStudyText;

      const SYSTEM_INSTRUCTION = `
あなたは英会話インストラクターです。
以下の【3段階の意味交渉ルール】を厳格に守って会話を進めてください。

■ 3段階の意味交渉ルール
1. 【聞き返し】ユーザーが発言したら、まずは完全に理解したフリをせず、"What do you mean by ~?" や "Could you explain that more specifically?" と聞き返し、ユーザーに説明を促してください。
2. 【深掘り】ユーザーが説明を加えたら、さらに別の角度から質問を重ねるか、あなたの解釈が合っているか確認（"So, are you saying...?"）して、もう一段階深く話させてください。
3. 【展開】ユーザーが2回以上詳細に説明し、十分に「交渉」が行われたと判断した場合のみ、次の質問や新しい話題に移ってください。

■ 制約
- 常に CEFR A1 レベル（超初級）の平易な英語を使用してください。
- ユーザーが "Oh" や "I see" などの相槌だけの時は、このルールを適用せず自然に流してください。
- トピック（PDF内容）がある場合は、その内容から逸れないようにしてください。
- 会話の文脈（前提知識）: [${docContent}]`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (sessionClosedRef.current) return;
            setStatus('Active');
            retryCountRef.current = 0; 
            setupMic(inputCtx, sessionPromise);
            
            if (countdown === null && !sessionActive) {
              setCountdown(3);
            }
            
            sessionPromise.then(s => {
              if (sessionClosedRef.current || !s) return;
              try {
                if (transcriptRef.current.length === 0) {
                  s.sendRealtimeInput({ text: "AI here. Ready to discuss. What are your thoughts?" });
                } else {
                  s.sendRealtimeInput({ text: "I am back. Let us continue the session." });
                }
              } catch(e) {}
            });
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (sessionClosedRef.current) return;

            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              playAudio(msg.serverContent.modelTurn.parts[0].inlineData.data, outputCtx);
            }
            if (msg.serverContent?.outputTranscription) {
               currentAiTurnBuffer.current += msg.serverContent.outputTranscription.text;
               setCurrentAiText(currentAiTurnBuffer.current);
            }
            if (msg.serverContent?.inputTranscription) {
               currentStudentTurnBuffer.current += msg.serverContent.inputTranscription.text;
               if (currentAiTurnBuffer.current) {
                 const aiLine = `AI: ${currentAiTurnBuffer.current.trim()}`;
                 setTranscript(prev => [...prev, aiLine]);
                 transcriptRef.current.push(aiLine);
                 currentAiTurnBuffer.current = "";
                 setCurrentAiText("");
               }
            }
            if (msg.serverContent?.turnComplete) {
               if (currentStudentTurnBuffer.current) {
                 const line = `STU: ${currentStudentTurnBuffer.current.trim()}`;
                 setTranscript(prev => [...prev, line]);
                 transcriptRef.current.push(line);
                 currentStudentTurnBuffer.current = "";
               }
            }
          },
          onerror: (e) => {
            console.error("Session Error:", e);
            handleConnectionLoss();
          },
          onclose: (e) => {
            console.warn("Session Closed:", e);
            handleConnectionLoss();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      handleConnectionLoss();
    }
  };

  const handleConnectionLoss = () => {
    if (isStoppingRef.current || sessionClosedRef.current) return;

    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      if (sessionRef.current) { try { sessionRef.current.close(); } catch(e){} }
      setTimeout(() => startSession(), 1500);
    } else {
      if (transcriptRef.current.length > 2) {
        handleStop();
      } else {
        setStatus('Failed');
      }
    }
  };

  const setupMic = (ctx: AudioContext, sessionPromise: Promise<any>) => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (sessionClosedRef.current) return;
      if (micProcessorRef.current) { try { micProcessorRef.current.disconnect(); } catch(e){} }

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      micProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (isStoppingRef.current || sessionClosedRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) { int16[i] = inputData[i] * 32768; }
        
        if (isSessionActiveRef.current) {
          studentAudioChunksRef.current.push(new Int16Array(int16));
        }
        
        const pcmBlob = {
          data: encode(new Uint8Array(int16.buffer)),
          mimeType: 'audio/pcm;rate=16000',
        };
        
        sessionPromise.then(session => {
          if (!sessionClosedRef.current && !isStoppingRef.current && session) {
            try { session.sendRealtimeInput({ media: pcmBlob }); } catch (err) {}
          }
        });
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    }).catch(err => setStatus('Mic Error'));
  };

  const playAudio = async (base64: string, ctx: AudioContext) => {
    if (sessionClosedRef.current || !ctx || ctx.state === 'closed') return;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      const buffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => { sourcesRef.current.delete(source); };
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;
      sourcesRef.current.add(source);
    } catch (e) {}
  };

  const createWavHeader = (dataLength: number, sampleRate: number) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 32 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    return new Uint8Array(buffer);
  };

  const handleStop = async () => {
    if (isFinalizingRef.current) return; 
    isFinalizingRef.current = true;
    isStoppingRef.current = true;
    isSessionActiveRef.current = false;
    setStatus('Please wait...');
    setSessionActive(false);
    
    if (micProcessorRef.current) { try { micProcessorRef.current.disconnect(); } catch(e) {} }

    if (currentStudentTurnBuffer.current) { transcriptRef.current.push(`STU: ${currentStudentTurnBuffer.current.trim()}`); }
    if (currentAiTurnBuffer.current) { transcriptRef.current.push(`AI: ${currentAiTurnBuffer.current.trim()}`); }
    const fullTranscript = transcriptRef.current.join('\n');
    
    let audioBase64: string | undefined = undefined;
    try {
      if (studentAudioChunksRef.current.length > 0) {
        const totalLength = studentAudioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
        const mergedPcm = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of studentAudioChunksRef.current) { mergedPcm.set(chunk, offset); offset += chunk.length; }
        const pcmBytes = new Uint8Array(mergedPcm.buffer);
        const header = createWavHeader(pcmBytes.length, 16000);
        const wavBytes = new Uint8Array(header.length + pcmBytes.length);
        wavBytes.set(header); wavBytes.set(pcmBytes, header.length);
        audioBase64 = encode(wavBytes);
      }
    } catch (e) {}

    cleanupSession();

    if (fullTranscript.length < 10) {
       alert("Transcript too short for academic review.");
       onCancel();
       return;
    }

    try {
      const analysis = await analyzeSession(fullTranscript, level);
      const timestamp = new Date().toLocaleString();
      const result: SessionResult = {
        sessionId: `${email.split('@')[0]}_${Date.now()}`,
        timestamp,
        email, mode, level,
        cefr: analysis.cefr,
        pronunciationScore: analysis.pronunciationScore,
        wordCount: analysis.wordCount,
        vocabComplexity: analysis.vocabComplexity,
        script: fullTranscript,
        mistakes: analysis.mistakes.join('; '),
        advice: analysis.advice,
        audioBase64: audioBase64 
      };
      
      // Attempt auto-sync once
      await sendSessionToIntegration(result);
      
      onComplete(result);
    } catch (err) {
      console.error(err);
      onCancel();
    }
  };

  if (countdown === null && !sessionActive && !isStoppingRef.current) {
    if (status === 'Failed') {
       return (
         <div className="flex flex-col items-center justify-center h-[60vh] space-y-8 animate-fadeIn">
           <h2 className="text-2xl font-bold title-serif text-red-600 tracking-widest uppercase">Connection Lost</h2>
           <button onClick={onCancel} className="px-10 py-4 border border-[#A67C52] text-[#A67C52] font-bold uppercase tracking-widest text-xs hover:bg-[#A67C52] hover:text-white transition-all rounded-full">Back to Home</button>
         </div>
       );
    }
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-12 animate-fadeIn">
        <h2 className="text-2xl font-bold title-serif text-[#A67C52] tracking-widest uppercase">Initializing Neural Link</h2>
        <div className="w-48 h-48 border-2 border-[#D4AF37] rounded-full flex items-center justify-center relative">
          <div className="w-40 h-40 border border-[#D4AF37]/30 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#A67C52] uppercase tracking-widest animate-pulse">{status}</span>
          </div>
        </div>
      </div>
    );
  }

  if (countdown !== null) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-12 animate-fadeIn">
        <h2 className="text-4xl font-bold title-serif text-[#A67C52] tracking-widest">Prepare Yourself</h2>
        <div className="w-64 h-64 border-2 border-[#D4AF37] rounded-full flex items-center justify-center shadow-xl">
          <span className="text-8xl font-black title-serif text-[#A67C52] italic">{countdown}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fadeIn relative">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 deco-panel p-8 flex justify-between items-center corner-stepped">
          <div className="flex items-center space-x-6">
            <div className={`w-3 h-3 rounded-full bg-[#A67C52] ${sessionActive ? 'animate-ping' : ''}`}></div>
            <div>
              <span className="font-bold text-[#A67C52]/40 uppercase tracking-widest text-[9px]">Status</span>
              <p className="font-bold text-xl text-[#A67C52] title-serif">{status}</p>
            </div>
          </div>
          <div className="text-right">
             <span className="font-bold text-[#A67C52]/40 uppercase tracking-widest text-[9px]">Tier</span>
             <p className="font-bold text-xl text-[#D4AF37] title-serif">{level}</p>
          </div>
        </div>
        <div className="col-span-4 deco-panel p-8 bg-[#A67C52] text-[#D4AF37] border-none flex items-center justify-center corner-stepped">
          <div className="text-center">
            <span className="font-bold uppercase tracking-[0.3em] text-[9px] text-white opacity-80">Time</span>
            <div className="text-4xl font-bold title-serif tracking-tighter text-white">{Math.floor(timeLeft/60)}:{timeLeft%60<10?'0':''}{timeLeft%60}</div>
          </div>
        </div>
      </div>

      <div className="deco-panel p-16 min-h-[400px] flex flex-col items-center justify-center space-y-12 relative overflow-hidden bg-white/80 corner-stepped">
        <div className="absolute inset-0 opacity-5 sunburst-bg"></div>
        <div className="z-10 w-full text-center">
          <div className="bg-white/90 p-12 border-2 border-[#D4AF37] border-double text-left max-w-3xl mx-auto shadow-xl rounded-[2.5rem]">
             <span className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-widest block mb-4">Transcription Feed</span>
             <p className="text-2xl font-bold leading-relaxed text-[#A67C52] title-serif italic min-h-[120px]">
               {currentAiText || (isStoppingRef.current ? "Please wait..." : `Awaiting AI...`)}
             </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button 
          onClick={handleStop} 
          disabled={isStoppingRef.current} 
          className="w-full max-w-xl py-10 bg-[#A67C52] text-white border-2 border-[#D4AF37] font-bold uppercase tracking-[0.4em] hover:bg-[#D4AF37] hover:text-[#A67C52] transition-all text-base shadow-2xl rounded-full"
        >
          {isStoppingRef.current ? 'Please wait...' : 'Finish and Analyze Session'}
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto deco-panel p-8 text-sm bg-white/60 corner-stepped">
          <div className="flex justify-between items-center mb-6 border-b border-[#A67C52]/10 pb-4">
             <h4 className="text-[9px] font-bold text-[#A67C52] uppercase tracking-[0.4em]">Official Transcript History</h4>
          </div>
          <div className="space-y-6">
          {transcript.map((line, i) => (
            <div key={i} className={`p-4 border-l-2 ${line.startsWith('AI') ? 'border-[#D4AF37]' : 'border-[#A67C52]'}`}>
              <span className="font-bold text-[9px] uppercase block mb-2 opacity-50 tracking-widest">{line.split(':')[0]}</span>
              <span className="text-[#A67C52] font-medium leading-relaxed">{line.split(':').slice(1).join(':')}</span>
            </div>
          ))}
          </div>
      </div>
    </div>
  );
};
