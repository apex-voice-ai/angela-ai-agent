require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is live.');
});

// ✅ Serve Twilio-compatible audio
app.get('/audio', (req, res) => {
  const filePath = path.join(__dirname, 'response.wav');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'audio/wav');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Audio file not found.');
  }
});

// ✅ Main Voice Handler
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const userInput = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    // 1. Get GPT response
    const gpt = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Angela, a friendly and professional AI assistant. Speak slowly and clearly.'
          },
          { role: 'user', content: userInput }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const gptReply = gpt.data.choices[0].message.content;
    console.log('🧠 GPT says:', gptReply);

    // 2. Get ElevenLabs MP3
    const elevenLabs = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: gptReply,
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

    fs.writeFileSync('response.mp3', elevenLabs.data);

    // 3. Convert MP3 to WAV for Twilio
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

    // 4. Send response to Twilio
    twiml.play(`${process.env.BASE_URL}/audio`);
    res.type('text/xml').send(twiml.toString());

  } catch (err) {
    console.error('❌ Error:', err.message);
    const fallback = new twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml').send(fallback.toString());
  }
});

// ✅ Outbound call trigger
app.get('/call-now', async (req, res) => {
  try {
    const call = await twilioClient.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log('📞 Call started:', call.sid);
    res.send(`✅ Call started. SID: ${call.sid}`);
  } catch (err) {
    console.error('❌ Call failed:', err.message);
    res.status(500).send('Call failed.');
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Angela is live on port ${port}`);
});
