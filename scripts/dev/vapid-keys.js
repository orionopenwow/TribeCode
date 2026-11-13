#!/usr/bin/env node
// Prints a fresh Web Push (VAPID) key pair as environment variables for hosts whose files get wiped (Render's free
// plan): set both on the service and phones that turned on notifications keep getting them after the server sleeps.
// Usage: node scripts/dev/vapid-keys.js
'use strict';
const { generateVapid } = require('../../server/webpush');
const k = generateVapid();
console.log(`TRIBE_VAPID_PUBLIC=${k.publicKey}\nTRIBE_VAPID_PRIVATE=${k.privateKey}`);
