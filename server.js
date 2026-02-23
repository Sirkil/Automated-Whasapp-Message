const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, PORT } = process.env;

// 1. Webhook Verification (Required by Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Handling Incoming WhatsApp Messages
app.post('/webhook', async (req, res) => {
    // WhatsApp requires a 200 OK immediately to prevent retries
    res.sendStatus(200);

    const body = req.body;

    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        const senderPhone = message.from;

        // Scenario A: User sends the pre-filled text from the physical QR Code
        if (message.type === 'text') {
            const text = message.text.body.toLowerCase();
            if (text.includes('i want to attend')) {
                await sendInteractiveButtons(senderPhone);
            }
        }

        // Scenario B: User taps one of the interactive buttons
        if (message.type === 'interactive') {
            const buttonReply = message.interactive.button_reply;
            if (buttonReply.id === 'confirm') {
                await sendQRCodeImage(senderPhone);
            } else if (buttonReply.id === 'decline') {
                await sendTextMessage(senderPhone, "We are sorry you can't make it. Hope to see you next time!");
            }
        }
    }
});

// --- WhatsApp API Helper Functions ---

async function sendInteractiveButtons(to) {
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "Thank you for scanning! Are you attending the event?" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "confirm", title: "Confirm" } },
                    { type: "reply", reply: { id: "decline", title: "Decline" } }
                ]
            }
        }
    };
    await makeWhatsAppAPIRequest(payload);
}

async function sendQRCodeImage(to) {
    // Generate a dynamic QR code using a free API (perfect for stateless hosting like Render)
    const guestData = encodeURIComponent(`CONFIRMED_GUEST_${to}_TICKET`);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${guestData}`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "image",
        image: {
            link: qrImageUrl
        }
    };
    await makeWhatsAppAPIRequest(payload);
}

async function sendTextMessage(to, text) {
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
    };
    await makeWhatsAppAPIRequest(payload);
}

async function makeWhatsAppAPIRequest(data) {
    try {
        await axios.post(
            `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`,
            data,
            { headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` } }
        );
    } catch (error) {
        console.error("Error sending message:", error.response?.data || error.message);
    }
}

app.listen(PORT || 3000, () => console.log(`Server is running on port ${PORT || 3000}`));