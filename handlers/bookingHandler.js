const { db } = require('../database');

function getServicesMessage(services) {
    let msg = `Qual serviço deseja agendar?\n\nDigite o número correspondente ao serviço que deseja agendar, ou digite *voltar*:\n\n`;
    services.forEach(service => {
        msg += `*${service.id}* - ${service.name}\n`;
    });
    
    return msg;
}

async function handleServiceSelection(session, message, services, professionals) {
    const serviceId = parseInt(message);
    const service = services.find(s => s.id === serviceId);

    if (service) {
        session.tempData.service = service.name;
        session.tempData.price = service.price;
        if (session.tempData.petName) {
            session.state = 'booking_professional';
            return getProfessionalsMessage(professionals);
        } else {
            session.state = 'booking_pet_name';
            return 'Qual o nome do seu pet?';
        }
    }
    
    return 'Por favor, digite um número válido do serviço ou *voltar* para retornar ao menu.';
}

function getPetsMessage(pets) {
    let msg = `Qual dos seus pets deseja agendar?\n\n`;
    pets.forEach((pet, index) => {
        msg += `*${index + 1}* - ${pet.name}\n`;
    });
    msg += `\n*0* - Adicionar outro pet`;
    return msg;
}

async function handlePetSelection(session, message, pets, services) {
    const selection = parseInt(message);
    if (selection === 0) {
        session.state = 'add_pet';
        return 'Qual o nome do novo pet?';
    }

    const pet = pets[selection - 1];

    if (pet) {
        session.tempData.petName = pet.name;
        session.state = 'booking_service';
        return getServicesMessage(services);
    }

    return 'Por favor, digite um número válido da lista de pets.';
}

async function handleNewCustomer(session, message, phone, saveCustomer) {
    session.tempData.ownerName = message;
    const customerId = await saveCustomer(phone, session.tempData.ownerName);
    session.tempData.customerId = customerId;
    session.state = 'add_pet';
    return 'Ótimo! Agora, qual o nome do seu pet?';
}

async function handleAddPet(session, message, phone, saveCustomer, savePet, services) {
    session.tempData.petName = message;
    
    // If customer doesn't exist yet, create it now
    if (!session.tempData.customerId) {
        const customerId = await saveCustomer(phone, session.tempData.ownerName);
        session.tempData.customerId = customerId;
    }

    await savePet(session.tempData.customerId, session.tempData.petName);
    
    session.state = 'booking_service';
    return getServicesMessage(services);
}

function getProfessionalsMessage(professionals) {
    let msg = `Com qual profissional deseja agendar?\n\n`;
    professionals.forEach(prof => {
        msg += `*${prof.id}* - ${prof.name}\n`;
    });
    return msg;
}

async function handleProfessionalSelection(session, message, professionals) {
    const professionalId = parseInt(message);
    const professional = professionals.find(p => p.id === professionalId);

    if (professional) {
        session.tempData.professionalId = professional.id;
        session.tempData.professionalName = professional.name;
        console.log(`Professional selected: ${session.tempData.professionalName}, ID: ${session.tempData.professionalId}`);
        session.state = 'booking_date';
        return await getAvailableDatesMessage(session.tempData.professionalId, session.tempData.service);
    }

    return 'Por favor, digite um número válido do profissional.';
}

async function getAvailableDatesMessage(professionalId, serviceName) {
    if (!professionalId || !serviceName) {
        console.error('professionalId or serviceName is undefined in getAvailableDatesMessage');
        return 'Ocorreu um erro ao buscar as datas disponíveis. Por favor, tente novamente mais tarde.';
    }
    const dates = await getAvailableDates(professionalId, serviceName);
    let msg = `Qual a data que deseja marcar?\nDigite em qual data deseja agendar, *6* para outras datas ou *voltar*:\n\n`;
    dates.forEach((date, index) => {
        msg += `*${index + 1}* - ${date.dayName}\n`;
        msg += `${date.display}\n\n`;
    });
    
    msg += `*6* - Data específica\ninformar outra data`;
    
    return msg;
}

