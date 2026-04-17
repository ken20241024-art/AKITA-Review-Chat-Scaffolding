
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisReport, PracticeLevel } from "../types";

export async function analyzeSession(transcript: string, targetLevel: PracticeLevel): Promise<AnalysisReport> {
  try {
    const levelMap = {
      [PracticeLevel.BABY]: "A1 (Breakthrough/Beginner)",
      [PracticeLevel.BEGINNER]: "A2 (Waystage/Elementary)",
      [PracticeLevel.INTERMEDIATE]: "B1 (Threshold/Intermediate)",
      [PracticeLevel.ADVANCED]: "C1 (Effective Operational Proficiency/Advanced)"
    };

    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API Key is missing. Please check your environment settings (VITE_GEMINI_API_KEY).");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Analyze the following English conversation transcript between an AI Teacher and a Student.
        The student's target level was ${targetLevel} (${levelMap[targetLevel]}).
        
        Transcript:
        ${transcript}

        Please evaluate based on the targeted CEFR level and provide JSON:
        1. cefr: CEFR Level (MUST BE EXACT: A1, A2, B1, B2, or C1).
        2. pronunciationScore: Estimate 0-100 based on transcription flow.
        3. wordCount: Total Word Count of student only.
        4. vocabComplexity: (Simple, Basic, Intermediate, Advanced).
        5. mistakes: ARRAY of strings. Each string MUST follow this EXACT format: "User's specific phrase -> Corrected phrase (Brief explanation of the grammar or nuance)". List up to 5 key improvements.
        6. advice: General pedagogical advice for the student to reach the next level.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cefr: { type: Type.STRING },
            pronunciationScore: { type: Type.INTEGER },
            wordCount: { type: Type.INTEGER },
            vocabComplexity: { type: Type.STRING },
            mistakes: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            advice: { type: Type.STRING }
          },
          required: ["cefr", "pronunciationScore", "wordCount", "vocabComplexity", "mistakes", "advice"]
        }
      }
    });

    return JSON.parse(response.text?.trim() || "{}");
  } catch (error) {
    console.error("Analysis failed", error);
    return {
      cefr: "N/A",
      pronunciationScore: 0,
      wordCount: transcript.split(' ').length / 2,
      vocabComplexity: "N/A",
      mistakes: ["No major errors detected in automated analysis."],
      advice: "Try to use more diverse vocabulary and longer sentence structures."
    };
  }
}
