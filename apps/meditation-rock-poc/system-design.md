# System architecture

## Data modeling

```ts
interface Round {
  id: number;
  topic: string;
  synthesis: string;
}

interface Rock {
  id: number;
  systemPrompt: string;
}

interface Session {
  id: number;
  roundId: number;
  rockId: number;
  createdAt: string;
  memory: string[];
}
```

## Database: Firebase

See ./apps/firebase-poc for how to organize data flow for a Firebase app

## Frontend: Admin + User UI

See ./apps/firebase-poc for how to organize the Firebase app for both admin and user UI, each being a separate html page entry point

### Admin UI

- Use the OpenAI Rresponse API:
  - Create and remove rocks, edit system prompt
  - Create and remove rounds, edit topic for each round
  - View session history for each rock. Allow delete
  - View session history for each round. Allow delete
  - Synthesize the common theme from all the sessions in a round, see ./src/moderator/generate-themes.ts
- Reference ./src/admin.page.ts

### User UI

- Use the OpenAI Agents SDK:
  - Each interaction creates a session. During session, the agent will form memory entries. Each memory entry is a string.
  - User clicks a button to start a meditation session. And click again to end the session.
  - After the session ends, user can see the memories formed during the session. A "submit" button allows user to submit the session to the backend
- Reference ./src/user.page.ts

## AI: OpenAI Agents SDK

See use-rock-session.ts for how to use the OpenAI Agents SDK to create a rock session

## Core personas:

- "Giver": The person who creates the guru rock and give it "life".
- "Guru rock": The meditation guide with the personality of a rock and the wisdom of a guru.
- "User": The person who interacts with the guru rock for meditation.

## Interaction loop

1. Create rock: "Giver" is an admin, who creates a guru rock by typing in a system prompt for the rock's personality. This should be in the admin UI.
2. Create round: admin creates a round by setting the topic. Within each round, the admin can copy the user page URLs, each URL corresponds to a specific rock.
3. Guru rock coaches the user through a guided meditation. We use the basic OpenAI agents SDK, realtime interaction. Use the built-in automated speech activiation and silence detection. This should be in the user UI.
4. Meditation outcome folds into the Guru's memory: during the session, the agents should use a tool to remember the meditation session. The memory should be PII-redacted, similar to how a human instructor would remember a meditation session.
5. User ends the session, reviews the memories, and submits the session to the backend.
