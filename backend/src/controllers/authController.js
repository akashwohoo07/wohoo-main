import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hashToken } from "../utils/tokens.js";

// Access token is short-lived (limits the blast radius if one leaks); the
// refresh token lives 14 days so users stay logged in across tab closes/reopens
// until they log out manually. JWT expiry and cookie maxAge are kept in sync.
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "14d";
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;              // 15 minutes
const REFRESH_COOKIE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;  // 14 days

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
  return { accessToken, refreshToken };
};

// Shared cookie attributes so set + clear stay in sync.
// - httpOnly: JS can never read the token (defends against XSS token theft).
// - secure: HTTPS-only (always on when sameSite=none, which browsers require).
// - sameSite "lax" (default): the cookie is NOT sent on cross-site requests,
//   which blocks CSRF. Works because api.wohoo.in and wohoo.in are same-site.
//   Cross-site environments (e.g. beta on *.workers.dev ↔ *.fly.dev) set
//   COOKIE_SAMESITE=none so the cookie is still delivered there.
const baseCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = process.env.COOKIE_SAMESITE || "lax";
  return {
    httpOnly: true,
    secure: isProd || sameSite === "none",
    sameSite,
    path: "/",
  };
};

const setCookies = (res, accessToken, refreshToken) => {
  const opts = baseCookieOptions();
  res.cookie("accessToken", accessToken, { ...opts, maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookie("refreshToken", refreshToken, { ...opts, maxAge: REFRESH_COOKIE_MAX_AGE });
};

const clearAuthCookies = (res) => {
  // clearCookie must use the SAME attributes (path/sameSite/secure) the cookie
  // was set with, or some browsers won't remove it — so manual logout truly logs out.
  const opts = baseCookieOptions();
  res.clearCookie("accessToken", opts);
  res.clearCookie("refreshToken", opts);
};

export const googleCallback = async (req, res, next) => {
  try {
    const user = req.user;
    const { accessToken, refreshToken } = generateTokens(user._id);
    // Atomic single-field update — avoids re-validating the whole document
    // (e.g. a legacy account whose username predates current schema rules).
    await User.findByIdAndUpdate(user._id, { refreshToken: hashToken(refreshToken) });
    setCookies(res, accessToken, refreshToken);

    const page = user.username ? "dashboard" : "set-username";

    // Cookies are already set via setCookies() above — no need to pass tokens
    // through the URL (that would expose them to JS/XSS on the client).
    res.redirect(`${process.env.CLIENT_URL}/${page}`);
  } catch (err) {
    next(err);
  }
};

export const refreshAccessToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: "No refresh token" });
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (!user || user.refreshToken !== hashToken(token)) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    // Atomic single-field update — see googleCallback note.
    await User.findByIdAndUpdate(user._id, { refreshToken: hashToken(newRefreshToken) });
    setCookies(res, accessToken, newRefreshToken);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      } catch {}
    }
    clearAuthCookies(res);
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};