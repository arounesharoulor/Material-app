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

const setupCronJobs = () => {
    // Run every hour at the top of the hour: '0 * * * *'
    // For testing/demo, we can run it every 10 minutes: '*/10 * * * *'
    // But user asked for "every one hr"
    cron.schedule('0 * * * *', async () => {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Only send reminders between 9 AM and 6 PM (inclusive)
        // If it's 6 PM, they should have already returned it, but maybe one last reminder at 5:00 PM is enough.
        // User said "every one hr... handing over the material before 6 pm"
        if (currentHour >= 9 && currentHour < 18) {
            console.log(`Running hourly reminder cron job at ${now.toLocaleString()}`);
            
            try {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                // Find all requests that are PendingReturn and due today or later
                const pendingRequests = await MaterialRequest.find({
                    status: 'PendingReturn',
                    dueDate: { $gte: startOfToday }
                });

                for (const request of pendingRequests) {
                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: request.employeeEmail,
                        subject: 'Reminder: Return Material Before 6 PM',
                        text: `Hi ${request.employeeName},\n\nThis is an hourly reminder to return the material "${request.materialName}" before 6:00 PM today. Please ensure you upload or capture a photo when returning the material at the warehouse.\n\nThank you!`
                    };

                    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                        try {
                            await transporter.sendMail(mailOptions);
                            console.log(`Reminder sent to ${request.employeeEmail} for ${request.materialName}`);
                        } catch (mailErr) {
                            console.error(`Failed to send email to ${request.employeeEmail}:`, mailErr.message);
                        }
                    } else {
                        console.log(`[DEV MODE] Would send reminder to ${request.employeeEmail} for ${request.materialName}`);
                    }
                }
            } catch (err) {
                console.error('Error in cron job:', err);
            }
        }
    });

    console.log('Cron jobs initialized: Hourly reminders scheduled between 9 AM and 6 PM.');
};

module.exports = setupCronJobs;
