const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { pool } = require('../db');

async function linkOrCreateUser(provider, providerId, email, name) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const providerColumn = provider === 'google' ? 'google_id' : 'microsoft_id';

  // 1. Verificar si existe por ID del proveedor OAuth
  let res = await pool.query(`SELECT * FROM users WHERE ${providerColumn} = $1`, [providerId]);
  if (res.rows.length > 0) {
    return res.rows[0];
  }

  // 2. Account linking por email si el correo ya existe
  if (cleanEmail) {
    res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (res.rows.length > 0) {
      const user = res.rows[0];
      await pool.query(`UPDATE users SET ${providerColumn} = $1 WHERE id = $2`, [providerId, user.id]);
      user[providerColumn] = providerId;
      return user;
    }
  }

  // 3. JIT Provisioning (crear nuevo usuario con rol de personal)
  const newUserId = 'usr-oauth-' + Date.now();
  const defaultRoleId = 'role-teacher';
  const defaultTenantId = 'tenant-itc';

  await pool.query(
    `INSERT INTO users (id, tenant_id, name, email, ${providerColumn}, role_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newUserId, defaultTenantId, name || 'Usuario SSO', cleanEmail, providerId, defaultRoleId]
  );

  const newUser = await pool.query('SELECT * FROM users WHERE id = $1', [newUserId]);
  return newUser.rows[0];
}

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock_google_client_secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
        const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
        const user = await linkOrCreateUser('google', profile.id, email, name);
        done(null, user);
      } catch (err) {
        console.error('Error en autenticación Google:', err);
        done(err, null);
      }
    }
  )
);

// Microsoft OAuth Strategy
passport.use(
  new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_CLIENT_ID || 'mock_microsoft_client_id',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'mock_microsoft_client_secret',
      callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback',
      scope: ['user.read']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : profile._json?.mail || profile._json?.userPrincipalName || '';
        const name = profile.displayName || 'Usuario Microsoft';
        const user = await linkOrCreateUser('microsoft', profile.id, email, name);
        done(null, user);
      } catch (err) {
        console.error('Error en autenticación Microsoft:', err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, res.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
