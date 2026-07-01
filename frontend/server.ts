import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Seeded diagnostic answers for offline / fallback mode
const MOCK_DIAGNOSES: Record<string, any> = {
  Tyre: {
    issue: "Puncture or Sudden Pressure Loss",
    likelyCause: "Nail puncture, sharp debris, or bead leak on Faizabad Road/Lucknow Highway corridors.",
    severity: "Medium",
    recommendedAction: "Safely pull over to the shoulder. Turn on hazard warning lights. Do not drive on a flat tyre to avoid rim damage.",
    estCostRange: "₹150 - ₹500",
    suggestedParts: ["Tubeless repair strip", "Replacement valve", "M-Seal sealant"]
  },
  Battery: {
    issue: "Dead Battery / Starter Solenoid Failure",
    likelyCause: "Battery charge depletion, corroded terminals, or alternator failing to charge the cell.",
    severity: "High",
    recommendedAction: "Avoid repeated crank attempts as it completely drains any reserve charge. Turn off headlights, AC, and music system.",
    estCostRange: "₹350 - ₹950 (Jump-start / Terminal clean)",
    suggestedParts: ["Terminal cleaning brush", "Jumper cables (temporary)", "Exide/Amaron 12V Battery (if replaced)"]
  },
  Engine: {
    issue: "Misfire, Alternator Halt, or Belt Snap",
    likelyCause: "Frayed serpentine belt, failing spark plug, fuel injector clog, or electronic sensor glitch.",
    severity: "High",
    recommendedAction: "Keep engine idling if oil light is not flashing. If oil light or temperature is red, shut down immediately.",
    estCostRange: "₹800 - ₹2,500",
    suggestedParts: ["Serpentine belt", "Spark plug", "Ignition coil pack"]
  },
  Overheating: {
    issue: "Coolant Leak / Radiator Fan Failure",
    likelyCause: "Split radiator hose, coolant reservoir leak, blown fan fuse, or faulty water pump.",
    severity: "Critical",
    recommendedAction: "IMMEDIATELY turn off the engine and pull over. NEVER open the radiator cap while the engine is hot as boiling steam will erupt.",
    estCostRange: "₹500 - ₹1,800",
    suggestedParts: ["Radiator top hose", "Castrol Coolant (1 Litre)", "Radiator fan fuse (15A)"]
  },
  Other: {
    issue: "General Suspension or Brake Caliper Lock",
    likelyCause: "Brake pad friction binding, axle grease leakage, or wheel bearing friction overheat.",
    severity: "Medium",
    recommendedAction: "Drive at slow speeds (under 20 km/h) to the nearest safe location. Avoid hard braking.",
    estCostRange: "₹400 - ₹1,500",
    suggestedParts: ["Brake pad set", "WD-40 spray", "Grease compound"]
  }
};

// API Endpoint for dynamic troubleshooting AI Assistant
app.post("/api/diagnose", async (req, res) => {
  const { category, description, photoUploaded } = req.body;
  const targetCategory = category || 'Other';
  const queryDesc = description || '';

  console.log(`[Diagnostic Request] Category: ${targetCategory}, Desc Length: ${queryDesc.length}`);

  try {
    const ai = getGeminiClient();

    if (!ai) {
      console.log("No valid GEMINI_API_KEY detected. Using high-fidelity local rule engine.");
      const baseMock = MOCK_DIAGNOSES[targetCategory] || MOCK_DIAGNOSES.Other;
      
      // Inject user description keywords if possible
      let customizedMock = { ...baseMock };
      if (queryDesc.toLowerCase().includes("smoke")) {
        customizedMock.issue = "Coolant/Oil Combustion & Smoke Warning";
        customizedMock.severity = "Critical";
        customizedMock.likelyCause = "Head gasket breach or oil leaking onto hot manifold block.";
        customizedMock.recommendedAction = "Do not restart engine. Await immediate on-site mechanics. Turn off ignition.";
      } else if (queryDesc.toLowerCase().includes("noise") || queryDesc.toLowerCase().includes("sound")) {
        customizedMock.issue = "Mechanical Friction & Abnormal Noise";
        customizedMock.likelyCause = "Worn out brake pads, loose pulley belt, or suspension joint damage.";
      } else if (queryDesc) {
        customizedMock.issue = `Symptomatic ${targetCategory} Malfunction`;
        customizedMock.likelyCause = `Atypical breakdown caused by: ${queryDesc.substring(0, 80)}...`;
      }

      // Small latency simulation to mimic AI response
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.json({ success: true, diagnosis: customizedMock, isMocked: true });
    }

    // Build the AI prompt
    let prompt = `You are "Otto", a professional, elite roadside mechanic diagnostic assistant helping a stranded driver in Lucknow, UP.
The driver selected the issue category: "${targetCategory}".
Driver's description of symptoms: "${queryDesc}".
${photoUploaded ? "Note: The driver has uploaded an image of the physical damage/part." : ""}

Analyze the symptoms and output a JSON response containing exactly the diagnostic fields required. Return details suitable for Lucknow pricing (in Indian Rupees - ₹). Keep recommendations highly practical, clear, safe, and reassuring.

Return a JSON object matching this schema exactly:
{
  "issue": "A concise, specific name for the diagnosed issue",
  "likelyCause": "A 1-2 sentence technical explanation of what caused this breakdown",
  "severity": "One of: 'Low' | 'Medium' | 'High' | 'Critical'",
  "recommendedAction": "Actionable, urgent instructions of what the driver must do right now to stay safe",
  "estCostRange": "Estimated cost range in INR, e.g. '₹400 - ₹1,200' based on Lucknow garage standards",
  "suggestedParts": ["List of 2-3 spare parts or consumables likely required, with brand or spec if possible"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            issue: { type: Type.STRING },
            likelyCause: { type: Type.STRING },
            severity: { type: Type.STRING, description: "Must be one of: 'Low' | 'Medium' | 'High' | 'Critical'" },
            recommendedAction: { type: Type.STRING },
            estCostRange: { type: Type.STRING },
            suggestedParts: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["issue", "likelyCause", "severity", "recommendedAction", "estCostRange", "suggestedParts"]
        }
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return res.json({ success: true, diagnosis: parsed, isMocked: false });
    } else {
      throw new Error("Empty response from Gemini API");
    }

  } catch (error: any) {
    console.error("Gemini Diagnostic Route Error:", error);
    // Fallback to mock data so the app never fails
    const baseMock = MOCK_DIAGNOSES[targetCategory] || MOCK_DIAGNOSES.Other;
    return res.json({ 
      success: true, 
      diagnosis: baseMock, 
      isMocked: true,
      errorInfo: error.message 
    });
  }
});

// Setup Vite Dev Server / Static files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OttoAssist backend running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
export default app;
