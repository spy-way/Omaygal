const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReportSchema = new Schema({
    callDuration: { type: Number },
    reportReason: { type: String },
    reporterSocketId: { type: String, required: true },
    reportedSocketId: { type: String, required: true },
    chatRoom: { type: String },
    videoRoom: { type: String },
    timestamp: { type: Date, default: Date.now },
    reporterIp: { type: String },
    reportedIp: { type: String },
    chatTranscript: [
        {
            sender: String,
            message: String,
            timestamp: Date,
        },
    ],
    // Optionally, include additional fields for video call, like duration
});

module.exports = mongoose.model('Report', ReportSchema);
