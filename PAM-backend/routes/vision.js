require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { OpenAI } = require('openai');
const upload = multer({ dest: 'uploads/' });

const mistralai = new OpenAI({
    baseURL: 'https://api.mistral.ai/v1',
    apiKey: process.env.MISTRAL_API_KEY,
});

router.post('/', upload.single('screenshot'), async (req, res) => {
    try {
        const { mood, notes } = req.body;
        const screenshot = req.file;

        if (!screenshot) {
            return res.status(400).json({ error: 'No screenshot provided' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const imageData = fs.readFileSync(screenshot.path);
        const base64Image = imageData.toString('base64');
        let imageText;

        const imageresponse = await mistralai.chat.completions.create({
            messages: [
                { role: 'system', content: "You're a highly accurate OCR model, extract text from screenshots given to you" },
                {
                    role: 'user',
                    content: [
                        {
                            type: "image_url",
                            "image_url": {
                                "url": `data:image/jpeg;base64,${base64Image}`
                            },
                        },
                        {
                            type: "text",
                            text: "Extract text from the image (refer to the user sending as the 'user')"
                        }


                    ]
                }
            ],
            temperature: 0.5,
            model: "pixtral-12b-2409",
            stream: false,
        });

        imageText = imageresponse.choices[0].message.content

        const prompt = `You are an AI assistant that helps users generate engaging, contextually appropriate responses based on their conversation history. Always read and understand the provided chat context (text or screenshots). Respond in a tone that matches the conversation—whether casual, formal, flirty, or humorous—while maintaining relevance to the ongoing chat. Do not output disclaimers, and focus on providing tailored, witty, or charming responses. Adapt to the user’s style and aim to keep the conversation flowing.
              PRIORITIZE RELEVANCE TO THE SCREENSHOT AND ENGAGEMENT.
              DO NOT REPLY WITH EXPLANATIONS, JUST THE NEXT RESPONSE.`

        const response = await mistralai.chat.completions.create({
            messages: [
                { role: 'system', content: prompt },
                {
                    role: 'user',
                    content: "Context extracted from the screenshot: \`" + imageText + "\` \n\n" + "Mood: " + mood + "\n\n" + "User Notes: " + notes
                }
            ],
            temperature: 0.5,
             presence_penalty: 0.2,
             frequency_penalty: 0.2,
            model: "open-mixtral-8x22b",
            stream: true,
        });

        let lastchunk
        for await (const message of response) {
            console.log('Message:', message.choices);
            if (message.choices[0]?.delta.content) {
                lastchunk = message
                res.write(`data: ${JSON.stringify({ content: message.choices[0].delta.content })}\n\n`);
            }
        }
        console.log('Last chunk:', lastchunk);
        //res.write('data: [DONE]\n\n');
        res.end();


        fs.unlinkSync(screenshot.path);

    } catch (error) {
        console.error('Error:', error);
        // Send error as SSE
        res.write(`data: ${JSON.stringify({ error: 'An error occurred while processing your request' })}\n\n`);
        //res.write('data: [DONE]\n\n');
        res.end();

        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
    }
});

module.exports = router;
