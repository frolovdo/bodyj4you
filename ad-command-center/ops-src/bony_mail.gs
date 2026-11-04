/**
 * Send to Bony from the Ops website (bodyj4you-ops.netlify.app), from denis@bodyj4you.com with the Excel attached.
 * The website can't reach Gmail and Workspace has app passwords off, so this small web app sends it:
 *   Ops page -> Netlify function ops-api (bony_send, behind the Ops PIN) -> this web app (needs TOKEN) -> GmailApp.
 *
 * Setup (once), signed in as denis@bodyj4you.com:
 *  1. script.google.com > New project > name it "Ops Send to Bony" > paste this file over Code.gs > Save.
 *  2. Project Settings (gear) > Script properties > Add: TOKEN = vault ad-command-center/BONY_MAIL_TOKEN (copy it with: grep BONY_MAIL_TOKEN ~/bodyj4you/ad-command-center/.env | cut -d= -f2- | pbcopy).
 *  3. Run > testSelf once and allow Gmail access (it emails you one test with a small Excel).
 *  4. Deploy > New deployment > type Web app > Execute as: Me > Who has access: Anyone > Deploy.
 *     Copy the Web app URL (ends in /exec) and give it to Claude (it goes in Netlify env BONY_MAIL_URL).
 * Anyone with the URL still needs the TOKEN; without it nothing is sent.
 */
function doPost(e) {
  try {
    const m = JSON.parse(e.postData.contents || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || m.token !== token) return out_({ ok: false, error: 'bad token' });
    send_(m);
    return out_({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function send_(m) {
  const okAddr = function (s) { return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(s); };
  const to = (m.to || []).filter(okAddr), cc = (m.cc || []).filter(okAddr);
  if (!to.length) throw new Error('no recipient');
  if (!m.subject) throw new Error('no subject');
  const opt = { name: 'Denis', htmlBody: m.html || undefined, attachments: [] };
  if (cc.length) opt.cc = cc.join(',');
  (m.attachments || []).forEach(function (a) {
    opt.attachments.push(Utilities.newBlob(Utilities.base64Decode(a.content), a.mimeType, a.filename));
  });
  GmailApp.sendEmail(to.join(','), String(m.subject).slice(0, 300), m.text || '', opt);
}

function testSelf() {   // run once from the editor: authorizes Gmail and emails you a test
  const me = Session.getActiveUser().getEmail();
  const csv = Utilities.base64Encode('SKU,Qty\nTEST,1\n');
  send_({ to: [me], subject: '[TEST] Ops Send to Bony', text: 'Test from the Ops Send to Bony script.',
          attachments: [{ filename: 'test.csv', mimeType: 'text/csv', content: csv }] });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
