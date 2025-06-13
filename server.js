require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { twiml: { VoiceResponse } } = require('twilio');
const Twilio = require('twilio');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

// Init Twilio Client
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 🧪 Health Check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// 🎧 Serve Converted Audio
app.get('/audio', (req, res) => {
  const filePath = path.join(__dirname, 'response.wav');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'audio/wav');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Audio not found.');
  }
});

// 🎙️ Voice Webhook
app.post('/voice', async (req, res) => {
  const input = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';
  const response = new VoiceResponse();

  try {
    // 🔹 Step 1: Get GPT reply
    const gpt = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Angela, a calm and professional business assistant.'
          },
          { role: 'user', content: input }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = gpt.data.choices[0].message.content;

    // 🔹 Step 2: Text-to-Speech with ElevenLabs
    const tts = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    fs.writeFileSync('response.mp3', tts.data);

    // 🔹 Step 3: Convert to WAV
    await new Promise((resolve, reject) => {
      ffmpeg('response.mp3')
        .audioChannels(1)
        .audioFrequency(8000)
        .audioCodec('pcm_mulaw')
        .format('wav')
        .on('end', resolve)
        .on('error', reject)
        .save('response.wav');
    });

    // 🔹 Step 4: Respond with TwiML
    response.play(`${process.env.BASE_URL}/audio`);
    res.type('text/xml').send(response.toString());

  } catch (err) {
    console.error('❌ Voice error:', err.message);
    response.say('Sorry, something went wrong.');
    res.type('text/xml').send(response.toString());
  }
});

// ☎️ Trigger Outbound Call
app.get('/call-now', async (req, res) => {
  try {
    const call = await twilioClient.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log('📞 Call SID:', call.sid);
    res.send(`✅ Call started. SID: ${call.sid}`);
  } catch (err) {
    console.error('❌ Call error:', err.message);
    res.status(500).send('Call failed.');
  }
});

// 🚀 Start Server
app.listen(port, () => {
  console.log(`🚀 Angela AI Agent running on port ${port}`);
});
