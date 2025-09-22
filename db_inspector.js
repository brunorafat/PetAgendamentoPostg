
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./petgrooming.db');

db.serialize(() => {
  db.all('SELECT * FROM appointments', [], (err, rows) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Appointments:', rows);
  });

  db.all('SELECT * FROM reminder_settings', [], (err, rows) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Reminder Settings:', rows);
  });
});

db.close();
