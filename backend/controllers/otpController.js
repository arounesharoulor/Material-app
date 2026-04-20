const nodemailer = require('nodemailer');
const Otp = require('../models/Otp');
const crypto = require('crypto');

// Configure NodeMailer transporter
// Configure NodeMailer transporter with pooling for performance
const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true, // Enable SMTP pooling
    maxConnections: 5,
    maxMessages: 100,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.sendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }

    try {
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP to database (overwrite any existing for this email)
        await Otp.deleteMany({ email });
        const newOtp = new Otp({ email, otp });
        await newOtp.save();

        // Send Email logic
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Verification Code',
            text: `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            // Fire-and-forget email sending to prevent blocking the response
            transporter.sendMail(mailOptions).catch(err => {
                console.error('CRITICAL: Failed to deliver OTP email to', email, err.message);
            });
            
            // Respond immediately for better UX
            return res.json({ msg: 'Verification code sent to ' + email });
        } else {
            console.log('--- DEVELOPMENT MODE: OTP for ' + email + ' is ' + otp + ' ---');
            return res.json({ msg: 'OTP generated (Check server logs in dev mode)', devOtp: otp });
        }
    } catch (err) {
        console.error('OTP Controller Error:', err);
        res.status(500).json({ msg: 'Error processing verification' });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required' });
    }

    try {
        const otpRecord = await Otp.findOne({ email });

        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP expired or not found' });
        }

        if (otpRecord.attempts >= 3) {
            await Otp.deleteOne({ email });
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return res.status(400).json({ msg: 'Invalid OTP' });
        }

        // Success - Delete OTP record
        await Otp.deleteOne({ email });
        res.json({ success: true, msg: 'OTP verified successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error during verification' });
    }
};
