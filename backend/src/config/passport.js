const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { query } = require('../db');

/**
 * Account Linking con Trust Provider mediante correo electrónico.
 * Si el usuario ya existe por email, vincula el provider_id.
 * Si no existe, realiza aprovisionamiento silencioso (Just-In-Time).
 */
async function linkOrCreateUser(profile, provider) {
  const email = (profile.emails && profile.emails[0]?.value) ||
                profile._json?.email ||
                profile._json?.mail ||
                profile._json?.userPrincipalName ||
                null;

  if (!email) {
    throw new Error('No se pudo resolver la dirección de correo electrónico desde el proveedor OAuth.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const providerId = profile.id;
  const providerCol = provider === 'google' ? 'google_id' : 'microsoft_id';
  const name = profile.displayName ||
               (profile.name ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim() : null) ||
               cleanEmail.split('@')[0];

  // 1. Verificar si existe la cuenta por email para Account Linking
  const user = await query.get(
    `SELECT id, name, email, tenant_id, role_id, google_id, microsoft_id FROM users WHERE email = ?`,
    [cleanEmail]
  );

  if (user) {
    // Account Linking: Actualiza el ID del proveedor si no estaba asociado previamente
    if (!user[providerCol]) {
      await query.run(
        `UPDATE users SET ${providerCol} = ? WHERE id = ?`,
        [providerId, user.id]
      );
      user[providerCol] = providerId;
    }
    return user;
  } else {
    // 2. Aprovisionamiento silencioso (New User OAuth)
    const newUserId = 'usr-' + Date.now();
    await query.run(
      `INSERT INTO users (id, name, email, ${providerCol}, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [newUserId, name, cleanEmail, providerId]
    );

    return {
      id: newUserId,
      name,
      email: cleanEmail,
      tenant_id: null,
      role_id: null,
      [providerCol]: providerId
    };
  }
}

// -------------------------------------------------------------
// Google OAuth 2.0 Strategy
// -------------------------------------------------------------
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock_google_client_secret',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await linkOrCreateUser(profile, 'google');
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
}));

// -------------------------------------------------------------
// Microsoft OAuth 2.0 Strategy
// -------------------------------------------------------------
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID || 'mock_microsoft_client_id',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'mock_microsoft_client_secret',
  callbackURL: process.env.MICROSOFT_CALLBACK_URL || "/api/auth/microsoft/callback",
  scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await linkOrCreateUser(profile, 'microsoft');
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await query.get('SELECT * FROM users WHERE id = ?', [id]);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.linkOrCreateUser = linkOrCreateUser;

module.exports = passport;
