const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const { initDb, db } = require('./database');
const apiRoutes = require('./routes');
const PetGroomingBot = require('./bot');
const { initializeWhatsAppService, sendWhatsAppMessage, checkWhatsAppService } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3333;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database setup
initDb();

const bot = new PetGroomingBot();

// API Routes
app.use('/api', apiRoutes);

app.get('/api/status', async (req, res) => {
    const status = await checkWhatsAppService();
    res.json(status);
});

// Webhook Evolution API - Recebe mensagens
app.post('/webhook/evolution', async (req, res) => {
    try {
        const { event, instance, data } = req.body;

        if (event === 'messages.upsert') {
            const message = data.message;
            const phone = data.key.remoteJid.split('@')[0];
            const text = message.conversation || message.extendedTextMessage?.text || '';
            const userName = data.pushName || 'Cliente';

            if (text && !data.key.fromMe) {
                const response = await bot.processMessage(phone, text, userName);
                
                await sendWhatsAppMessage(phone, response);
                
                saveMessage(phone, text, 'user');
                saveMessage(phone, response, 'bot');
            }
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook interno - Recebe eventos do frontend
app.post('/webhook/pet-grooming', (req, res) => {
    const { type, booking, timestamp } = req.body;
    
    if (type === 'new_booking') {
        const message = `✅ Novo agendamento recebido!\n\nPet: ${booking.petName}\nTutor: ${booking.ownerName}\nServiço: ${booking.service}\nData: ${booking.date}\nHorário: ${booking.time}`;
        
        if (booking.phone) {
            sendWhatsAppMessage(booking.phone, message);
        }
    }
    
    res.json({ status: 'received' });
});

// Salvar mensagem no banco
function saveMessage(phone, message, type) {
    db.run(
        'INSERT INTO messages (phone, message, type) VALUES (?, ?, ?)',
        [phone, message, type],
        (err) => {
            if (err) console.error('Error saving message:', err);
        }
    );
}

// Servir o frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
    await initializeWhatsAppService();
    require('./scheduler')(bot);
    console.log(`📱 Webhook Evolution API: http://localhost:${PORT}/webhook/evolution`);
    console.log(`🔗 Webhook interno: http://localhost:${PORT}/webhook/pet-grooming`);
});
