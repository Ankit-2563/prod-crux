import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { AuthRequest } from "./auth.middleware";

// Limit login attempts
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per `window`
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit password reset attempts
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per `window`
  message: {
    success: false,
    message: "Too many password reset requests, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit AI insight requests (Gemini/OpenAI calls cost money)
export const aiInsightLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 insight requests per user per window
  message: {
    success: false,
    message: "Too many insight requests, please try again after 15 minutes",
  },
  keyGenerator: (req: AuthRequest) => {
    // Per user when JWT is present; IPv6-safe IP key per express-rate-limit v8
    if (req.user?.id) return `user:${req.user.id}`;
    const ip = req.ip;
    return ip ? ipKeyGenerator(ip) : "unknown";
  },
  standardHeaders: true,
  legacyHeaders: false,
});
