require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Twilio } = require('twilio');
const fs = require('fs');
const app = express();

const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }));

// Voice Response for incoming or outbound call
app.post('/voice', async (req, res) => {
  const speech = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    // 1. Get GPT response
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Angela, a calm, friendly assistant for Apex Spark Media.' },
          { role: 'user', content: speech }
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

    // 2. Convert text to speech
    const elevenResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: responseText,
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

    // 3. Save audio
    fs.writeFileSync('response.mp3', elevenResponse.data);

    // 4. Respond to Twilio with audio
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.play(`${process.env.BASE_URL}/audio`);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('❌ Error in /voice:', error.message);
    const fallback = new Twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml');
    res.send(fallback.toString());
  }
});

// Serve audio file
app.get('/audio', (req, res) => {
  if (fs.existsSync('response.mp3')) {
    res.set('Content-Type', 'audio/mpeg');
    res.sendFile(__dirname + '/response.mp3');
  } else {
    res.status(404).send('Audio file not found.');
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// ✅ Trigger outbound call manually
app.get('/call-now', async (req, res) => {
  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,        // <-- Make sure this is defined in .env
      from: process.env.TWILIO_PHONE_NUMBER   // <-- Must be a Twilio voice number
    });

    console.log('📞 Outbound call started:', call.sid);
    res.send(`✅ Call initiated. SID: ${call.sid}`);
  } catch (error) {
    console.error('❌ Error starting call:', error.message);
    res.status(500).send('Failed to start call.');
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server is live on port ${port}`);
});
