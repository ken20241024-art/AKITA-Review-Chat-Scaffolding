
export enum PracticeLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED'
}

export interface AnalysisReport {
  cefr: string;
  pronunciationScore: number;
  wordCount: number;
  vocabComplexity: string;
  mistakes: string[];
  advice: string;
}

export interface SessionResult extends AnalysisReport {
  sessionId: string;
  timestamp: string;
  level: PracticeLevel;
  script: string;
}
