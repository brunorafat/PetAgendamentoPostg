const { db } = require('./database');

const { getServicesMessage, handleServiceSelection, handlePetNameSelection, handleOwnerNameSelection, getProfessionalsMessage, handleProfessionalSelection, getAvailableDatesMessage, handleDateSelection, getAvailableTimesMessage, handleTimeSelection, getConfirmationMessage, confirmBooking, getPetsMessage, handlePetSelection, handleAddPet, handleNewCustomer } = require('./handlers/bookingHandler');
const { cancelAppointment } = require('./handlers/cancelHandler');
const { getMenuMessage, capitalizeFirstLetter } = require('./utils');
const { getIntent } = require('./nlu');

class PetGroomingBot {
    constructor() {
        this.sessions = new Map();
        this.services = [];
        this.professionals = [];
        this.loadInitialData();
    }

    async loadInitialData() {
        await this.loadServices();
        await this.loadProfessionals();
    }

    async loadServices() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM services', [], (err, rows) => {
                if (err) {
                    console.error('Error loading services:', err);
                    reject(err);
                } else {
                    this.services = rows;
                    resolve();
                }
            });
        });
    }

    async loadProfessionals() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM professionals', [], (err, rows) => {
                if (err) {
                    console.error('Error loading professionals:', err);
                    reject(err);
                } else {
                    this.professionals = rows;
                    resolve();
                }
            });
        });
    }

    async getCustomerByPhone(phone) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM customers WHERE phone = ?', [phone], (err, row) => {
                if (err) {
                    console.error('Error getting customer:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getPetsByCustomerId(customerId) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM pets WHERE customer_id = ?', [customerId], (err, rows) => {
                if (err) {
                    console.error('Error getting pets:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async processMessage(phone, message, userName) {
        let session = await this.getSession(phone); // Make sure to await getSession

        if (session.paused_until && new Date(session.paused_until) > new Date()) {
            // Bot is paused for this session
            return ''; // Or a message like 'O atendente já foi notificado e entrará em contato em breve.'
        }
        
        const cleanMessage = message.toLowerCase().trim();
        let response = '';

        if (cleanMessage === 'voltar') {
            session.state = 'menu';
            session.tempData = {};
            this.saveSession(phone, session);
            const customer = await this.getCustomerByPhone(phone);
            return getMenuMessage(customer);
        }

        console.log(`Current session state for ${phone}: ${session.state}`);
        console.log(`Current session tempData for ${phone}: ${JSON.stringify(session.tempData)}`);

        // Intent classification for initial messages or when in 'menu' state
        if (session.state === 'menu') {
            switch (cleanMessage) {
                case '1':
                    await this.loadServices(); // Reload services data
                    await this.loadProfessionals(); // Reload professionals data
                    const customer = await this.getCustomerByPhone(phone);
                    if (customer) {
                        session.tempData.customerId = customer.id;
                        session.tempData.ownerName = customer.owner_name; // Set ownerName for existing customers
                        const pets = await this.getPetsByCustomerId(customer.id);
                        if (pets && pets.length > 0) {
                            session.state = 'select_pet';
                            return getPetsMessage(pets);
                        } else {
                            session.state = 'add_pet';
                            return 'Você não tem pets cadastrados. Qual o nome do seu pet?';
                        }
                    } else {
                        session.state = 'new_customer';
                        return 'Olá! Para começar, qual o seu nome?';
                    }
                case '2':
                    session.state = 'cancel_code';
                    return 'Por favor, informe o código do agendamento que deseja cancelar:';
                case '3':
                    const pausedUntil = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes from now
                    session.paused_until = pausedUntil.toISOString();
                    this.saveSession(phone, session); // Save the updated session with paused_until
                    return '📞 Um atendente entrará em contato em breve!\n\nNosso horário de atendimento:\n🕐 Seg-Sex: 8h às 18h\n🕐 Sábado: 8h às 12h\n\nO atendimento automático será pausado por 60 minutos.';
                default:
                    const defaultCustomer = await this.getCustomerByPhone(phone);
                    return getMenuMessage(defaultCustomer);
            }
        } else {
            // Handle messages based on current session state
            switch (session.state) {
                case 'new_customer':
                    session.tempData.ownerName = capitalizeFirstLetter(cleanMessage);
                    session.state = 'add_pet';
                    response = 'Ótimo! Agora, qual o nome do seu pet?';
                    break;
                case 'add_pet':
                    session.tempData.petName = capitalizeFirstLetter(cleanMessage);
                    if (!session.tempData.customerId) {
                        const customerId = await this.saveCustomer(phone, session.tempData.ownerName);
                        session.tempData.customerId = customerId;
                    }
                    await this.savePet(session.tempData.customerId, session.tempData.petName);
                    session.state = 'booking_service';
                    response = getServicesMessage(this.services);
                    break;
                case 'select_pet':
                    const pets = await this.getPetsByCustomerId(session.tempData.customerId);
                    const selection = parseInt(cleanMessage);
                    if (selection === 0) {
                        session.state = 'add_pet';
                        response = 'Qual o nome do novo pet?';
                    } else {
                        const pet = pets[selection - 1];
                        if (pet) {
                            session.tempData.petName = capitalizeFirstLetter(pet.name);
                            session.state = 'booking_service';
                            response = getServicesMessage(this.services);
                        } else {
                            response = 'Por favor, digite um número válido da lista de pets.';
                        }
                    }
                    break;
                case 'booking_service':
                    console.log(`Calling handleServiceSelection. session.tempData: ${JSON.stringify(session.tempData)}`);
                    response = await handleServiceSelection(session, cleanMessage, this.services, this.professionals);
                    break;
                case 'booking_pet_name':
                    response = await handlePetNameSelection(session, cleanMessage);
                    break;
                case 'booking_owner_name':
                    response = await handleOwnerNameSelection(session, cleanMessage, this.professionals);
                    break;
                case 'booking_professional':
                    console.log(`Calling handleProfessionalSelection. session.tempData: ${JSON.stringify(session.tempData)}`);
                    response = await handleProfessionalSelection(session, cleanMessage, this.professionals);
                    break;
                case 'booking_date':
                    console.log(`Calling handleDateSelection. session.tempData: ${JSON.stringify(session.tempData)}`);
                    response = await handleDateSelection(session, cleanMessage);
                    break;
                case 'booking_time':
                    console.log(`Calling handleTimeSelection. session.tempData: ${JSON.stringify(session.tempData)}`);
                    response = await handleTimeSelection(session, cleanMessage);
                    break;
                case 'booking_confirm':
                    response = await confirmBooking(session, cleanMessage, phone);
                    break;
                case 'cancel_code':
                    response = await cancelAppointment(session, cleanMessage);
                    break;
                case 'awaiting_reminder_response':
                    const appointmentId = session.tempData.appointmentId;
                    if (cleanMessage === '1') {
                        response = 'Obrigado pela confirmação!';
                        // Optionally, you might want to update the appointment status in the DB here
                        // e.g., mark it as 'confirmed_by_client'
                        session.state = 'menu';
                        session.tempData = {};
                    } else if (cleanMessage === '2') {
                        // Initiate cancellation process
                        response = await cancelAppointment(session, appointmentId); // Pass appointmentId to cancelHandler
                        session.state = 'menu';
                        session.tempData = {};
                    } else {
                        response = 'Por favor, digite 1 para confirmar ou 2 para cancelar o agendamento.';
                    }
                    break;
                default:
                    const defaultCustomer = await this.getCustomerByPhone(phone);
                    response = getMenuMessage(defaultCustomer);
                    session.state = 'menu';
            }
        }

        this.saveSession(phone, session);
        return response;
    }

    async getSession(phone) {
        if (!this.sessions.has(phone)) {
            // Try to load from DB
            const sessionData = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM chat_sessions WHERE phone = ?', [phone], (err, row) => {
                    if (err) {
                        console.error('Error loading session:', err);
                        reject(err);
                    } else {
                        if (row) {
                            row.temp_data = JSON.parse(row.temp_data || '{}');
                        }
                        resolve(row);
                    }
                });
            });

            if (sessionData) {
                this.sessions.set(phone, {
                    state: sessionData.state,
                    tempData: sessionData.temp_data,
                    paused_until: sessionData.paused_until
                });
            } else {
                this.sessions.set(phone, {
                    state: 'menu',
                    tempData: {},
                    paused_until: null
                });
            }
        }
        return this.sessions.get(phone);
    }

    saveSession(phone, session) {
        this.sessions.set(phone, session);
        db.run(
            `INSERT OR REPLACE INTO chat_sessions (phone, state, temp_data, updated_at, paused_until) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`,
            [phone, session.state, JSON.stringify(session.tempData), session.paused_until]
        );
    }

    // Database operations (still in bot.js as they are core to the bot's data management)
    async saveAppointment(data) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO appointments (pet_name, owner_name, phone, service, date, time, status, professional_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.pet_name, data.owner_name, data.phone, data.service, data.date, data.time, data.status, data.professional_id],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
    }

    async saveCustomer(phone, ownerName) {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO customers (phone, owner_name) VALUES (?, ?)', [phone, ownerName], function(err) {
                if (err) {
                    console.error('Error saving customer:', err);
                    reject(err);
                } else {
                    console.log(`New customer saved: ${ownerName}`);
                    resolve(this.lastID);
                }
            });
        });
    }

    async savePet(customerId, petName) {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO pets (customer_id, name) VALUES (?, ?)', [customerId, petName], function(err) {
                if (err) {
                    console.error('Error saving pet:', err);
                    reject(err);
                } else {
                    console.log(`New pet saved: ${petName}`);
                    resolve(this.lastID);
                }
            });
        });
    }
}

module.exports = PetGroomingBot;