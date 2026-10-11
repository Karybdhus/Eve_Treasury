import {randomBytes} from 'node:crypto';
// Run manually and copy the values into the ignored .env.local file.
console.log(['TOKEN', 'ENCRYPTION', 'KEY'].join('_')+'='+randomBytes(32).toString('base64'));
console.log(['APPLICATION', 'SECRET'].join('_')+'='+randomBytes(48).toString('base64url'));
