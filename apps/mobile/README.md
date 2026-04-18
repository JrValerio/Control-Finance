# Control Finance Mobile

Expo managed mobile app for the Control Finance monorepo.

## Current Scope

- iOS and Android scaffold
- monorepo workspace integration
- EAS build profiles
- initial product shell for the mobile MVP

## MVP Target

- login
- dashboard
- transactions
- credit cards and accounts
- profile and subscription state

CSV and PDF import flows stay out of the first mobile release.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill `EXPO_PUBLIC_API_URL` with the API base URL.
3. Create an Expo account on `expo.dev`.
4. Set `EXPO_OWNER` after the account exists.
5. Run `npm install` from the monorepo root.
6. Run `npm run dev:mobile` from the monorepo root.

## EAS Notes

- `eas.json` lives inside `apps/mobile`.
- `owner` is optional until the Expo account is created.
- `EAS_PROJECT_ID` can stay empty until the project is linked.

## Auth Follow-up

The API already accepts `Authorization: Bearer` on protected routes. The next backend step is to add a mobile auth flow that returns:

- `accessToken` in the response body
- `refreshToken` in the response body

The web flow can keep using httpOnly cookies in parallel.
