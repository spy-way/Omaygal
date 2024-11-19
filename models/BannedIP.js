// models/BannedIP.js

const mongoose = require('mongoose');

const BannedIPSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    bannedAt: { type: Date, default: Date.now },
    reason: { type: String },
});

module.exports = mongoose.model('BannedIP', BannedIPSchema);
