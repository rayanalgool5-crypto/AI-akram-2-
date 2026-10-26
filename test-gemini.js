
const { GoogleGenAI } = require("@google/genai");
const { geminiApiKey, model } = require("./config.json");

const ai = new GoogleGenAI({
    apiKey: geminiApiKey
});

async function main() {
    console.log("Testing Gemini...");
    console.log("Model:", model);

    const timeout = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error("TIMEOUT: Gemini did not respond within 20 seconds."));
        }, 20000);
    });

    try {
        const response = await Promise.race([
            ai.models.generateContent({
                model,
                contents: "Reply with exactly: Hello"
            }),
            timeout
        ]);

        console.log("SUCCESS:", response.text);
    } catch (error) {
        console.error("TEST FAILED");
        console.error("Message:", error.message);
        console.error("Status:", error.status ?? error.code ?? "Unknown");
    }

    process.exit(0);
}

main();
