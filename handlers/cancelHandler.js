
const { db } = require('../database');

async function cancelAppointment(session, input) {
    let appointmentId;

    if (typeof input === 'number') {
        appointmentId = input;
    } else {
        appointmentId = input.replace('#', '');
    }
    
    return new Promise((resolve) => {
        db.run(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', appointmentId],
            function(err) {
                if (err || this.changes === 0) {
                    resolve('❌ Código de agendamento não encontrado. Verifique e tente novamente.');
                } else {
                    session.state = 'menu';
                    session.tempData = {};
                    resolve(`✅ Agendamento #${appointmentId} cancelado com sucesso!\n\nDigite *voltar* para retornar ao menu.`);
                }
            }
        );
    });
}

module.exports = { cancelAppointment };

module.exports = { cancelAppointment };
