require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { VoiceResponse } = require('twilio').twiml;
const { Twilio } = require('twilio');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// Serve audio file
app.get('/audio', (req, res) => {
  const filePath = path.join(__dirname, 'response.wav');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'audio/wav');
    res.sendFile(filePath);
  } else {
    console.error('❌ WAV file not found.');
    res.status(404).send('Audio file not found.');
  }
});

// Voice webhook
app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const input = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    console.log('📩 User input:', input);

    // GPT request
    console.log('🧠 Sending to OpenAI...');
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Angela, a calm and friendly business assistant from Apex Spark Media.' },
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

    const reply = gptResponse.data.choices[0].message.content;
    console.log('🧠 GPT Reply:', reply);

    // ElevenLabs request
    const voiceID = process.env.ELEVENLABS_VOICE_ID;
    console.log(`🎙️ Sending to ElevenLabs with voice ID: ${voiceID}`);
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceID}`,
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

    fs.writeFileSync('response.mp3', audioResponse.data);
    console.log('✅ MP3 saved. Starting conversion to WAV...');

    // Convert MP3 to WAV
    await new Promise((resolve, reject) => {
      ffmpeg('response.mp3')
        .audioChannels(1)
        .audioFrequency(8000)
        .audioCodec('pcm_mulaw')
        .format('wav')
        .on('end', () => {
          console.log('✅ WAV file created.');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg Error:', err.message);
          reject(err);
        })
        .save('response.wav');
    });

    // Send to Twilio
    twiml.play(`${process.env.BASE_URL}/audio`);
    res.type('text/xml').send(twiml.toString());

  } catch (err) {
    console.error('❌ Voice error:', err.message);
    const fallback = new VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml').send(fallback.toString());
  }
});

// Trigger outbound call
app.get('/call-now', async (req, res) => {
  try {
    console.log('📞 Starting outbound call...');
    const call = await twilioClient.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log('📞 Call SID:', call.sid);
    res.send(`✅ Call initiated: ${call.sid}`);
  } catch (err) {
    console.error('❌ Error starting call:', err.message);
    res.status(500).send('Call failed.');
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Angela is live on port ${port}`);
});
