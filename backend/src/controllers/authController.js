import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hashToken } from "../utils/tokens.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
};

const setCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
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
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};