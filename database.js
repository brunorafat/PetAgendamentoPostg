const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || './petgrooming.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

const initDb = () => {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pet_name TEXT NOT NULL,
                owner_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                service TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                professional_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reminder_sent BOOLEAN DEFAULT 0,
                reminder_sent_at DATETIME DEFAULT NULL,
                FOREIGN KEY (professional_id) REFERENCES professionals (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL UNIQUE,
                state TEXT DEFAULT 'menu',
                temp_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                paused_until DATETIME DEFAULT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                duration INTEGER NOT NULL DEFAULT 60
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS professionals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL UNIQUE,
                owner_name TEXT NOT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS pets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                FOREIGN KEY (customer_id) REFERENCES customers (id)
            )
        `);

        // Nova tabela para configurações de datas disponíveis
        db.run(`
            CREATE TABLE IF NOT EXISTS date_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                config TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Nova tabela para configurações de horários disponíveis
        db.run(`
            CREATE TABLE IF NOT EXISTS time_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                config TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS reminder_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                reminder_interval INTEGER NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const services = [
            { id: 1, name: 'Banho', price: 40, duration: 60 },
            { id: 2, name: 'Banho E Tosa Higiênica', price: 60, duration: 90 },
            { id: 3, name: 'Banho E Tosa Máquina', price: 70, duration: 120 },
            { id: 4, name: 'Banho E Tosa Tesoura', price: 80, duration: 120 },
            { id: 5, name: 'Corte De Unhas', price: 20, duration: 30 },
            { id: 6, name: 'Hidratação Liso Perfeito', price: 100, duration: 60 },
            { id: 7, name: 'Hidratação Termoprotetor', price: 90, duration: 60 }
        ];

        const stmtServices = db.prepare('INSERT OR IGNORE INTO services (id, name, price, duration) VALUES (?, ?, ?, ?)');
        services.forEach(service => {
            stmtServices.run(service.id, service.name, service.price, service.duration);
        });
        stmtServices.finalize();

        const professionals = [
            { id: 1, name: 'Lais' },
            { id: 2, name: 'Bruno' },
            { id: 3, name: 'Carla' }
        ];

        const stmtProfessionals = db.prepare('INSERT OR IGNORE INTO professionals (id, name) VALUES (?, ?)');
        professionals.forEach(professional => {
            stmtProfessionals.run(professional.id, professional.name);
        });
        stmtProfessionals.finalize();

        // Configurações padrão para datas
        const defaultDateConfig = {
            daysToShow: 5,
            excludeWeekends: true,
            excludedDays: [0], // Domingo
            startFromTomorrow: true
        };

        db.run('INSERT OR IGNORE INTO date_settings (id, config) VALUES (1, ?)', 
            [JSON.stringify(defaultDateConfig)]);

        // Configurações padrão para horários
        const defaultTimeConfig = {
            "monday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "tuesday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "wednesday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "thursday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "friday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "saturday": { "startTime": "09:00", "endTime": "12:00", "interval": 60, "lunchBreak": null },
            "sunday": null
        };

        db.run('INSERT OR IGNORE INTO time_settings (id, config) VALUES (1, ?)', 
            [JSON.stringify(defaultTimeConfig)]);

        db.run('INSERT OR IGNORE INTO reminder_settings (id, reminder_interval) VALUES (1, ?)', 
            [24]);
    });
};

module.exports = { db, initDb };

