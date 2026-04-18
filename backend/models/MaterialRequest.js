const mongoose = require('mongoose');

const MaterialRequestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    materialName: { type: String, required: true },
    quantity: { type: Number, required: true },
    requestId: { type: String, required: true, unique: true },

    // Status flow: Pending → Approved → PendingReturn → Closed | Rejected | Penalized
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'PendingReturn', 'Closed', 'Penalized'],
        default: 'Pending'
    },

    // Photo submitted when creating the request (reference/initial)
    photoUrl: { type: String },

    // Photo submitted by employee AFTER admin approval (proof of pickup from warehouse)
    pickupPhotoUrl: { type: String },
    pickupTime: { type: Date },

    // Photo submitted by employee when returning the material to warehouse
    returnPhotoUrl: { type: String },
    returnTime: { type: Date },

    // Due date to return the material (set by admin on approval, default 7 days)
    dueDate: { type: Date },

    // Penalty info
    penalty: { type: String },
    penaltyIssuedAt: { type: Date },

    rejectionReason: { type: String },
    adminComment: { type: String },
    inTime: { type: Date, default: Date.now },
    outTime: { type: Date },
    insufficientStock: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MaterialRequest', MaterialRequestSchema);
