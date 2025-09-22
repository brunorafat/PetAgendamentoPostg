const cron = require('node-cron');
const { db } = require('./database');
const { sendReminderMessage } = require('./whatsapp');

// Set timezone
process.env.TZ = 'America/Sao_Paulo';

// Cache for reminder interval to avoid querying every minute
let cachedReminderInterval = null;
let lastIntervalCheck = 0;

module.exports = (bot) => {
    // Schedule a task to run every minute
    cron.schedule('* * * * *', async () => {
        console.log('Running a task every minute to check for appointment reminders.');

        try {
            // Get reminder interval (cache for 1 hour)
            const reminderInterval = await getReminderInterval();
            
            // Get current time in São Paulo timezone
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            console.log(`Checking appointments for ${today} at ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

            const appointments = await getAppointmentsForDay(today);
            
            for (const appointment of appointments) {
                await processAppointmentReminder(appointment, reminderInterval, now, bot);
            }
            
        } catch (error) {
            console.error('Error in cron task:', error);
        }
    });
};

async function getReminderInterval() {
    const now = Date.now();
    
    // Cache interval for 1 hour (3600000 ms)
    if (cachedReminderInterval && (now - lastIntervalCheck) < 3600000) {
        return cachedReminderInterval;
    }
    
    return new Promise((resolve, reject) => {
        db.get('SELECT reminder_interval FROM reminder_settings WHERE id = 1', (err, row) => {
            if (err) {
                console.error('Error getting reminder interval:', err);
                reject(err);
                return;
            }
            
            cachedReminderInterval = row ? row.reminder_interval : 24; // Default to 24 hours
            lastIntervalCheck = now;
            resolve(cachedReminderInterval);
        });
    });
}

async function processAppointmentReminder(appointment, reminderInterval, now, bot) {
    try {
        // Create appointment datetime in São Paulo timezone
        const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}:00-03:00`);
        const reminderTime = new Date(appointmentDateTime.getTime() - reminderInterval * 60 * 60 * 1000);
        
        console.log(`Appointment ${appointment.id}: ${appointmentDateTime.toLocaleString('pt-BR')} | Reminder time: ${reminderTime.toLocaleString('pt-BR')}`);
        
        // Check if it's time to send reminder
        const shouldSendReminder = now >= reminderTime && 
                                 now <= appointmentDateTime && // Allow reminders until appointment time
                                 !appointment.reminder_sent;
        
        if (shouldSendReminder) {
            console.log(`Sending reminder for appointment ${appointment.id}`);
            
            await sendReminderMessage(appointment);
            await markReminderAsSent(appointment.id);
            
            console.log(`Reminder sent for appointment ${appointment.id}`);

            // Set session state to awaiting_reminder_response
            let session = await bot.getSession(appointment.phone);
            session.state = 'awaiting_reminder_response';
            session.tempData = session.tempData || {};
            session.tempData.appointmentId = appointment.id;
            session.tempData.reminderSentAt = now.toISOString();
            
            await bot.saveSession(appointment.phone, session);
            console.log(`Session state for ${appointment.phone} set to awaiting_reminder_response`);
        }
        
    } catch (error) {
        console.error(`Failed to process reminder for appointment ${appointment.id}:`, error);
    }
}

function getAppointmentsForDay(date) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM appointments 
             WHERE date = ? AND status = 'confirmed' AND reminder_sent = 0
             ORDER BY time ASC`,
            [date],
            (err, rows) => {
                if (err) {
                    console.error('Database error getting appointments:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            }
        );
    });
}

function markReminderAsSent(appointmentId) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE appointments SET reminder_sent = 1, reminder_sent_at = datetime("now", "localtime") WHERE id = ?',
            [appointmentId],
            function(err) {
                if (err) {
                    console.error(`Database error marking reminder as sent for appointment ${appointmentId}:`, err);
                    reject(err);
                } else {
                    console.log(`Appointment ${appointmentId} marked as reminder sent`);
                    resolve();
                }
            }
        );
    });
}