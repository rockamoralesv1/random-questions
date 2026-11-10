// Creates an invitation from the command line — used to make the first admin.
//
//   npm run invite -- someone@example.com --admin
//   heroku run -a <app> "npm run invite -- someone@example.com --admin"
//
// Emails the 1-hour, single-use link when RESEND_API_KEY/EMAIL_FROM are set;
// otherwise prints it here (only the person running this command sees it).
// Links point to APP_URL (required).
import '../env';
import { getRepository } from '../db';
import { createInvitation, inviteByEmail, normalizeEmail } from '../services/authService';
import { emailConfigured } from '../services/emailService';

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const role = args.includes('--admin') ? 'admin' : 'user';
  const appUrl = process.env.APP_URL;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npm run invite -- <email> [--admin]');
    process.exit(1);
  }
  if (!appUrl) {
    console.error('Set APP_URL (e.g. https://your-app.herokuapp.com) so the link points to the app.');
    process.exit(1);
  }

  const repo = getRepository();
  await repo.init();
  if (await repo.getUserByEmail(normalizeEmail(email))) {
    console.error(`${email} already has an account.`);
    process.exit(1);
  }

  if (emailConfigured()) {
    await inviteByEmail(email, role, null, appUrl);
    console.log(`Invitation (${role}) emailed to ${email}. The link expires in 1 hour.`);
  } else {
    const { token } = await createInvitation(email, role, null);
    console.log(`Email is not configured, so here is the ${role} invitation link for ${email}.`);
    console.log('It expires in 1 hour and works once. Open it yourself; do not share it:\n');
    console.log(`${appUrl.replace(/\/+$/, '')}/?invite=${encodeURIComponent(token)}\n`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Could not create the invitation:', err);
  process.exit(1);
});
