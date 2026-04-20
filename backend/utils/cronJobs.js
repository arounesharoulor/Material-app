const cron = require('node-cron');
const nodemailer = require('nodemailer');
const MaterialRequest = require('../models/MaterialRequest');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const setupCronJobs = (io) => {
    // Run every hour at the top of the hour: '0 * * * *'
    cron.schedule('0 * * * *', async () => {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Reminder window: 9 AM to 6 PM
        if (currentHour >= 9 && currentHour <= 18) {
            console.log(`[CRON] Hourly reminder started at ${now.toLocaleTimeString()}`);
            
            try {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                const pendingRequests = await MaterialRequest.find({
                    status: 'PendingReturn'
                });

                for (const request of pendingRequests) {
                    // 1. Send Email Alert
                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: request.employeeEmail,
                        subject: '🔔 Material Return Reminder',
                        text: `Hi ${request.employeeName},\n\nThis is your hourly reminder to return the material "${request.materialName}" before 6:00 PM today. Please ensure you capture a photo when returning the material.\n\nThank you!`
                    };

                    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                        try {
                            await transporter.sendMail(mailOptions);
                            console.log(`[MAIL] Reminder sent to ${request.employeeEmail}`);
                        } catch (mailErr) {
                            console.error(`[MAIL] Error:`, mailErr.message);
                        }
                    }

                    // 2. Send In-App Alert via Socket.io
                    if (io) {
                        io.emit('returnReminder', {
                            employeeId: request.employeeId,
                            materialName: request.materialName,
                            message: `⏰ Reminder: Please return "${request.materialName}" before 6:00 PM today.`
                        });
                    }
                }
            } catch (err) {
                console.error('[CRON] Error:', err);
            }
        }
    });

    console.log('✅ Cron jobs initialized: Hourly reminders (Mail + App) scheduled.');
};

module.exports = setupCronJobs;
