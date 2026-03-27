# API Endpoints Documentation

## Authentication (`src/routes/auth.routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/signup` | Register a new user.
| POST   | `/signin` | Authenticate a user and obtain JWT tokens.
| POST   | `/forgot-password` | Initiate password reset flow (email sent).
| POST   | `/reset-password` | Complete password reset using token.
| POST   | `/refresh-token` | Refresh access token using refresh token.
| GET    | `/me` (protected) | Retrieve current authenticated user profile.
| POST   | `/logout` (protected) | Invalidate the current refresh token.

## Battery (`src/routes/battery.routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/hardware/data` | Receive battery data from ESP32 hardware (validated).
| GET    | `/battery` (protected) | Get latest battery reading for all devices of the authenticated user.
| GET    | `/battery/:deviceId` (protected) | Get paginated list of battery readings for a specific device.
| GET    | `/battery/:deviceId/temperature` (protected) | Get the most recent temperature reading for a specific device.
| GET    | `/battery/:deviceId/power` (protected) | Get the most recent power reading for a specific device.
| GET    | `/battery/:deviceId/voltage` (protected) | Get the most recent voltage reading for a specific device.
| GET    | `/battery/:deviceId/current` (protected) | Get the most recent current reading for a specific device.
| GET    | `/battery/:deviceId/all` (protected) | Get the most recent temperature, power, voltage, and current readings for a specific device in one response.

## Device (`src/routes/device.routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/hardware/register` | Register a new hardware device (no user auth, device secret).
| POST   | `/devices/pair` (protected) | Pair a device to the authenticated user's account.
| GET    | `/devices` (protected) | Retrieve list of devices owned by the authenticated user.
| DELETE | `/devices/:deviceId` (protected) | Unpair (delete) device from the user's account.
