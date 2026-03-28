import { Router } from "express";
import {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  logout,
  refreshTokenHandler,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  signupSchema,
  signinSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.schema";
import { authLimiter, resetPasswordLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

// Public routes with validation
router.post("/signup", validate(signupSchema), signup);
router.post("/signin", authLimiter, validate(signinSchema), signin);
router.post("/forgot-password", resetPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/refresh-token", refreshTokenHandler);

// Protected routes
router.get("/me", authenticate, getCurrentUser);
router.post("/logout", authenticate, logout);

export default router;

