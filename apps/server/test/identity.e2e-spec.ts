import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/modules/catalog';
import { IdentityService } from '../src/modules/identity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * The console's way in: provisioned accounts, the session cookie, and the
 * member routes an organizer's admins provision people through.
 *
 * There is no signup to call, so the accounts and organizers a test starts
 * from are made the way `pnpm org:create` makes them — through the services
 * directly.
 * Everything is named per process so the suite never collides with itself or
 * a real dev account, and cleans up only what it made.
 */
const PREFIX = `e2e-identity-${process.pid}`;
const email = (name: string) => `${PREFIX}-${name}@example.test`;
const PASSWORD = 'longenough';

/** The `ef_session=...` pair from a response, ready to send back. */
function sessionCookie(response: request.Response): string {
  const header = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  const cookie = header.find((value) => value.startsWith('ef_session='));

  if (!cookie) throw new Error('No ef_session cookie was set');

  return cookie.split(';')[0];
}

describe('Identity (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const api = () => request(app.getHttpServer());

  /** An account made outside the API, as the org:create script does. */
  const provision = (name: string) =>
    app.get(IdentityService).createAccount({
      name,
      email: email(name.toLowerCase()),
      password: PASSWORD,
      role: 'organizer',
    });

  /** An organizer with `admin` as its first admin, as org:create makes it. */
  const organizerWithAdmin = async (label: string, admin: string) =>
    app
      .get(CatalogService)
      .createOrganizerWithAdmin(
        `${PREFIX} ${label}`,
        (await provision(admin)).id,
      );

  const login = async (name: string) =>
    sessionCookie(
      await api()
        .post('/api/v1/auth/login')
        .send({ email: email(name.toLowerCase()), password: PASSWORD })
        .expect(200),
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    // Memberships cascade from organizers; sessions cascade from accounts.
    await dataSource.query(`DELETE FROM "organizers" WHERE "name" LIKE $1`, [
      `${PREFIX}%`,
    ]);
    await dataSource.query(`DELETE FROM "accounts" WHERE "email" LIKE $1`, [
      `${PREFIX}-%`,
    ]);
    await app.close();
  });

  it('has no signup: nobody can create their own account', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Eve', email: email('eve'), password: PASSWORD })
      .expect(404);
  });

  it('logs a provisioned account in, with an httpOnly cookie and no password hash', async () => {
    const account = await provision('Ana');

    const response = await api()
      .post('/api/v1/auth/login')
      .send({ email: `  ${email('ana').toUpperCase()} `, password: PASSWORD })
      .expect(200);

    expect(response.body).toEqual({ account });

    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    await api()
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie(response))
      .expect(200)
      .expect({ account });
  });

  it('answers wrong password and unknown email identically', async () => {
    await provision('Caio');

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: email('caio'), password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await api()
      .post('/api/v1/auth/login')
      .send({ email: email('nobody'), password: 'wrong-password' })
      .expect(401);

    expect(wrongPassword.body.code).toBe('UNAUTHENTICATED');
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('refuses /auth/me and /organizers without a session, or with a made-up one', async () => {
    await api().get('/api/v1/auth/me').expect(401);
    await api().get('/api/v1/organizers').expect(401);

    const forged = await api()
      .get('/api/v1/auth/me')
      .set('Cookie', 'ef_session=not-a-real-token')
      .expect(401);
    expect(forged.body.code).toBe('UNAUTHENTICATED');
  });

  it('lets an organizer admin add people to their organizer, who can then sign in', async () => {
    const organizer = await organizerWithAdmin('Forge Live', 'Root');
    const admin = await login('Root');
    const members = `/api/v1/organizers/${organizer.id}/members`;

    const member = await api()
      .post(members)
      .set('Cookie', admin)
      .send({ name: 'Bia', email: email('bia'), password: PASSWORD })
      .expect(201);

    // `role` was omitted and defaults to member. The admin is not signed in
    // as Bia: a Set-Cookie on this response would be a bug.
    expect(member.body).toEqual({
      accountId: expect.any(String),
      name: 'Bia',
      email: email('bia'),
      role: 'member',
    });
    expect(member.headers['set-cookie']).toBeUndefined();

    const listed = await api().get(members).set('Cookie', admin).expect(200);
    expect(listed.body.items).toEqual([
      expect.objectContaining({ name: 'Root', role: 'admin' }),
      member.body,
    ]);

    const bia = await login('Bia');
    await api()
      .get('/api/v1/organizers')
      .set('Cookie', bia)
      .expect(200)
      .expect({
        items: [{ id: organizer.id, name: organizer.name, role: 'member' }],
      });
  });

  it("scopes admin to one organizer: another organizer's admin gets 403", async () => {
    const mine = await organizerWithAdmin('Mine', 'Mia');
    await organizerWithAdmin('Theirs', 'Theo');
    const theo = await login('Theo');
    const members = `/api/v1/organizers/${mine.id}/members`;

    const listing = await api().get(members).set('Cookie', theo).expect(403);
    expect(listing.body.code).toBe('FORBIDDEN');

    await api()
      .post(members)
      .set('Cookie', theo)
      .send({ name: 'Mole', email: email('mole'), password: PASSWORD })
      .expect(403);

    // The refusal came before anything was written.
    const [{ count }] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "accounts" WHERE "email" = $1`,
      [email('mole')],
    );
    expect(Number(count)).toBe(0);
  });

  it('keeps member management from plain members, the signed-out, and junk ids', async () => {
    const organizer = await organizerWithAdmin('Gated', 'Gwen');
    const gwen = await login('Gwen');
    const members = `/api/v1/organizers/${organizer.id}/members`;

    await api()
      .post(members)
      .set('Cookie', gwen)
      .send({ name: 'Max', email: email('max'), password: PASSWORD })
      .expect(201);
    const max = await login('Max');

    await api().get(members).set('Cookie', max).expect(403);
    await api().get(members).expect(401);
    await api()
      .get('/api/v1/organizers/not-a-uuid/members')
      .set('Cookie', gwen)
      .expect(403);
  });

  it('lets an admin promote on creation, and refuses an email that already has an account', async () => {
    const organizer = await organizerWithAdmin('Second', 'Ada');
    await provision('Taken');
    const ada = await login('Ada');
    const members = `/api/v1/organizers/${organizer.id}/members`;

    const coAdmin = await api()
      .post(members)
      .set('Cookie', ada)
      .send({
        name: 'Cora',
        email: email('cora'),
        password: PASSWORD,
        role: 'admin',
      })
      .expect(201);
    expect(coAdmin.body.role).toBe('admin');

    // The new admin can manage the same organizer straight away.
    await api()
      .get(members)
      .set('Cookie', await login('Cora'))
      .expect(200);

    const duplicate = await api()
      .post(members)
      .set('Cookie', ada)
      .send({ name: 'Again', email: email('taken'), password: PASSWORD })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');
  });

  it('shows an unassigned organizer account an empty list, not an error', async () => {
    await provision('Solo');

    await api()
      .get('/api/v1/organizers')
      .set('Cookie', await login('Solo'))
      .expect(200)
      .expect({ items: [] });
  });

  it('logs out: the session stops working, and logging out again is still a 204', async () => {
    await provision('Gil');
    const cookie = await login('Gil');

    const logout = await api()
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(String(logout.headers['set-cookie'])).toMatch(/ef_session=;/);

    await api().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
  });
});
