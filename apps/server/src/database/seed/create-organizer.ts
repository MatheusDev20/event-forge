/*
 * ORG_* are answers to a one-off interactive command, not inputs to any turbo
 * task — declaring them in turbo.json would make them part of every build's
 * cache key for no reason.
 */
/* eslint-disable turbo/no-undeclared-env-vars */
import { NestFactory } from '@nestjs/core';
import { emailSchema, passwordSchema } from '@repo/contracts/identity';
import { createInterface } from 'node:readline';
import { AppModule } from '../../app.module';
import { CatalogService } from '../../modules/catalog';
import { IdentityService } from '../../modules/identity';

/**
 * Creates an organizer and its first admin — the one step no one can do from
 * the console, because adding people is something an organizer's admin does,
 * and a new organizer has none yet.
 *
 *   pnpm org:create
 *
 * Asks for the organizer's name and the admin's email. If that email already
 * has an account, the account is made admin of the new organizer as it is;
 * otherwise it asks for a name and password and creates one.
 *
 * For scripts, set ORG_NAME, ORG_ADMIN_EMAIL, and — for a new account —
 * ORG_ADMIN_NAME and ORG_ADMIN_PASSWORD. Anything unset is asked for.
 *
 * Boots the real application context rather than writing rows directly, so
 * the account and the membership are made by the same services the API uses.
 */
async function main(): Promise<void> {
  const organizerName = (
    process.env.ORG_NAME ?? (await ask('Organizer name: '))
  ).trim();
  if (!organizerName) throw new Error('Organizer name is required');

  const email = emailSchema.parse(
    process.env.ORG_ADMIN_EMAIL ?? (await ask('Admin email: ')),
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const identity = app.get(IdentityService);
    let account = await identity.findAccountByEmail(email);

    if (account) {
      console.log(`Using the existing account ${account.email}.`);
    } else {
      const name = (
        process.env.ORG_ADMIN_NAME ?? (await ask('Admin name: '))
      ).trim();
      if (!name) throw new Error('Admin name is required');

      const password = passwordSchema.parse(
        process.env.ORG_ADMIN_PASSWORD ??
          (await ask('Admin password (min 8 characters): ', { hidden: true })),
      );

      account = await identity.createAccount({
        name,
        email,
        password,
        role: 'organizer',
      });
    }

    const organizer = await app
      .get(CatalogService)
      .createOrganizerWithAdmin(organizerName, account.id);

    console.log(
      `Organizer "${organizer.name}" (${organizer.id}) created; ` +
        `${account.email} is its admin.`,
    );
  } finally {
    await app.close();
  }
}

/**
 * One line from stdin. `hidden` stops the terminal echoing what is typed, so
 * a password does not end up in someone's scrollback or screen share.
 */
function ask(question: string, { hidden = false } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (hidden) {
    // readline echoes through this method; swallowing everything after the
    // prompt is the standard way to mask input without a dependency.
    const internal = rl as unknown as { _writeToOutput: (s: string) => void };
    internal._writeToOutput = (text: string) => {
      if (text.includes(question)) process.stdout.write(text);
    };
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
