
export enum PracticeLevel {
  BABY = 'Baby',
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export enum AppMode {
  TEACHER_TASK = 'teacher\'s task',
  SELF_STUDY = 'self-study'
}

export interface SessionResult {
  sessionId: string; // Added for duplicate prevention
  timestamp: string;
  email: string;
  cefr: string;
  pronunciationScore: number;
  wordCount: number;
  vocabComplexity: string;
  script: string;
  mistakes: string;
  advice: string;
  mode: AppMode;
  level: PracticeLevel;
  audioBase64?: string; // Base64 encoded WAV data
}

export interface TeacherTask {
  pdfContent: string;
  pdfName: string;
  level: PracticeLevel;
  updatedAt: string;
}

export interface AnalysisReport {
  cefr: string;
  pronunciationScore: number;
  wordCount: number;
  vocabComplexity: string;
  mistakes: string[];
  advice: string;
}
