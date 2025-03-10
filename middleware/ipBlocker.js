// middleware/ipBlocker.js

const BannedIP = require('../models/BannedIP');

async function ipBlocker(req, res, next) {
  //  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ip = app.set('trust proxy', true), req.ip
   
    const banned = await BannedIP.findOne({ ip });
    if (banned) {
        res.status(403).send('Your IP has been banned.');
    } else {
        next();
    }
}

module.exports = ipBlocker;
