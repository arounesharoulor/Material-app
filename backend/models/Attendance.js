const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String, // YYYY-MM-DD
        required: true
    },
    type: {
        type: String,
        enum: ['Present', 'Leave'],
        default: 'Present'
    },
    leaveType: {
        type: String,
        default: ''
    },
    reason: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    // ── Check-out / Work Completion ──────────────────────────
    checkInTime: { type: Date, default: Date.now },
    checkOutTime: { type: Date, default: null },
    checkOutStatus: {
        type: String,
        enum: ['NotRequired', 'PendingClose', 'ClosedApproved'],
        default: 'NotRequired'
    }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
