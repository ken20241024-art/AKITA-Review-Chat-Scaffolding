
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisReport, PracticeLevel } from "./types";

export async function analyzeSession(transcript: string, targetLevel: PracticeLevel): Promise<AnalysisReport> {
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Analyze this English conversation.
        Target Level: ${targetLevel}
        
        Transcript:
        ${transcript}

        Provide JSON:
        1. cefr: A1-C1
        2. pronunciationScore: 0-100
        3. wordCount: total words
        4. vocabComplexity: Simple/Basic/Intermediate/Advanced
        5. mistakes: Array of "Error -> Correction (Why)"
        6. advice: How to improve
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
            mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
            advice: { type: Type.STRING }
          },
          required: ["cefr", "pronunciationScore", "wordCount", "vocabComplexity", "mistakes", "advice"]
        }
      }
    });

    return JSON.parse(response.text?.trim() || "{}");
  } catch (error) {
    console.error(error);
    return {
      cefr: "N/A",
      pronunciationScore: 0,
      wordCount: 0,
      vocabComplexity: "N/A",
      mistakes: ["Analysis failed"],
      advice: "Keep practicing!"
    };
  }
}
