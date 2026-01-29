import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import twilio from 'twilio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// --- LOAD ENV VARIABLES ---
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- MONGODB CONNECTION ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is missing');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('✅ Nexverra Master DB: Linked'))
  .catch(err => {
    console.error('❌ DB Link Failure:', err);
    process.exit(1);
  });

// --- SCHEMA ---
const MessageSchema = new mongoose.Schema(
  {
    senderName: String,
    senderEmail: String,
    senderPhone: String,
    senderAddress: String,
    subject: String,
    items: Array,
    body: String,
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['unread', 'read', 'resolved'],
      default: 'unread'
    },
    userId: String
  },
  { versionKey: false }
);

const Message = mongoose.model('Message', MessageSchema);

// --- TWILIO CONFIGURATION ---
const {
  TWILIO_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_SENDER,
  ADMIN_PHONE
} = process.env;

let twilioClient = null;

if (TWILIO_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} else {
  console.warn('⚠️ Twilio credentials missing — SMS disabled');
}

// --- FUNCTION TO SEND SMS ---
const dispatchTwilioSMS = async (payload) => {
  if (!twilioClient) {
    return { success: false, error: 'Twilio not configured' };
  }

  const {
    senderName,
    senderEmail,
    senderPhone,
    subject,
    items,
    body: messageBody
  } = payload;

  const formattedItemsList =
    Array.isArray(items) && items.length
      ? items.map(item => item.title).join(', ')
      : 'None';

  const smsBody = `📩 New Nexverra Order
From: ${senderName}
📧 ${senderEmail || 'N/A'}
📞 ${senderPhone || 'N/A'}
Subject: ${subject}
Items: ${formattedItemsList}
Message: ${messageBody}`;

  try {
    await twilioClient.messages.create({
      from: TWILIO_SENDER,
      to: ADMIN_PHONE,
      body: smsBody
    });

    console.log('✅ SMS DISPATCHED');
    return { success: true };
  } catch (err) {
    console.error('❌ SMS FAILED:', err);
    return { success: false, error: err.message };
  }
};

// --- API ROUTES ---
app.post('/api/messages', async (req, res) => {
  try {
    const msg = new Message(req.body);
    await msg.save();

    const smsStatus = await dispatchTwilioSMS(req.body);

    res.status(201).json({
      success: true,
      message: 'Lead captured in Nexverra Database',
      sms: smsStatus
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===============================
// ✅ SERVE FRONTEND FROM DIST
// ===============================
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// React Router safe fallback (Node 22)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Nexverra running at http://localhost:${PORT}`);
});
