import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

const initializePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Absolute callback avoids redirect_uri_mismatch behind proxies (Cloudflare→Fly).
        // Set OAUTH_CALLBACK_URL per env; falls back to relative for local dev.
        callbackURL: process.env.OAUTH_CALLBACK_URL || "/api/auth/google/callback",
        passReqToCallback: true, // ← lets us read req in callback
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const mode = req.session?.mode || "login";
          const email = profile.emails[0].value;

          let user = await User.findOne({
            $or: [{ googleId: profile.id }, { email }],
          }).select("+refreshToken");

          if (mode === "login") {
            // Login: user must already exist
            if (!user) {
              return done(null, false, { message: "No account found. Please sign up first." });
            }
            // Link googleId if missing — atomic update avoids re-validating
            // unrelated fields on legacy accounts.
            if (!user.googleId) {
              await User.findByIdAndUpdate(user._id, { googleId: profile.id, isVerified: true });
              user.googleId = profile.id;
              user.isVerified = true;
            }
            return done(null, user);
          }

          if (mode === "signup") {
            if (user) {
              // Already exists — just log them in (no duplicate)
              if (!user.googleId) {
                await User.findByIdAndUpdate(user._id, { googleId: profile.id, isVerified: true });
                user.googleId = profile.id;
                user.isVerified = true;
              }
              return done(null, user);
            }
            // Create new user
            user = await User.create({
              googleId: profile.id,
              name: profile.displayName,
              email,
              avatar: profile.photos[0]?.value,
              isVerified: true,
            });
            return done(null, user);
          }

          done(null, false);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
};

export { passport, initializePassport };