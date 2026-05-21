require('dotenv').config();
const { sendEmail } = require('./backend/utils/mailer');

async function test() {
    console.log('Testing email configuration...');
    try {
        await sendEmail('managemadhura123@gmail.com', 'Test Email', 'This is a test email to verify credentials.');
        console.log('Test complete.');
    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

test();
