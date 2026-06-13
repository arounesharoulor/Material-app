require('dotenv').config({ path: 'd:/Material-app/backend/.env' });
const { sendEmail } = require('d:/Material-app/backend/utils/mailer.js');

(async () => {
    try {
        await sendEmail('managemadhura123@gmail.com', 'Test', 'Test email');
        console.log('Success');
    } catch (err) {
        console.error('Error:', err);
    }
})();
