# API Endpoints Documentation

All endpoints are prefixed with `/api`.

## Authentication (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/auth/signup` | Register a new user.
| POST   | `/api/auth/signin` | Authenticate a user and obtain JWT tokens.
| POST   | `/api/auth/forgot-password` | Initiate password reset flow (email sent).
| POST   | `/api/auth/reset-password` | Complete password reset using token.
| POST   | `/api/auth/refresh-token` | Refresh access token using refresh token.
| GET    | `/api/auth/me` | (Protected) Retrieve current authenticated user profile.
| POST   | `/api/auth/logout` | (Protected) Invalidate the current refresh token.

## Hardware (`/api/hardware`)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/hardware/register` | Register a new hardware device (no user auth, uses device secret).
| POST   | `/api/hardware/data` | Receive battery data from ESP32 hardware (authenticated via device header).

## Devices (`/api/devices`)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/devices/` | (Protected) Retrieve list of devices owned by the authenticated user.
| POST   | `/api/devices/pair` | (Protected) Pair a device to the authenticated user's account.
| DELETE | `/api/devices/:deviceId` | (Protected) Unpair (delete) device from the user's account.

## Battery (`/api/battery`)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/battery/` | (Protected) Get latest battery reading for all devices of the authenticated user.
| GET    | `/api/battery/:deviceId` | (Protected) Get paginated list of battery readings for a specific device.
| GET    | `/api/battery/:deviceId/temperature` | (Protected) Get the most recent temperature reading for a specific device.
| GET    | `/api/battery/:deviceId/power` | (Protected) Get the most recent power reading for a specific device.
| GET    | `/api/battery/:deviceId/voltage` | (Protected) Get the most recent voltage reading for a specific device.
| GET    | `/api/battery/:deviceId/current` | (Protected) Get the most recent current reading for a specific device.
| GET    | `/api/battery/:deviceId/soc` | (Protected) Get the most recent State of Charge (SoC) reading for a specific device.
| GET    | `/api/battery/:deviceId/all` | (Protected) Get the most recent temperature, power, voltage, current, and SoC readings for a specific device in one response.
