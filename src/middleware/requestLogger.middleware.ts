import { Request, Response, NextFunction } from "express";

/**
 * Request Logger Middleware
 * Logs all incoming requests with method, URL, IP, headers, body, and response status.
 * Designed for demonstration and debugging — shows every request hitting the server.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Capture request details
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("User-Agent") || "unknown",
    contentType: req.get("Content-Type") || "none",
  };

  // Log incoming request immediately
  console.log("\n" + "═".repeat(80));
  console.log(`📥 INCOMING REQUEST  [${timestamp}]`);
  console.log("─".repeat(80));
  console.log(`  Method:       ${requestInfo.method}`);
  console.log(`  URL:          ${requestInfo.url}`);
  console.log(`  IP:           ${requestInfo.ip}`);
  console.log(`  User-Agent:   ${requestInfo.userAgent}`);
  console.log(`  Content-Type: ${requestInfo.contentType}`);

  // Log headers (filtered for relevant ones)
  const relevantHeaders: Record<string, string> = {};
  const headerKeys = [
    "x-device-serial",
    "x-device-key",
    "authorization",
    "x-forwarded-for",
    "x-real-ip",
    "host",
    "origin",
    "referer",
  ];
  headerKeys.forEach((key) => {
    const val = req.get(key);
    if (val) {
      // Mask sensitive values
      if (key === "authorization" || key === "x-device-key") {
        relevantHeaders[key] = val.substring(0, 20) + "...";
      } else {
        relevantHeaders[key] = val;
      }
    }
  });
  if (Object.keys(relevantHeaders).length > 0) {
    console.log(`  Headers:      ${JSON.stringify(relevantHeaders, null, 2).replace(/\n/g, "\n                ")}`);
  }

  // Log request body (if present, with size limit)
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyStr = JSON.stringify(req.body);
    const truncated = bodyStr.length > 500 ? bodyStr.substring(0, 500) + "... [truncated]" : bodyStr;
    console.log(`  Body:         ${truncated}`);
  }

  // Capture response details when finished
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: any[]): Response {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Color code the status
    let statusIcon = "✅";
    if (statusCode >= 400 && statusCode < 500) statusIcon = "⚠️";
    if (statusCode >= 500) statusIcon = "❌";

    console.log("─".repeat(80));
    console.log(`${statusIcon} RESPONSE  [${new Date().toISOString()}]`);
    console.log(`  Status: ${statusCode}  |  Duration: ${duration}ms`);
    console.log("═".repeat(80) + "\n");

    return originalEnd.apply(this, args as any);
  } as any;

  next();
};
