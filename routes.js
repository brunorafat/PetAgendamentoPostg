const express = require('express');
const { db } = require('./database');
const router = express.Router();

// Appointments
router.get('/appointments', (req, res) => {
    db.all(`
        SELECT a.*, p.name as professional_name, s.duration 
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        LEFT JOIN services s ON a.service = s.name
        WHERE a.status = ? 
        ORDER BY a.date, a.time
    `, ['confirmed'], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

router.get('/appointments/professional/:id', (req, res) => {
    db.all(`
        SELECT a.*, p.name as professional_name, s.duration 
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        LEFT JOIN services s ON a.service = s.name
        WHERE a.status = ? AND a.professional_id = ?
        ORDER BY a.date, a.time
    `, ['confirmed', req.params.id], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

router.get('/appointments/:date', (req, res) => {
    const { date } = req.params;
    db.all(
        'SELECT * FROM appointments WHERE date = ? AND status = ?',
        [date, 'confirmed'],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows);
            }
        }
    );
});

router.post('/appointments', (req, res) => {
    const { pet_name, owner_name, phone, service, date, time, professional_id } = req.body;
    
    db.run(
        `INSERT INTO appointments (pet_name, owner_name, phone, service, date, time, status, professional_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [pet_name, owner_name, phone, service, date, time, 'confirmed', professional_id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ id: this.lastID, message: 'Appointment created successfully' });
            }
        }
    );
});

router.put('/appointments/:id', (req, res) => {
    const { pet_name, owner_name, phone, service, date, time, status, professional_id } = req.body;
    db.run(
        `UPDATE appointments 
         SET pet_name = ?, owner_name = ?, phone = ?, service = ?, date = ?, time = ?, status = ?, professional_id = ?
         WHERE id = ?`,
        [pet_name, owner_name, phone, service, date, time, status, professional_id, req.params.id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ changes: this.changes });
            }
        }
    );
});

router.delete('/appointments/:id', (req, res) => {
    db.run('DELETE FROM appointments WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

// Services
router.get('/services', (req, res) => {
    db.all('SELECT id, name, price, duration FROM services', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

router.post('/services', (req, res) => {
    const { name, price, duration } = req.body;
    db.run('INSERT INTO services (name, price, duration) VALUES (?, ?, ?)', [name, price, duration], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID });
        }
    });
});

router.put('/services/:id', (req, res) => {
    const { name, price, duration } = req.body;
    db.run('UPDATE services SET name = ?, price = ?, duration = ? WHERE id = ?', [name, price, duration, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

router.delete('/services/:id', (req, res) => {
    db.run('DELETE FROM services WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

// Professionals
router.get('/professionals', (req, res) => {
    db.all('SELECT * FROM professionals', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

router.post('/professionals', (req, res) => {
    const { name } = req.body;
    db.run('INSERT INTO professionals (name) VALUES (?)', [name], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID });
        }
    });
});

router.put('/professionals/:id', (req, res) => {
    const { name } = req.body;
    db.run('UPDATE professionals SET name = ? WHERE id = ?', [name, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

router.delete('/professionals/:id', (req, res) => {
    db.run('DELETE FROM professionals WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

// Customers
router.get('/customers', (req, res) => {
    const query = `
        SELECT 
            c.id, 
            c.phone, 
            c.owner_name, 
            GROUP_CONCAT(p.name, ', ') AS pet_names
        FROM customers c
        LEFT JOIN pets p ON c.id = p.customer_id
        GROUP BY c.id, c.phone, c.owner_name
        ORDER BY c.owner_name
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

router.post('/customers', (req, res) => {
    const { owner_name, phone, pet_name } = req.body;
    let fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

    db.get('SELECT * FROM customers WHERE phone = ?', [fullPhone], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            return res.status(409).json({ error: 'Este número de telefone já está cadastrado.' });
        }

        db.run('INSERT INTO customers (owner_name, phone) VALUES (?, ?)', [owner_name, fullPhone], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const customerId = this.lastID;
            db.run('INSERT INTO pets (customer_id, name) VALUES (?, ?)', [customerId, pet_name], function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: customerId });
            });
        });
    });
});

