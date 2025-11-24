import { GoogleGenAI, Type, Schema, FunctionDeclaration } from "@google/genai";
import { Annotation } from "../types";

// Initialize Gemini Client
// Note: API KEY is managed via process.env.API_KEY as per instructions.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes a PDF page (converted to image) to find difficult concepts.
 */
export const analyzePdfPage = async (base64Image: string): Promise<Annotation[]> => {
  try {
    const model = "gemini-2.5-flash";
    
    const responseSchema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A short, catchy title for the concept or equation, preferably with an emoji." },
          description: { type: Type.STRING, description: "A fun, colorful, undergrad-level explanation. Use analogies!" },
          verticalPosition: { type: Type.NUMBER, description: "Approximate vertical position on the page from 0 (top) to 100 (bottom)." },
          type: { type: Type.STRING, enum: ["concept", "equation", "summary"] }
        },
        required: ["title", "description", "verticalPosition", "type"]
      }
    };

    const prompt = `
      You are an expert academic tutor with a flair for making learning fun. Analyze this page. 
      Identify 3 to 5 complex concepts, jargon, or equations.
      
      CRITICAL INSTRUCTIONS:
      1. STRICTLY IGNORE headers, footers, and page numbers.
      2. IGNORE simple facts. Focus on the HARD stuff.
      3. For each item, provide a **colorful, stylish annotation**. 
      4. Use **emojis** in the titles.
      5. Use **metaphors** and **analogies** in the descriptions to explain complex ideas simply.
      6. Estimate vertical position (0-100%).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: base64Image } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are an enthusiastic and creative academic tutor. Your goal is to make learning fun. Use emojis, colorful analogies, and lively language.",
        temperature: 0.3, 
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      // Add IDs
      return data.map((item: any, index: number) => ({
        ...item,
        id: `anno-${Date.now()}-${index}`
      }));
    }
    return [];
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze page. Please try again.");
  }
};

/**
 * Edits an image using text prompts.
 */
export const editImageWithGemini = async (base64Image: string, prompt: string, mimeType: string = "image/png"): Promise<string | null> => {
  try {
    // Using gemini-2.5-flash-image for image editing/generation tasks as requested
    const model = "gemini-2.5-flash-image";

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt }
        ]
      },
      // No responseMimeType or responseSchema for image generation models
    });

    // Iterate parts to find the image
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw new Error("Failed to edit image.");
  }
};

// Tool definition for illustration
const illustrationTool: FunctionDeclaration = {
  name: "generate_illustration",
  description: "Generates a doodle, diagram, or illustration to explain a concept visually.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: "A descriptive prompt for the illustration (e.g., 'A hand-drawn diagram of a mitochondrion', 'A doodle of a happy cat explaining gravity').",
      },
    },
    required: ["prompt"],
  },
};

/**
 * Helper to generate an image from a prompt using gemini-2.5-flash-image
 */
const generateImage = async (prompt: string): Promise<string | undefined> => {
  try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] },
      });
      
      for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
              return part.inlineData.data;
          }
      }
  } catch (e) {
      console.error("Image generation failed", e);
  }
  return undefined;
};

/**
 * Chat with Gemini about a screenshot or text, with illustration capabilities.
 */
export const chatWithGemini = async (message: string, base64Image?: string): Promise<{ text: string; image?: string }> => {
  try {
    const model = "gemini-2.5-flash";
    
    const parts: any[] = [{ text: message }];
    
    if (base64Image) {
      // Add image as the first part if present
      parts.unshift({
        inlineData: {
          mimeType: "image/png",
          data: base64Image
        }
      });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: "You are a creative, visual academic tutor. Use colorful analogies, emojis, and markdown formatting to make explanations pop. If a concept is visual (like geometry, biology structures, or physical scenes), create a doodle or illustration for it using the `generate_illustration` tool.",
        tools: [{ functionDeclarations: [illustrationTool] }],
      }
    });

    let responseText = response.text || "";
    let generatedImage: string | undefined;

    // Check for tool calls (illustration request)
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === "generate_illustration") {
        const args = call.args as any;
        const imagePrompt = args.prompt;
        
        // Generate the illustration
        generatedImage = await generateImage(imagePrompt);
        
        // If the model didn't provide text along with the tool call (common), add a caption.
        if (!responseText) {
            responseText = `🎨 Here is an illustration for: *${imagePrompt}*`;
        }
      }
    }

    return { text: responseText, image: generatedImage };
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return { text: "Sorry, I encountered an error processing your request." };
  }
};