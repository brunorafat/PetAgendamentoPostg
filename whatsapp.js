const axios = require('axios');
require('dotenv').config();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

async function sendWhatsAppMessage(number, text, delay = 1000) {
    try {
        const cleanNumber = number.replace(/\D/g, '');
        
        if (cleanNumber.length < 10) {
            throw new Error(`Número de telefone inválido: ${number}`);
        }
        
        let formattedNumber = cleanNumber;
        if (!cleanNumber.startsWith('55')) {
            formattedNumber = '55' + cleanNumber;
        }
        
        const payload = {
            number: formattedNumber,
            text: text.trim(),
            delay: delay
        };
        
        console.log('Enviando mensagem WhatsApp:', payload);
        
        const response = await axios.post(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            timeout: 10000
        });
        
        console.log('Mensagem enviada com sucesso:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('Erro ao enviar mensagem WhatsApp:');
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers:', error.response.headers);
            
            if (error.response.data && error.response.data.response && error.response.data.response.message) {
                console.error('Mensagem de erro detalhada:', error.response.data.response.message);
            }
            
        } else if (error.request) {
            console.error('Erro de rede - sem resposta do servidor');
            console.error('Request:', error.request);
            
        } else {
            console.error('Erro na configuração:', error.message);
        }
        
        throw error;
    }
}

async function checkWhatsAppService() {
    try {
        const response = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
            headers: {
                'apikey': EVOLUTION_API_KEY
            },
            timeout: 5000
        });
        
        console.log('Status do serviço WhatsApp:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('Serviço WhatsApp não está respondendo:', error.message);
        return false;
    }
}

async function initializeWhatsAppService() {
    console.log('Verificando serviço WhatsApp...');
    
    const maxRetries = 5;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const status = await checkWhatsAppService();
            if (status && status.instance && status.instance.state === 'open') {
                console.log('✅ Serviço WhatsApp está rodando');
                return true;
            }
        } catch (error) {
            console.log(`Tentativa ${retries + 1}/${maxRetries} falhou`);
        }
        
        retries++;
        if (retries < maxRetries) {
            console.log('Aguardando 5 segundos antes da próxima tentativa...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    console.error('❌ Não foi possível conectar ao serviço WhatsApp após', maxRetries, 'tentativas');
    return false;
}

async function sendReminderMessage(appointment) {
    try {
        // Validação básica dos dados do appointment
        if (!appointment || !appointment.phone || !appointment.owner_name || !appointment.pet_name) {
            throw new Error('Dados do agendamento incompletos');
        }

        // Limpar e formatar o número
        const cleanNumber = appointment.phone.replace(/\D/g, '');
        let formattedNumber = cleanNumber;
        if (!cleanNumber.startsWith('55')) {
            formattedNumber = '55' + cleanNumber;
        }

        // Corrigindo a lógica das datas para não modificar a data original
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let when = 'em ' + appointment.date;
        if (appointment.date === today) {
            when = 'hoje';
        } else if (appointment.date === tomorrow) {
            when = 'amanhã';
        }

        const message = `Olá ${appointment.owner_name}! Lembrete do agendamento para ${appointment.pet_name} ${when} às ${appointment.time}.`;

        // Formato correto para Evolution API v2
        const payload = {
            number: formattedNumber,
            mediaMessage: {
                mediatype: "button",
                caption: message,
                footer: "PetCare Pro",
                buttons: [
                    {
                        buttonId: `confirm_${appointment.id}`,
                        buttonText: { displayText: "✅ Confirmar" },
                        type: 1
                    },
                    {
                        buttonId: `cancel_${appointment.id}`,
                        buttonText: { displayText: "❌ Cancelar" },
                        type: 1
                    }
                ]
            },
            options: {
                delay: 1200,
                presence: "composing"
            }
        };

        console.log('Enviando lembrete de agendamento (formato correto):', JSON.stringify(payload, null, 2));
        
        let response;
        try {
            // Tentar com endpoint de botões primeiro
            response = await axios.post(`${EVOLUTION_API_URL}/message/sendButtons/${EVOLUTION_INSTANCE}`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_KEY
                },
                timeout: 10000
            });
        } catch (buttonError) {
            console.log('Falha ao enviar com botões, tentando mensagem de texto simples...');
            
            // Fallback para mensagem de texto simples
            const textPayload = {
                number: formattedNumber,
                text: message + "\n\nPara responder:\n1️⃣ Digite *1* para CONFIRMAR\n2️⃣ Digite *2* para CANCELAR",
                delay: 1200
            };

            response = await axios.post(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, textPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_KEY
                },
                timeout: 10000
            });
        }
        
        console.log('Lembrete enviado com sucesso:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('Erro ao enviar lembrete de agendamento:', error);
        throw error;
    }
}

module.exports = {
    sendWhatsAppMessage,
    checkWhatsAppService,
    initializeWhatsAppService,
    sendReminderMessage
};