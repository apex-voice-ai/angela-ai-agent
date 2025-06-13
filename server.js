require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const { Twilio } = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

// Twilio client
const twilioClient = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// Serve audio file to Twilio
app.get('/audio', (req, res) => {
  const audioPath = __dirname + '/response.mp3';
  if (fs.existsSync(audioPath)) {
    res.set('Content-Type', 'audio/mpeg');
    res.sendFile(audioPath);
  } else {
    res.status(404).send('Audio not found.');
  }
});

// Voice webhook - triggered by Twilio on call connect
app.post('/voice', async (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const userSpeech = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    // Get GPT-4 response
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Angela, a calm, helpful female business assistant who answers with short, professional sentences.' },
          { role: 'user', content: userSpeech }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const responseText = gptResponse.data.choices[0].message.content;

    // Get ElevenLabs audio
    const audio = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: responseText,
        model_id: "eleven_monolingual_v1",
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

    fs.writeFileSync('response.mp3', audio.data);

    // Respond with TwiML to play the audio
    twiml.play(`${req.protocol}://${req.get('host')}/audio`);
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('❌ Error during voice processing:', error.message);
    const fallback = new Twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong. Please try again later.');
    res.type('text/xml');
    res.send(fallback.toString());
  }
});


// Outbound Call Trigger
app.get('/call-now', async (req, res) => {
  const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  try {
    const call = await client.calls.create({
      twiml: `<Response><Say>Hi there, this is Angela from Apex Spark Media. Just testing outbound call setup.</Say></Response>`,
      to: process.env.MY_PHONE_NUMBER,         // <== THIS must exist in .env
      from: process.env.TWILIO_PHONE_NUMBER    // <== Your Twilio Number
    });

    console.log("📞 Outbound call started:", call.sid);
    res.send(`✅ Call initiated. SID: ${call.sid}`);
  } catch (error) {
    console.error("❌ Error starting call:", error.message);
    res.status(500).send("Failed to start call.");
  }
});


// Start the server
app.listen(port, () => {
  console.log(`✅ Server is live on port ${port}`);
});
