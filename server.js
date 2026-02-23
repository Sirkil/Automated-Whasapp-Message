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

    // --- NEW LOGGING: See exactly what Meta is sending ---
    console.log("📥 ================ INCOMING WEBHOOK ================");
    console.log(JSON.stringify(body, null, 2));
    console.log("====================================================");

    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        const senderPhone = message.from;

        // Scenario A: User sends the pre-filled text from the physical QR Code
        if (message.type === 'text') {
            const text = message.text.body.toLowerCase();
            if (text.includes('i want to attend')) {
                console.log(`✅ Detected "I want to attend" from ${senderPhone}. Sending buttons...`);
                await sendInteractiveButtons(senderPhone);
            }
        }

        // Scenario B: User taps one of the interactive buttons
        if (message.type === 'interactive') {
            const buttonReply = message.interactive.button_reply;
            if (buttonReply.id === 'confirm') {
                console.log(`✅ ${senderPhone} confirmed. Sending QR code...`);
                await sendQRCodeImage(senderPhone);
            } else if (buttonReply.id === 'decline') {
                console.log(`❌ ${senderPhone} declined. Sending thank you message...`);
                await sendTextMessage(senderPhone, "thanks to participate");
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
            body: { text: "Please confirm your attendance" },
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
    const guestData = encodeURIComponent(`CONFIRMED_GUEST_${to}_TICKET`);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${guestData}`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "image",
        image: {
            link: qrImageUrl,
            caption: "here is your qr code"
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
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`,
            data,
            { headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` } }
        );
        console.log("📤 Message sent successfully! Message ID:", response.data.messages[0].id);
    } catch (error) {
        // --- NEW LOGGING: See exactly why Meta rejected the message ---
        console.error("🚨 ================ WHATSAPP API ERROR ================");
        console.error("Status:", error.response?.status);
        console.error("Data:", JSON.stringify(error.response?.data, null, 2));
        console.error("Message:", error.message);
        console.error("======================================================");
    }
}

app.listen(PORT || 3000, () => console.log(`Server is running on port ${PORT || 3000}`));
