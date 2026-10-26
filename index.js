
const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");

const {
    token,
    geminiApiKey,
    model,
    systemInstruction,
    applicationId,
    guildId,
    aiChannelId
} = require("./config.json");

// إعداد Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// إعداد Gemini
const ai = new GoogleGenAI({
    apiKey: geminiApiKey
});

// سجل منفصل لكل مستخدم أثناء تشغيل البوت
const conversations = new Map();
const HISTORY_LIMIT = 20;

// أمر /akram
const akramCommand = new SlashCommandBuilder()
    .setName("akram")
    .setDescription("تحدث مع Akram Community Assistant بشكل خاص")
    .addStringOption(option =>
        option
            .setName("message")
            .setDescription("اكتب رسالتك إلى أكرم")
            .setRequired(true)
            .setMaxLength(2000)
    );

// تسجيل الأمر داخل السيرفر
async function registerCommand() {
    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(
        Routes.applicationGuildCommands(applicationId, guildId),
        {
            body: [akramCommand.toJSON()]
        }
    );

    console.log("Slash command /akram registered.");
}

// طلب رد من Gemini مع سياق المحادثة
async function generateAIResponse(userId, question) {
    const history = conversations.get(userId) || [];

    const contents = [
        ...history,
        {
            role: "user",
            parts: [{ text: question }]
        }
    ];

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(
                `Gemini request: attempt ${attempt}/${maxAttempts}`
            );

            const response = await ai.models.generateContent({
                model,
                contents,
                config: {
                    systemInstruction
                }
            });

            const answer = response.text?.trim();

            if (!answer) {
                throw new Error("Gemini returned an empty response.");
            }

            // حفظ سياق المستخدم فقط
            const updatedHistory = [
                ...contents,
                {
                    role: "model",
                    parts: [{ text: answer }]
                }
            ];

            conversations.set(
                userId,
                updatedHistory.slice(-(HISTORY_LIMIT * 2))
            );

            return answer;

        } catch (error) {
            const status = Number(
                error.status ?? error.code ?? 0
            );

            console.error("Gemini error:", {
                message: error.message,
                status
            });

            const retryableStatuses = [
                408, 429, 500, 502, 503, 504
            ];

            if (
                !retryableStatuses.includes(status) ||
                attempt === maxAttempts
            ) {
                throw error;
            }

            const delay = 1500 * (2 ** (attempt - 1));

            console.log(`Retrying in ${delay}ms`);

            await new Promise(resolve =>
                setTimeout(resolve, delay)
            );
        }
    }

    throw new Error("Gemini request failed.");
}

// تقسيم الردود الطويلة
function splitMessage(text, maxLength = 1900) {
    const chunks = [];

    for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.slice(i, i + maxLength));
    }

    return chunks.length ? chunks : ["ما عندي رد حاليًا."];
}

// تشغيل البوت وتسجيل الأمر
client.once(Events.ClientReady, async () => {
    console.log("----------------------------------");
    console.log(`Bot: ${client.user.tag}`);
    console.log("Name: Akram Community Assistant");
    console.log(`AI Model: ${model}`);
    console.log(`AI Channel ID: ${aiChannelId}`);
    console.log("Status: Online");
    console.log("----------------------------------");

    try {
        await registerCommand();
    } catch (error) {
        console.error("Failed to register /akram:", error);
    }
});

// استقبال الأمر
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "akram") return;

    // السماح باستخدام الأمر داخل السيرفر فقط
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "استخدم أكرم داخل سيرفر Akram Community.",
            ephemeral: true
        });

        return;
    }

    // منع استخدام أكرم في القنوات الأخرى
    if (interaction.channelId !== aiChannelId) {
        await interaction.reply({
            content:
                `🤖 مكان أكرم المخصص هو <#${aiChannelId}>.\n` +
                "روح اكتب هناك، وبساعدك بكل سرور!",
            ephemeral: true
        });

        return;
    }

    const question = interaction.options.getString(
        "message",
        true
    ).trim();

    if (!question) {
        await interaction.reply({
            content: "اكتب سؤالك أولًا.",
            ephemeral: true
        });

        return;
    }

    // الرد خاص بصاحب الأمر
    await interaction.deferReply({
        ephemeral: true
    });

    try {
        const answer = await generateAIResponse(
            interaction.user.id,
            question
        );

        const chunks = splitMessage(answer);

        // الرد الأول
        await interaction.editReply({
            content: chunks[0]
        });

        // بقية الأجزاء تبقى خاصة
        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({
                content: chunks[i],
                ephemeral: true
            });
        }

        console.log(
            `Private reply sent to ${interaction.user.tag}`
        );

    } catch (error) {
        console.error("Akram command error:", error);

        await interaction.editReply({
            content:
                "عذرًا، صار عندي خطأ وأنا بحاول أجاوبك. " +
                "جرّب مرة ثانية بعد قليل."
        }).catch(console.error);
    }
});

// تشغيل البوت
client.login(token).catch(error => {
    console.error("Discord login failed:", error);
});