router.put('/customers/:id', (req, res) => {
    const { owner_name, phone, pet_name } = req.body;
    db.run('UPDATE customers SET owner_name = ?, phone = ? WHERE id = ?', [owner_name, phone, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            db.run('UPDATE pets SET name = ? WHERE customer_id = ?', [pet_name, req.params.id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ changes: this.changes });
                }
            });
        }
    });
});

router.delete('/customers/:id', (req, res) => {
    db.run('DELETE FROM customers WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ changes: this.changes });
        }
    });
});

// Date Settings
router.get('/date-settings', (req, res) => {
    db.get('SELECT * FROM date_settings WHERE id = 1', [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({
                id: row.id,
                config: JSON.parse(row.config),
                updated_at: row.updated_at
            });
        } else {
            // Retorna configuração padrão se não existir
            const defaultConfig = {
                daysToShow: 5,
                excludeWeekends: true,
                excludedDays: [0],
                startFromTomorrow: true
            };
            res.json({ id: 1, config: defaultConfig });
        }
    });
});

router.put('/date-settings', (req, res) => {
    const { config } = req.body;
    db.run(
        'INSERT OR REPLACE INTO date_settings (id, config, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)',
        [JSON.stringify(config)],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Date settings updated successfully' });
            }
        }
    );
});

// Time Settings
router.get('/time-settings', (req, res) => {
    db.get('SELECT * FROM time_settings WHERE id = 1', [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({
                id: row.id,
                config: JSON.parse(row.config),
                updated_at: row.updated_at
            });
        } else {
            // Retorna configuração padrão se não existir
            const defaultConfig = {
                startTime: '09:00',
                endTime: '17:00',
                interval: 60,
                lunchBreak: {
                    start: '12:00',
                    end: '13:00'
                }
            };
            res.json({ id: 1, config: defaultConfig });
        }
    });
});

router.put('/time-settings', (req, res) => {
    const { config } = req.body;
    db.run(
        'INSERT OR REPLACE INTO time_settings (id, config, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)',
        [JSON.stringify(config)],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Time settings updated successfully' });
            }
        }
    );
});

// Reminder Settings
router.get('/reminder-settings', (req, res) => {
    db.get('SELECT * FROM reminder_settings WHERE id = 1', [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({
                id: row.id,
                reminder_interval: row.reminder_interval,
                updated_at: row.updated_at
            });
        } else {
            // Retorna configuração padrão se não existir
            const defaultConfig = {
                reminder_interval: 24
            };
            res.json({ id: 1, config: defaultConfig });
        }
    });
});

router.put('/reminder-settings', (req, res) => {
    const { reminder_interval } = req.body;
    db.run(
        'INSERT OR REPLACE INTO reminder_settings (id, reminder_interval, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)',
        [reminder_interval],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Reminder settings updated successfully' });
            }
        }
    );
});

// Stats
router.get('/stats', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    db.get(
        `SELECT 
            COUNT(CASE WHEN date = ? AND status = 'confirmed' THEN 1 END) as today,
            COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as total,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
         FROM appointments`,
        [today],
        (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(row);
            }
        }
    );
});

router.post('/webhook', (req, res) => {
    const { data } = req.body;

    if (data && data.message && data.message.button_reply) {
        const buttonId = data.message.button_reply.id;
        const [action, appointmentId] = buttonId.split('_');

        if (action === 'confirm') {
            // Handle confirmation
            db.run('UPDATE appointments SET status = ? WHERE id = ?', ['confirmed', appointmentId], function(err) {
                if (err) {
                    console.error('Error confirming appointment:', err.message);
                } else {
                    console.log(`Appointment ${appointmentId} confirmed.`);
                    // Optionally, send a confirmation message back to the user
                }
            });
        } else if (action === 'cancel') {
            // Handle cancellation
            db.run('UPDATE appointments SET status = ? WHERE id = ?', ['canceled', appointmentId], function(err) {
                if (err) {
                    console.error('Error canceling appointment:', err.message);
                } else {
                    console.log(`Appointment ${appointmentId} canceled.`);
                    // Optionally, send a cancellation message back to the user
                }
            });
        }
    }

    res.sendStatus(200);
});

module.exports = router;