async function getAvailableDates(professionalId, serviceName) {
    return new Promise((resolve, reject) => {
        // Primeiro, tenta buscar configurações personalizadas do banco
        db.get('SELECT * FROM date_settings WHERE id = 1', [], async (err, settings) => {
            if (err) {
                console.error('Error loading date settings:', err);
                // Se houver erro, usa configuração padrão
                resolve(await getDefaultAvailableDates(professionalId, serviceName));
            } else if (settings) {
                // Se existem configurações personalizadas, usa elas
                const config = JSON.parse(settings.config);
                resolve(await generateDatesFromConfig(config, professionalId, serviceName));
            } else {
                // Se não existem configurações, usa padrão
                resolve(await getDefaultAvailableDates(professionalId, serviceName));
            }
        });
    });
}

async function getDefaultAvailableDates(professionalId, serviceName) {
    const dates = [];
    const today = new Date();
    const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
                   'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    
    // Amanhã
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDateString = tomorrow.toISOString().split('T')[0];
    if (await hasAvailableSlotsForDate(tomorrowDateString, professionalId, serviceName)) {
        dates.push({
            date: tomorrowDateString,
            dayName: 'Amanhã',
            display: `${tomorrow.getDate().toString().padStart(2, '0')} de ${months[tomorrow.getMonth()]}`
        });
    }
    
    // Próximos dias úteis (excluindo domingos)
    for (let i = 2; i <= 5; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        if (date.getDay() !== 0) { // Não incluir domingos
            const dateString = date.toISOString().split('T')[0];
            if (await hasAvailableSlotsForDate(dateString, professionalId, serviceName)) {
                dates.push({
                    date: dateString,
                    dayName: days[date.getDay()],
                    display: `${date.getDate().toString().padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}`
                });
            }
        }
    }
    
    return dates;
}

async function generateDatesFromConfig(config, professionalId, serviceName) {
    const dates = [];
    const today = new Date();
    const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
                   'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    
    const daysToShow = config.daysToShow || 5;
    const excludeWeekends = config.excludeWeekends || false;
    const excludedDays = config.excludedDays || []; // Array de números (0=domingo, 1=segunda, etc.)
    const startFromTomorrow = config.startFromTomorrow !== false; // Default true
    
    let daysAdded = 0;
    let dayOffset = startFromTomorrow ? 1 : 0;
    
    while (daysAdded < daysToShow) {
        const date = new Date(today);
        date.setDate(today.getDate() + dayOffset);
        
        const dayOfWeek = date.getDay();
        
        // Verifica se deve excluir este dia
        let shouldExclude = false;
        
        if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
            shouldExclude = true;
        }
        
        if (excludedDays.includes(dayOfWeek)) {
            shouldExclude = true;
        }
        
        const dateString = date.toISOString().split('T')[0];

        if (!shouldExclude && await hasAvailableSlotsForDate(dateString, professionalId, serviceName)) {
            let dayName;
            if (dayOffset === 0) {
                dayName = 'Hoje';
            } else if (dayOffset === 1) {
                dayName = 'Amanhã';
            } else {
                dayName = days[dayOfWeek];
            }
            dates.push({
                date: dateString,
                dayName: dayName,
                display: `${date.getDate().toString().padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}`
            });
            daysAdded++;
        }
        
        dayOffset++;
    }
    
    return dates;
}

