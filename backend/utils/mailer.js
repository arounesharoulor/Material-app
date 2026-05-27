const https = require('https');

const EMAIL_USER = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'dohzspvemkycjkxj';

/**
 * Robust HTTPS POST helper using Node.js standard library
 */
const httpsPost = (url, data) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.error || `HTTP error ${res.statusCode}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${responseBody}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out after 15s'));
        });

        req.write(postData);
        req.end();
    });
};

/**
 * Send an email using Gmail via Vercel Serverless HTTPS Proxy
 */
const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Sending email to ${to} via Vercel HTTPS proxy...`);
        
        const result = await httpsPost('https://materialappmanager.vercel.app/api/send-email', {
            to,
            subject,
            text,
            user: EMAIL_USER,
            pass: EMAIL_PASS
        });

        if (result && result.success) {
            console.log(`[MAILER] ✅ Email sent to ${to}. MessageId: ${result.messageId}`);
            return result;
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (err) {
        console.error(`[MAILER] ❌ Failed to send email to ${to}:`, err.message);
        throw err;
    }
};

module.exports = { sendEmail };
