# Mindcraft — Agent Context

## What It Is

**Mindcraft** runs LLM-powered autonomous agents inside Minecraft Java Edition (up to 1.21.11). Each agent connects via [Mineflayer](https://prismarinejs.github.io/mineflayer/), receives chat commands, reasons about goals, and executes actions — including writing and running sandboxed JavaScript code.

Published as [*Collaborating Action by Action: A Multi-agent LLM Framework for Embodied Reasoning*](https://arxiv.org/abs/2504.17950).

---

## Architecture Overview

```
main.js                         Entry point, CLI parsing (yargs), env overrides
  └─ mindcraft/mindcraft.js     Public API: init(), createAgent(), shutdown()
       ├─ mindcraft/mcserver.js  Manages the Minecraft server process (optional)
       └─ mindcraft/mindserver.js  Express + Socket.IO server (UI, agent management)
            └─ process/agent_process.js  Forks isolated Agent subprocesses
                 └─ process/init_agent.js  Bootstraps a single Agent instance
                      └─ agent/agent.js      Core Agent class (the brain)
                           ├─ models/prompter.js   Builds prompts, calls LLM APIs
                           ├─ agent/coder.js       Generates + lints + runs sandboxed code
                           ├─ agent/conversation.js  Chat response routing
                           ├─ agent/self_prompter.js Autonomous goal-driven prompting
                           ├─ agent/history.js      Conversation history management
                           ├─ agent/memory_bank.js  Long-term memory (summarized)
                           ├─ agent/modes.js        Behavior modes (survival, creative…)
                           ├─ agent/library/        Skills API exposed to LLM-generated code
                           └─ agent/npc/            NPC village/build controller
```

### Key Directories

| Directory | Purpose |
|---|---|
| `src/agent/` | Core agent logic — chat, coding, memory, modes, NPC |
| `src/agent/library/` | Skills API (`skills.js`) + world state (`world.js`) exposed to LLM code |
| `src/agent/commands/` | Built-in commands (`!setMode`, `!goal`, `!jump`, …) |
| `src/agent/npc/` | NPC village controller: building goals, item goals, construction blueprints |
| `src/agent/tasks/` | Task definitions (crafting, cooking, construction) |
| `src/agent/vision/` | Camera capture + vision model interpreter |
| `src/models/` | LLM provider adapters (OpenAI, Gemini, Claude, Groq, Ollama, …) |
| `src/mindcraft/` | Mindserver (Express UI), mcserver wrapper, public HTML |
| `src/mindcraft-py/` | Python bindings for external task orchestration |
| `src/process/` | Subprocess management (agent isolation) |
| `src/utils/` | Shared helpers (keys, mcdata, translator, math, text, examples) |
| `profiles/` | JSON bot profiles (model, prompts, examples) |
| `tasks/` | Task JSON files for automated benchmarks |
| `bots/` | Per-bot persistent data (memory, NPC state) |
| `patches/` | patch-package overrides for upstream deps |

---

## Core Flow

1. **`main.js`** parses CLI args (`--profiles`, `--task_path`, `--task_id`), merges env vars into `settings.js`.
2. **`mindcraft.init()`** starts the Mindserver (Express + Socket.IO on `:8080`).
3. **`mindcraft.createAgent(profile)`** forks a subprocess (`agent_process.js`) that loads `init_agent.js → Agent`.
4. **`Agent.start()`** connects Mineflayer to Minecraft, sets up event handlers (chat, login, health, death…).
5. On each chat message, **`Agent.handleMessage()`** routes through:
   - **`Prompter.promptConvo()`** — sends conversation to the LLM
   - LLM response may contain **commands** (`!setMode`, `!goal`) or **newAction code**
   - **`Coder.generateCode()`** — LLM writes JS using the skills API; code is linted (ESLint), staged, and executed in a SES sandbox
6. **Skills** (`src/agent/library/skills.js`) are the primitive actions: `craftRecipe()`, `collectBlock()`, `goToPosition()`, `placeBlock()`, `attackNearest()`, etc.
7. **Modes** control autonomous behavior: `off` (chat-only), `survival` (gather + build), `creative` (build freely), `god_mode` (invincible builder).

---

## Important Files

### Entry & Configuration

- **`main.js`** — CLI entry, arg parsing, env overrides
- **`settings.js`** — default config (host, port, profiles, max_messages, coding flags…)
- **`andy.json`** — minimal bot profile (name + model)
- **`keys.example.json`** → rename to `keys.json` with API keys

### Agent Core

- **`src/agent/agent.js`** — `Agent` class: lifecycle, event handlers, message routing
- **`src/agent/action_manager.js`** — parses LLM responses, extracts commands + newAction blocks
- **`src/agent/coder.js`** — `Coder` class: code generation, ESLint, SES sandbox execution
- **`src/agent/conversation.js`** — chat message formatting and routing
- **`src/agent/self_prompter.js`** — autonomous goal-driven self-prompting loop
- **`src/agent/history.js`** — sliding-window message history with summarization
- **`src/agent/memory_bank.js`** — persistent long-term memory (saved to `bots/<name>/`)

### Skills API (what the LLM can call)

- **`src/agent/library/skills.js`** — ~39 exported skills: movement, combat, crafting, building, trading, farming
- **`src/agent/library/world.js`** — world state queries (inventory, nearby blocks, entities…)
- **`src/agent/library/lockdown.js`** — SES hardening for sandboxed code execution
- **`src/agent/library/skill_library.js`** — embedding-based skill doc retrieval for prompting

### LLM Integration

- **`src/models/prompter.js`** — `Prompter` class: builds system prompts, calls LLM APIs, manages examples
- **`src/models/_model_map.js`** — maps api names to adapter modules
- **`src/models/gpt.js`**, **`gemini.js`**, **`claude.js`**, etc. — per-provider adapters

### NPC System

- **`src/agent/npc/controller.js`** — NPC village logic (town hall, housing, resource management)
- **`src/agent/npc/build_goal.js`** — interprets construction blueprints (JSON)
- **`src/agent/npc/item_goal.js`** — item acquisition planning
- **`src/agent/npc/construction/`** — blueprint JSON files

### Server & UI

- **`src/mindcraft/mindserver.js`** — Express server + Socket.IO (agent list, chat proxy, settings API)
- **`src/mindcraft/mcserver.js`** — manages Minecraft server process lifecycle
- **`src/mindcraft/public/index.html`** — web UI frontend

### Tasks

- **`src/agent/tasks/tasks.js`** — task execution framework (goal checking, inventory setup, timeout)
- **`tasks/`** — benchmark task definitions (single_agent, construction, cooking, crafting)

---

## Development

### Prerequisites

- Minecraft Java Edition (≤ 1.21.11, recommend 1.21.6)
- Node.js 18 or 20 LTS (v24+ has native dep issues)
- At least one LLM API key

### Commands

```bash
npm install          # install deps + apply patches
node main.js         # start with default profile (andy.json)
node main.js --profiles ./profiles/claude.json ./profiles/gemini.json   # multi-agent
node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs  # run task
```

### Key Settings (`settings.js`)

- `allow_insecure_coding: true` — enables LLM code generation (sandboxed via SES, still risky)
- `allow_vision: true` — enables screenshot-based vision input
- `max_messages: 15` — context window size
- `render_bot_view: true` — opens Three.js viewer at `:3000`

### Docker

```bash
docker-compose up --build
```

Use `host.docker.internal` instead of `localhost` for the Minecraft host inside containers.

### Patches

Upstream patches live in `patches/`. To create one:

```bash
# edit node_modules/<pkg>/file.js, then:
npx patch-package <pkg>
```

---

## Coding Conventions

- **ES modules** (`import`/`export`), no CommonJS
- **JavaScript** (not TypeScript) — `.js` extension
- **Async/await** throughout — almost everything is async
- **ESLint** configured via `eslint.config.js` with `no-floating-promise` plugin
- Code generated by LLM runs in a **SES (Secure ECMAScript)** sandbox — `src/agent/library/lockdown.js` applies hardening
- Skill functions accept `bot` (Mineflayer bot instance) as the first parameter
- Bot profiles are plain JSON; base profiles live in `profiles/defaults/`

---

## Safety

> ⚠️ **Do not connect to public servers with coding enabled.** The LLM writes and executes code on your machine. Sandboxing via SES reduces but does not eliminate injection risks. `allow_insecure_coding` is `false` by default.

---

## References

- [FAQ](FAQ.md) — troubleshooting, common issues
- [MineCollab](minecollab.md) — multi-agent task benchmark setup
- [Paper](https://mindcraft-minecollab.github.io/) — academic publication
- [Discord](https://discord.gg/mp73p35dzC) — community support