async function handleDateSelection(session, message) {
    const index = parseInt(message) - 1;
    const dates = await getAvailableDates(session.tempData.professionalId, session.tempData.service);

    if (message === '6') {
        return 'Por favor, informe a data desejada no formato DD/MM/AAAA:';
    }

    if (dates[index]) {
        session.tempData.date = dates[index].date;
        session.tempData.dateDisplay = `${dates[index].dayName}, ${dates[index].display}`;
        session.state = 'booking_time';
        
        return await getAvailableTimesMessage(session.tempData.date, session.tempData.dateDisplay, session.tempData.professionalId, session.tempData.service);
    }
    
    if (message.includes('/')) {
        const parts = message.split('/');
        if (parts.length === 3) {
            const date = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
            const today = new Date();
            
            if (date < today) {
                return 'Não é possível agendar para datas passadas. Por favor, escolha uma data futura.';
            }
            
            session.tempData.date = date.toISOString().split('T')[0];
            session.tempData.dateDisplay = message;
            session.state = 'booking_time';
            return await getAvailableTimesMessage(session.tempData.date, message, session.tempData.professionalId);
        }
    }
    
    return 'Por favor, escolha uma data válida da lista ou digite *voltar*.';
}

async function getAvailableTimesMessage(date, dateDisplay, professionalId, serviceName) {
    const times = await getAvailableTimeSlots(date, professionalId, serviceName);
    if (times.length === 0) {
        return 'Não há horários disponíveis para esta data com este profissional. Por favor, escolha outra data.';
    }

    let msg = `Agendamento em: *${dateDisplay}*\nPor favor digite uma das opções de horário abaixo ou *voltar*:\n\n`;
    times.forEach((time, index) => {
        msg += `*${index + 1}* - ${time}\n`;
    });
    
    return msg;
}

async function getAvailableTimeSlots(date, professionalId, serviceName) {
    return new Promise(async (resolve, reject) => {
        // Get service duration
        const service = await new Promise((res, rej) => {
            db.get('SELECT duration FROM services WHERE name = ?', [serviceName], (err, s) => {
                if (err) rej(err);
                else res(s);
            });
        });
        const serviceDuration = service ? service.duration : 60; // Default to 60 minutes if not found

        // Primeiro busca configurações de horários personalizadas
        db.get('SELECT * FROM time_settings WHERE id = 1', [], (err, settings) => {
            if (err) {
                console.error('Error loading time settings:', err);
                // Se houver erro, usa horários padrão
                checkAvailability(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], date, professionalId, serviceDuration, resolve, reject);
            } else if (settings) {
                // Se existem configurações personalizadas, usa elas
                const config = JSON.parse(settings.config);
                
                const dayOfWeek = new Date(date).getUTCDay();
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const dayConfig = config[days[dayOfWeek]];

                if (!dayConfig) {
                    // Shop is closed on this day
                    resolve([]);
                    return;
                }

                const timeSlots = generateTimeSlots(dayConfig);
                checkAvailability(timeSlots, date, professionalId, serviceDuration, resolve, reject);
            } else {
                // Se não existem configurações, usa padrão
                checkAvailability(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], date, professionalId, serviceDuration, resolve, reject);
            }
        });
    });
}

function generateTimeSlots(config) {
    const slots = [];
    const startTime = config.startTime || '09:00';
    const endTime = config.endTime || '22:00';
    const interval = config.interval || 60; // minutos
    const lunchBreak = config.lunchBreak || null; // {start: '12:00', end: '13:00'}
    
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let currentTime = new Date();
    currentTime.setHours(startHour, startMinute, 0, 0);
    
    const endDateTime = new Date();
    endDateTime.setHours(endHour, endMinute, 0, 0);
    
    while (currentTime <= endDateTime) {
        const timeString = currentTime.toTimeString().slice(0, 5);
        
        // Verifica se está no horário de almoço
        if (lunchBreak) {
            const [lunchStartHour, lunchStartMinute] = lunchBreak.start.split(':').map(Number);
            const [lunchEndHour, lunchEndMinute] = lunchBreak.end.split(':').map(Number);
            
            const lunchStart = new Date();
            lunchStart.setHours(lunchStartHour, lunchStartMinute, 0, 0);
            
            const lunchEnd = new Date();
            lunchEnd.setHours(lunchEndHour, lunchEndMinute, 0, 0);
            
            if (currentTime >= lunchStart && currentTime < lunchEnd) {
                currentTime.setMinutes(currentTime.getMinutes() + interval);
                continue;
            }
        }
        
        slots.push(timeString);
        currentTime.setMinutes(currentTime.getMinutes() + interval);
    }
    
    return slots;
}

