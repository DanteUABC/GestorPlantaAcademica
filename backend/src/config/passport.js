const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { pool } = require('../db');
const { getNextIdentifier } = require('../utils/identifierHelper');

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
        const cleanEmail = (email || '').toLowerCase().trim();
        const result = await pool.query('SELECT * FROM usuarios WHERE LOWER(email) = $1', [cleanEmail]);

        if (result.rows.length > 0) {
          // Criterio 2: El correo externo ya existe, iniciar sesión normalmente
          const user = result.rows[0];
          if (!user.google_id) {
            await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.id, user.id]);
            user.google_id = profile.id;
          }
          return done(null, { ...user, isNew: false });
        } else {
          // Criterio 1: Primera vez, necesitamos enviar la bandera de usuario nuevo
          return done(null, {
            email: cleanEmail || email,
            provider: profile.provider || 'google',
            provider_id: profile.id,
            isNew: true
          });
        }
      } catch (err) {
        console.error('Error en autenticación Google:', err);
        return done(err);
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
        const cleanEmail = (email || '').toLowerCase().trim();
        const result = await pool.query('SELECT * FROM usuarios WHERE LOWER(email) = $1', [cleanEmail]);

        if (result.rows.length > 0) {
          // Criterio 2: El correo externo ya existe, iniciar sesión normalmente
          const user = result.rows[0];
          if (!user.microsoft_id) {
            await pool.query('UPDATE users SET microsoft_id = $1 WHERE id = $2', [profile.id, user.id]);
            user.microsoft_id = profile.id;
          }
          return done(null, { ...user, isNew: false });
        } else {
          // Criterio 1: Primera vez, necesitamos enviar la bandera de usuario nuevo
          return done(null, {
            email: cleanEmail || email,
            provider: profile.provider || 'microsoft',
            provider_id: profile.id,
            isNew: true
          });
        }
      } catch (err) {
        console.error('Error en autenticación Microsoft:', err);
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id || user.email);
});

passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1 OR email = $1', [id]);
    done(null, res.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
