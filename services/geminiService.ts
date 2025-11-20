
import { GoogleGenAI, Type } from "@google/genai";
import { Block } from "../types";
import { generateId } from "../utils";

// Initialize Gemini Client
// The API key must be provided in the environment variable process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateFlashcardsFromTopic = async (topic: string): Promise<Block[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a list of 5 to 10 concise notes and flashcards about: "${topic}". 
      
      Format the output specifically for a RemNote-style app. 
      Some lines should be regular notes (facts).
      Some lines should be flashcards using the "::" delimiter (Question :: Answer).
      Use indentation to show hierarchy (parent concepts vs child details).
      
      Example:
      Biology Basics
      Photosynthesis :: Process used by plants to convert light energy into chemical energy.
      - Chlorophyll :: The green pigment responsible for light absorption.
      
      Return ONLY the raw text content with lines. Do not use markdown bolding or code blocks.`,
      config: {
        temperature: 0.7,
      }
    });

    const text = response.text || "";
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    const blocks: Block[] = lines.map(line => {
      // Calculate indentation based on leading spaces or tabs or dashes
      let level = 0;
      const trimmed = line.trimStart();
      
      if (line.startsWith('    ') || line.startsWith('\t')) level = 1;
      if (line.startsWith('        ') || line.startsWith('\t\t')) level = 2;
      
      // Clean up list markers commonly returned by AI
      const cleanContent = trimmed.replace(/^[-*•]\s*/, '');

      return {
        id: generateId(),
        content: cleanContent,
        level: level,
        isFlashcard: cleanContent.includes('::')
      };
    });

    return blocks;

  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
};

export const explainConcept = async (concept: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Explain the concept "${concept}" briefly in one sentence for a flashcard back.`,
    });
    return response.text || "";
  } catch (error) {
    console.error(error);
    return "Could not generate explanation.";
  }
};
