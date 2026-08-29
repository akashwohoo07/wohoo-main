import jwt from "jsonwebtoken";
import User from "../models/User.js";

let counter = 0;

export async function createUser(overrides = {}) {
  counter++;
  return User.create({
    name: "Test User",
    email: `testuser${counter}_${Date.now()}@example.com`,
    isVerified: true,
    ...overrides,
  });
}

export function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

export function generateRefreshToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export async function createAuthUser(overrides = {}) {
  const user = await createUser(overrides);
  const token = generateToken(user._id);
  return { user, token };
}
