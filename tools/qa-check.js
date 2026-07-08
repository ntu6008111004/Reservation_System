const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  throw new Error(message);
};

const gasFiles = fs.readdirSync(root).filter((file) => file.endsWith('.gs'));
for (const file of gasFiles) {
  new Function(read(file));
}

const client = read('Client.html');
const scriptMatch = client.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) fail('Client.html must contain one script block');
new Function(scriptMatch[1]);

for (const file of ['Index.html', 'Client.html', 'Styles.html']) {
  const content = read(file);
  if (/�|à¸|à¹/.test(content)) fail(`${file} may contain broken Thai encoding`);
}

const index = read('Index.html');
const styles = read('Styles.html');
const requiredIds = [
  'bookingForm',
  'loadingModal',
  'resultModal',
  'datePickerModal',
  'adminBookingsButton',
  'adminBookingTableBody',
  'adminRoomsButton',
  'adminRoomsGrid',
  'adminAuditButton',
  'adminAuditTableBody',
  'adminClearBookingDataButton',
  'diagnosticsButton'
];

for (const id of requiredIds) {
  if (!index.includes(`id="${id}"`)) fail(`Missing required element id: ${id}`);
  if (!client.includes(`getElementById('${id}')`) && !client.includes(`getElementById("${id}")`)) {
    fail(`Client does not bind required id: ${id}`);
  }
}

if (client.includes('showPicker')) fail('Client must not call showPicker inside Apps Script iframe');
if (!index.includes('data-admin-only hidden')) fail('Admin panels must be hidden before login');
if (!styles.includes('@media (max-width: 520px)')) fail('Missing small-device responsive breakpoint');
if (!styles.includes('overflow-wrap: anywhere')) fail('Missing long-text overflow protection');
if (!styles.includes('max-height: min(92vh, 760px)')) fail('Modal should be scrollable on short screens');

console.log(`QA checks passed (${gasFiles.length} Apps Script files, client JS, Thai encoding, required UI ids, responsive guards).`);
