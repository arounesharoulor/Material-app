const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    employeeId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Employee'], default: 'Employee' },
    profilePicture: { type: String },
    penaltyScore: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', UserSchema);
