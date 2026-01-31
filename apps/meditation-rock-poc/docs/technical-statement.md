# RockTalk — Technical Statement (Software Rider)

This technical rider describes the software requirements and operational needs for exhibiting RockTalk at C&C 2026. It focuses on the deployed web experience (admin setup + participant sessions).

## Overview

RockTalk runs as a browser-based web application with two entry points:

- **Admin interface** for moderators to create and manage “rocks” and “rounds,” and to synthesize themes from submitted memories.
- **Participant interface** for visitors to enter a rock session via a shared URL and complete a short, voice-based reflection.

The experience depends on real-time AI audio interaction and cloud data storage; therefore stable internet is required.

## Software stack (high level)

- Web client: TypeScript single-page application built with Vite.
- AI services:
  - Real-time voice interaction via OpenAI Realtime (audio in/out + speech-to-text).
  - Post-session anonymization via OpenAI (converts transcript into anonymized memory entries).
- Cloud backend: Firebase Realtime Database (stores rocks, rounds, sessions, and anonymized memories).

## Run mode

- Intended to run continuously during exhibition hours.
- Primary operation is visitor-led: a participant opens a rock link, starts a session, speaks, ends the session, then optionally submits anonymized memories.

## Venue requirements (software-related)

- **Stable internet connection** (wired or high-quality Wi‑Fi).
  - The experience will not function offline.
  - Low-latency connectivity is strongly preferred due to real-time audio.
- **Power**
  - Power outlet(s) for the exhibit computer(s) and any audio peripherals.
  - Power cords / extension cords as needed for the install footprint.
- **Personal audio equipment (required)**
  - Headphones (for private listening and to reduce audio feedback in the gallery).
  - Microphone (or a headset with mic) for reliable voice capture.

## Exhibit hardware assumptions

RockTalk can run on a standard modern laptop.

Minimum recommended:

- A laptop capable of running a modern Chromium-based browser.
- Chrome/Edge/Safari/Firefox current versions.
- USB headset (headphones + mic) or equivalent.

## Operator workflow (day-of)

1. Open the Admin interface.
2. Sign in (moderator account).
3. Create or select a Round (topic).
4. Create or select Rocks (prompt/personality templates).
5. Copy/share participant URLs for the current round/rock.
6. Visitors use the Participant interface to run sessions.

## Credentials and configuration

- The participant interface requires an OpenAI API key to be provided in the on-screen “Setup” dialog.
- Firebase connection is pre-configured in the build.

Notes:

- API keys are entered by the operator and should be handled as sensitive credentials.
- If the conference prefers, credentials can be provided on the artist’s own device only.

## Data handling (software)

- During a session, the system produces a transcript (for participant review).
- After the session, the participant can generate anonymized “memory” entries derived from the transcript.
- Only the anonymized memory entries are submitted to the community dataset; submission is optional and initiated by the participant.

## Safety and compliance notes

- No special software safety hazards.
- The installation requires standard browser permissions for microphone access.