function checkAvailability(allSlots, date, professionalId, serviceDuration, resolve, reject) {
    console.log(`Checking availability for date: ${date}, professional: ${professionalId}, serviceDuration: ${serviceDuration}`);
    console.log(`All potential slots: ${allSlots}`);
    db.all('SELECT time, service FROM appointments WHERE date = ? AND professional_id = ? AND status = ?', [date, professionalId, 'confirmed'], async (err, rows) => {
        if (err) {
            console.error('Error loading appointments:', err);
            reject(err);
        } else {
            console.log(`Booked appointments found for ${date} and professional ${professionalId}:`, rows);
            const bookedTimeRanges = [];
            const slotDate = new Date(date + 'T00:00:00'); // Define slotDate once
            for (const row of rows) {
                const bookedService = await new Promise((res, rej) => {
                    db.get('SELECT duration FROM services WHERE name = ?', [row.service], (e, s) => {
                        if (e) rej(e);
                        else res(s);
                    });
                });
                const bookedDuration = bookedService ? bookedService.duration : 60; // Default to 60 minutes
                
                const [bookedHour, bookedMinute] = row.time.split(':').map(Number);
                const bookedStart = new Date(slotDate); // Use slotDate here
                bookedStart.setHours(bookedHour, bookedMinute, 0, 0);
                const bookedEnd = new Date(bookedStart.getTime() + bookedDuration * 60 * 1000);
                bookedTimeRanges.push({ start: bookedStart, end: bookedEnd });
            }
            console.log(`Booked time ranges: ${JSON.stringify(bookedTimeRanges.map(r => ({ start: r.start.toTimeString().slice(0, 5), end: r.end.toTimeString().slice(0, 5) })))}`);

            const availableSlots = [];
            const now = new Date();
            
            // const slotDate = new Date(date + 'T00:00:00'); // Already defined above
            const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            const isToday = slotDate.getTime() === nowDate.getTime();

            for (const slot of allSlots) {
                const [slotHour, slotMinute] = slot.split(':').map(Number);
                
                const slotTime = new Date(slotDate);
                slotTime.setHours(slotHour, slotMinute, 0, 0);

                if (isToday && slotTime.getTime() < now.getTime()) {
                    continue; 
                }

                const slotEnd = new Date(slotTime.getTime() + serviceDuration * 60 * 1000);

                let isAvailable = true;
                for (const bookedRange of bookedTimeRanges) {
                    if (slotTime < bookedRange.end && slotEnd > bookedRange.start) {
                        isAvailable = false;
                        break;
                    }
                }
                if (isAvailable) {
                    availableSlots.push(slot);
                }
            }
            console.log(`Available slots for ${date}: ${availableSlots}`);
            resolve(availableSlots);
        }
    });
}

async function handleTimeSelection(session, message) {
    const index = parseInt(message) - 1;
    const times = await getAvailableTimeSlots(session.tempData.date, session.tempData.professionalId, session.tempData.service);

    if (times[index]) {
        session.tempData.time = times[index];
        session.state = 'booking_confirm';
        
        return getConfirmationMessage(session);
    }
    
    return 'Por favor, escolha um horário válido da lista ou digite *voltar*.';
}

function getConfirmationMessage(session) {
    const [year, month, day] = session.tempData.date.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    
    return `Confirmar dados\nDATA: ${formattedDate} às ${session.tempData.time}\nServiço: ${session.tempData.service}\nPet: ${session.tempData.petName}\nTutor: ${session.tempData.ownerName}\nProfissional: ${session.tempData.professionalName}\n\n*1* - Sim\n*2* - Não`;
}

