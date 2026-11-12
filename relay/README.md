# NOESIS relay (home PC)

The relay is how Apollo answers on your Claude Pro plan instead of a paid API key. It runs on your PC, picks up messages from the database, runs them through Claude Code, and writes the reply back. The website shows it as online or offline.

**What Apollo can do through it:** only the site tools in `src/core/tools.ts` (records, themes, navigation, panels, inbox, memory, undo). Claude Code is started with `--tools ""` (no Bash, no file access, no web) and `--strict-mcp-config` with only the `noesis` tool server. Apollo cannot touch the rest of your PC.

## One-time setup (Windows)

1. **Install Node.js 22 or newer** from https://nodejs.org (LTS).
2. **Install Claude Code and log in with your Pro account:**
   ```
   npm install -g @anthropic-ai/claude-code
   claude
   ```
   Log in when prompted, then type `/exit`. Don't set `ANTHROPIC_API_KEY`: if it's set, Claude Code bills the API instead of your plan.
3. **Get the code onto the PC:**
   ```
   git clone <your repo URL> C:\noesis
   cd C:\noesis
   npm install
   ```
4. **Create `C:\noesis\.env.relay`** with these two lines:
   ```
   SUPABASE_URL=https://cmczzrrahwnxogueayrd.supabase.co
   SUPABASE_SECRET_KEY=<secret key from Supabase → Project Settings → API Keys>
   ```
   This file is ignored by git. Never paste the secret key into the website or a chat.
5. **Test it:** `npx tsx --env-file=.env.relay relay/index.mts`. You should see `NOESIS relay 0.4.0 · supabase store · claude-code`, and the site's Apollo panel should say "online". Press Ctrl+C to stop.

## Run it at startup, without signing in

1. Open **Task Scheduler**, then choose **Create Task** (not "Basic Task").
2. **General tab:**
   - Name it `NOESIS relay`.
   - Tick **Run whether user is logged on or not**.
   - Tick **Run with highest privileges** (optional).
3. **Triggers tab:** add a trigger **At startup** with **Delay task for: 1 minute**, which gives the network time to come up.
4. **Actions tab:** add an action.
   - Program: `C:\Program Files\nodejs\npx.cmd`
   - Arguments: `tsx --env-file=.env.relay relay/index.mts`
   - Start in: `C:\noesis`
5. **Settings tab:**
   - Untick **Stop the task if it runs longer than**.
   - Tick **If the task fails, restart every 1 minute**.
6. Save it. Windows asks for your password, so the task can run while you're signed out.

**Check that Claude Code's login works from the task.** Claude Code stores its login in your user profile. Because the task runs as your account, it normally finds it. To confirm:
- Reboot.
- Don't sign in.
- From your phone, send Apollo a message.
- If the Apollo panel says online but replies fail with an authentication error, sign in once, run `claude` in a terminal, and log in again. Then retry.

## Keep the PC available

- **Never sleep or hibernate:**
  - Settings → System → Power: set **Sleep** to **Never** for "plugged in".
  - In an admin terminal: `powercfg /hibernate off`
- **Screen off is fine.**
- **Windows Update restarts:**
  - Settings → Windows Update → Advanced options: set your **active hours** to the times you use the site.
  - Windows can still restart for updates outside active hours. The startup task brings the relay back afterwards.
- **BitLocker:** if BitLocker asks for a PIN at boot, the PC can't start unattended after a restart (power cut or update). Either be there to type the PIN, or switch to TPM-only unlock. That's a security trade-off, so decide for yourself.

## How it behaves

- **Heartbeat:** every 15 s. The site treats the relay as offline after 45 s without one.
- **While offline:** messages wait in the queue and are answered when the relay comes back.
- **Usage limit hit:** the job is parked until your limit resets, and the site shows "back at HH:MM".
- **Model choice:**
  - **Auto** starts on Haiku and escalates to Sonnet using cheap rules.
  - Haiku can also reply `ESCALATE`, which reruns the request on Sonnet.
- **Pro plan usage:** the site's Apollo panel shows the real 5-hour and weekly usage percentages, which Claude Code reports after each job.

## Switching to the API later

`relay/backend.mts` defines a `Backend` interface. An API backend that implements `run()` can replace `claudeCode()` in `relay/index.mts` without changing anything else.

## Local development without a database

```
npm run build && NOESIS_DEV_STORE=.dev/db.json npx next start
NOESIS_DEV_STORE=.dev/db.json npx tsx relay/index.mts
```