async function hasAvailableSlotsForDate(date, professionalId, serviceName) {
    const availableTimes = await getAvailableTimeSlots(date, professionalId, serviceName);
    return availableTimes.length > 0;
}

async function confirmBooking(session, message, phone) {
    console.log('Iniciando confirmBooking'); // Adicionado para depuração
    if (message === '1') {
        console.log('Chamando saveAppointment'); // Adicionado para depuração
        const appointment = await saveAppointment({
            pet_name: session.tempData.petName || 'Não informado',
            owner_name: session.tempData.ownerName || 'Cliente',
            phone: phone,
            service: session.tempData.service,
            date: session.tempData.date,
            time: session.tempData.time,
            status: 'confirmed',
            professional_id: session.tempData.professionalId
        });

        const customer = await getCustomerByPhone(phone);
        if (!customer) {
            saveCustomer(phone, session.tempData.ownerName, session.tempData.petName);
        }

        const [year, month, day] = session.tempData.date.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        const confirmMessage = `✅ *Agendamento Confirmado!*\n\n📋 *Detalhes:*\n📅 Data: ${formattedDate}\n🕐 Horário: ${session.tempData.time}\n🛁 Serviço: ${session.tempData.service}\n🐾 Pet: ${session.tempData.petName}\n👤 Tutor: ${session.tempData.ownerName}\n💰 Valor: R$ ${session.tempData.price},00\n👩‍⚕️ Profissional: ${session.tempData.professionalName}\n\n📍 *Endereço:*\n${process.env.BUSINESS_ADDRESS || 'Rua Example, 123 - Centro'}\n\n*Código do agendamento:* #${appointment.id}\n\nVocê receberá um lembrete 1 dia antes! 📱`;

        session.state = 'menu';
        session.tempData = {};

        const newCustomer = await getCustomerByPhone(phone);
        return confirmMessage + '\n\n' + getMenuMessage(newCustomer);
    } else if (message === '2') {
        session.state = 'menu';
        session.tempData = {};
        const customer = await getCustomerByPhone(phone);
        return 'Agendamento cancelado. ' + getMenuMessage(customer);
    }
    
    return 'Por favor, digite *1* para confirmar ou *2* para cancelar.';
}

function saveAppointment(data) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO appointments (pet_name, owner_name, phone, service, date, time, status, professional_id) \n             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [data.pet_name, data.owner_name, data.phone, data.service, data.date, data.time, data.status, data.professional_id],
            function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
}

function saveCustomer(phone, ownerName, petName) {
    return new Promise((resolve, reject) => {
        getCustomerByPhone(phone)
            .then(customer => {
                if (customer) {
                    // Customer already exists, just resolve with the id
                    resolve({ id: customer.id });
                } else {
                    // Customer doesn't exist, insert new customer
                    db.run('INSERT INTO customers (phone, owner_name, pet_name) VALUES (?, ?, ?)', [phone, ownerName, petName], function(err) {
                        if (err) {
                            console.error('Error saving customer:', err);
                            reject(err);
                        }
                        else {
                            console.log(`New customer saved: ${ownerName}`);
                            resolve({ id: this.lastID });
                        }
                    });
                }
            })
            .catch(err => {
                reject(err);
            });
    });
}

function getCustomerByPhone(phone) {
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

function getMenuMessage(customer) {
    const { getMenuMessage: utilsGetMenuMessage } = require('../utils');
    return utilsGetMenuMessage(customer);
}

module.exports = {
    getServicesMessage,
    handleServiceSelection,
    getProfessionalsMessage,
    handleProfessionalSelection,
    getAvailableDatesMessage,
    handleDateSelection,
    getAvailableTimesMessage,
    handleTimeSelection,
    getConfirmationMessage,
    confirmBooking,
    getPetsMessage,
    handlePetSelection,
    handleNewCustomer,
    handleAddPet
};