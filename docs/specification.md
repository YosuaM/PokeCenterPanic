# PokéCenter Panic
**Functional and technical specification**

**Version:** 0.2 — MVP rules and acceptance scenarios\
**Status:** Implementation baseline; balance values pending playtests\
**Updated:** 2026-10-21\
**Type:** Noncommercial cooperative fan game\
**Primary platform:** Web browser\
**Technologies:** Phaser, TypeScript, Vite, Node.js, Colyseus

Version 0.2 fixes the gameplay and lifecycle rules for the MVP. Values explicitly described as initial tuning values may change after playtesting; the rules and acceptance scenarios remain the implementation contract until this document is revised. No gameplay validation is implied by this specification update.

---

# 1. Project vision

## 1.1. Concept

PokéCenter Panic is a 2D cooperative multiplayer game inspired by the coordination and chaotic time management mechanics of *Overcooked*, set in a Pokémon Center.

Players control Pokémon working as medical staff and collaborate to care for other Pokémon arriving with injuries, illnesses, or status conditions.

Each patient needs one or two treatments before discharge, completed in any compatible order. Players must pick patients up, carry them between stations, prepare medicine, and manage the available time.

As a round progresses, the pressure increases and unexpected situations force the team to reorganize.

## 1.2. Design goals

- Offer quick cooperative rounds lasting 5–8 minutes.
- Prioritize fun with friends and coordination.
- Keep the mechanics easy to learn and difficult to master.
- Allow people to play directly in a browser.
- Use existing visual resources to reduce art production work.
- Avoid unnecessary account, progression, or monetization systems.
- Build a modular foundation for new Pokémon, treatments, and maps.

## 1.3. General characteristics

| Feature | Specification |
|---|---|
| Genre | Cooperative action and time management |
| Players | 1–4, with a focus on 2–4 |
| View | Top-down 2D |
| Art style | Pixel art inspired by Pokémon Mystery Dungeon |
| Duration | 6 minutes per MVP round, plus lobby/countdown/results |
| Initial platform | Desktop browser |
| Controls | Keyboard |
| Access | Private room with a code |
| Monetization | None |
| Persistence | Not required for the MVP |

---

# 2. Core mechanics

## 2.1. Gameplay loop

The core loop is:

1. A patient arrives at reception.
2. Their condition and required treatments are displayed.
3. A player picks up the patient.
4. The team carries the patient to the appropriate stations.
5. All required treatments are completed in any compatible order.
6. The patient returns to reception for discharge.
7. The team scores points and makes room for new patients.

This process repeats with increasing difficulty.

The mechanics should encourage players to divide tasks among themselves naturally.

## 2.2. Movement and interaction

Players move in four cardinal directions, using directional animations. If perpendicular directions are held together, the most recently pressed direction wins; there is no diagonal movement. Initial speed is three map tiles per second, including while carrying something.

Players collide with the map and solid station geometry, but pass through one another. Carried sprites do not add collision bodies. Competition for stations and short routes provides pressure without players trapping one another in corridors.

**MVP controls:**

| Action | Control |
|---|---|
| Move | WASD or arrow keys |
| Interact / pick up / place / apply medicine | Press E |
| Prepare medicine / repair a machine | Hold E at the indicated target |
| View patient information | Automatic when nearby |
| Local menu | Escape; the shared round keeps running |

Space has no gameplay binding in the MVP. Opening the menu or losing browser focus clears movement and cancels any held interaction. There is no shared pause, including in solo play.

Interaction targets have an accessible point on the walkable side of the station or slot. The client highlights the nearest target in front of the player within one tile of that point, with no solid geometry between them; equal distances use a stable target ID. Target selection does not silently switch to another object when the selected action is invalid. Patients in a slot are targeted through that slot; occupied stations are not also separate overlapping patient targets.

The indicator names the action or rejection reason. The server validates the requested target, expected occupant, distance, facing, inventory, and current state. A stale target or changed occupant is rejected without performing an alternative action; two attempts to pick up the same recovery-queue patient must not pick up two different patients. Instant actions fire once per key press, not every frame. Held actions finish once and require a release before another action can begin.

## 2.3. Carrying patients

A player can carry only one patient or object at a time.

When a player picks up a Pokémon:

- The patient is temporarily attached to the player.
- The patient is represented by a sprite on the generic visual stretcher.
- The player can move and place the patient in an empty waiting slot or a working, empty healing machine when healing is still required.
- Other players cannot pick up the patient while it is being carried.

The MVP uses a generic small stretcher with the patient's sprite above it; medicine uses a bottle sprite with a distinct condition icon. All players use the same representation and speed.

There will be no individual carrying animation for every combination of Pokémon.

Patients cannot be manually dropped on the floor, on medicine surfaces, or back into the arrival queue. Medicine can be placed on an empty medicine surface or discarded at the medicine table's disposal point. Invalid placement leaves the carried entity unchanged.

## 2.4. Stations

Stations are interactive parts of the map with limited capacity and specific behavior.

### Reception

- Generates new patients.
- Maintains four arrival slots. Patients stay in their slot until picked up or lost.
- Lets players pick up any occupied arrival slot, so the team can prioritize urgent patients.
- Has a separate discharge interaction point that accepts a carried, fully treated patient immediately. Arrivals never occupy or block this point.
- Skips arrivals when reception or the active-patient limit is full, according to section 5.3.

### Healing machine

- Completes the injury treatment and restores the patient's HP to its maximum.
- Holds only one Pokémon at a time.
- Placing a patient automatically starts healing; a second start interaction is unnecessary.
- Healing takes four seconds and runs without an attending player.
- The patient must be picked up after treatment finishes.
- Patients cannot be removed or medicated while the machine is treating or broken. A repaired machine resumes the remaining treatment time; a completed patient may receive medicine before pickup.

### Medicine table

- Has two labeled preparation points, one for Burn Heal and one for Antidote; facing a point chooses the recipe without opening a menu.
- Each point supports one player preparing one dose. With empty hands, hold E for two seconds without moving to finish preparation; the dose goes directly into the player's hand.
- Releasing E, moving, opening the menu, losing input, or disconnecting cancels preparation and resets its progress. A failed or cancelled preparation creates no medicine.
- Medicine applies instantly to a matching patient in reception, a waiting slot, the recovery area, or a completed healing machine. It cannot be applied to a carried patient or during healing or an outage.
- A successful application consumes one dose and completes one pending treatment atomically. Wrong, redundant, or otherwise invalid medicine leaves both dose and patient unchanged.
- Includes a disposal point for discarding a carried dose without a score penalty.

**For the MVP**, medicine recipes have one step and no complex ingredient system.

### Waiting area

- Has four individually targetable patient slots, each holding one patient.
- Accepts patients regardless of their remaining treatments, including patients ready for discharge.
- Allows a solo player to set down a patient, prepare and apply medicine, and pick the patient up again.
- Does not pause patience or provide treatment by itself.

### Medicine surfaces and recovery area

- Four medicine surface slots each hold one finished dose. They do not accept patients.
- A pickup-only recovery area beside reception holds patients released by disconnected players when all waiting slots are occupied. It is separate from the arrival queue and discharge point.
- Recovery is a queue with capacity ten, the global maximum active-patient count, so it cannot overflow. A single accessible interaction point exposes the front patient for pickup or medicine, with its indicators and a queue count. Patients are ordered by entry time, then patient ID; removal exposes the next one. It never blocks movement or accepts manual placement, and patience continues for every queued patient.
- Recovery and all ordinary station interaction points must be reachable from the walkable map.

## 2.5. Contextual interaction contract

All actions below require a running round, an in-range target, and server validation. A player may have only one held action in progress. Moving cancels a held action before movement is applied.

| Player's hands | Target and condition | E action | Rejection or limit |
|---|---|---|---|
| Empty | Patient in reception, waiting, or at the front of recovery | Pick up patient; free its slot | Patient already claimed or removed |
| Empty | Completed healing machine with a patient | Pick up patient; machine becomes empty | No pickup during treatment or outage |
| Patient | Empty waiting slot | Place patient | Occupied slot |
| Patient needing healing | Working, empty healing machine | Place and automatically start healing | Occupied, broken, or healing not needed |
| Fully treated patient | Discharge point | Discharge once and award points | Any required treatment remains |
| Empty | Free Burn Heal or Antidote preparation point | Hold for two seconds; receive one dose | Another player owns preparation |
| Matching medicine | Patient in an allowed stationary location | Consume dose and complete the matching treatment | Carried, treating, broken machine, or treatment not pending |
| Medicine | Empty medicine surface | Place dose | Occupied surface |
| Empty | Medicine surface with a dose | Pick up dose | Dose already claimed |
| Medicine | Disposal point | Discard dose | Does not accept patients |
| Empty | Broken healing machine, occupied or empty | Hold for two seconds to repair | Another player owns repair |
| Any | Any other combination | No state change; show reason | No automatic swap, pickup, or fallback action |

During an outage, repair is the machine's only permitted interaction. A medicine holder must put away or discard the dose before repairing. An unattended healing treatment needs no player lock; only the machine owns the patient. Preparation and repair locks are cancelled immediately on disconnection and cannot remain attached to an absent player.

---

# 3. Patient system

## 3.1. Patient model

Each patient must have at least:

| Property | Description |
|---|---|
| ID | Unique identifier |
| Pokémon | Species and visual reference |
| Required treatments | Immutable set: healing, Burn Heal, and/or Antidote, within the combinations in section 3.2 |
| Completed treatments | Subset of required treatments; each treatment can complete only once |
| HP and status condition | Derived medical presentation from required and completed treatments |
| Patience | Initial budget and remaining milliseconds; never negative |
| Lifecycle | Active, discharged, lost, or unfinished at round end |
| Location | Exactly one of reception slot, waiting slot, carrier, healing machine, or recovery queue entry while active |
| Position | Derived from the current slot or carrier, not a second independent location |
| Ready for discharge | Derived: active and no required treatments remain |

Treatments are defined as data rather than species-specific logic. Location, treatment progress, and lifecycle are independent concepts: a fully treated patient can still be carried or occupy a machine.

**Invariants:** each active patient has exactly one owner/location; each player and ordinary slot owns at most one entity; patient and owner references agree. Terminal patients have no world location, carrier, station lock, or running timer. Only one terminal outcome and one corresponding score/statistics update are permitted per patient.

### Patient and station transitions

| Trigger | Patient transition | Related state change |
|---|---|---|
| Accepted arrival | New active patient in an empty reception slot | Increment admitted count |
| Valid pickup | Stationary location → carrier | Clear previous slot and fill player's hand atomically |
| Place in waiting | Carrier → waiting slot | Clear hand; retain medical progress and patience |
| Place in working healing machine | Carrier → healing machine | Machine changes from empty to treating, with four seconds remaining |
| Healing finishes | Same location; mark healing complete | Machine changes from treating to completed; patience resumes |
| Apply matching medicine | Same location; mark that treatment complete | Remove the consumed dose from its owner |
| Outage | Same patient location and medical progress | Machine becomes broken; preserve remaining healing time or completed state |
| Repair finishes | Same patient location | Machine returns to its previous state and resumes unfinished healing |
| Successful discharge | Active → discharged | Remove entity, release ownership, increment discharged count and score once |
| Patience reaches zero | Active → lost, from any location | Release ownership, cancel this patient's treatment, increment lost count and penalty once |
| Round deadline | Every remaining active patient → unfinished | Release ownership and increment unfinished count; no loss penalty |
| Carrier disconnects | Carrier → first free waiting slot, otherwise end of recovery queue | Preserve treatments and patience; no score change |

Working healing machines are empty, treating, or completed. A broken machine also remembers which of those states to resume. If its patient is lost, it remains broken but will resume empty; repair progress can continue. Clearing patient ownership must not silently repair a machine.

## 3.2. MVP medical conditions

**Injured**

- Requires a healing machine.
- Treatment takes four seconds in a healing machine.

**Burned**

- Requires a Burn Heal.
- The medicine is prepared at the appropriate table.

**Poisoned**

- Requires an Antidote.
- It is obtained at the medicine table.

A patient has exactly one or two medical needs. Allowed combinations are injury alone, burn alone, poison alone, injury plus burn, and injury plus poison. Burn and poison never coexist in the MVP, and healthy patients are not spawned.

For example, a burned and injured Pikachu needs a Burn Heal and a healing machine, in either order. One patient cannot receive two treatments concurrently. Medicine is instant; healing blocks medicine until it finishes.

HP is a presentation value: 50/100 while healing is pending, otherwise 100/100. Burn and poison do not cause damage over time. Status icons disappear when their corresponding treatment is complete. There is no separate death or deterioration system.

## 3.3. Patience

Each patient receives the initial patience budget from the difficulty configuration at admission. That budget never changes retrospectively, including after a player disconnects.

- Patience decreases in reception, waiting, recovery, during transport, during an outage, and after treatment while awaiting pickup or discharge.
- It pauses only while a working healing machine is advancing that patient's unfinished healing. Preparation and repair do not count as patient treatment; instant medicine does not create a pause interval.
- A completed treatment cannot be repeated or restarted to pause patience again.
- At zero patience, the server removes the patient, clears the carrier's hand or occupied slot, cancels any remaining treatment for that patient, and applies exactly one lost-patient penalty. A brief departure effect is cosmetic and does not retain ownership or block a corridor.

The patience bar remains visible after all treatments finish. Patients must reach the discharge point before either their patience or the round expires. Server boundary ordering is defined in section 9.8.

## 3.4. Initial Pokémon roster

Start with six species, using animations available from PMD Collab:

- Pikachu
- Bulbasaur
- Charmander
- Squirtle
- Eevee
- Psyduck

Species initially share the same medical rules. Their differences are visual, avoiding unnecessary implementation complexity.

---

# 4. Players

## 4.1. Selectable characters

Players also control Pokémon.

Initial characters:

- Chansey
- Audino
- Machoke
- Meowth

All initially have the same abilities, movement speed, and interactions.

Differences are purely cosmetic.

Duplicate character choices are allowed. Every player has a persistent room slot number and name label, so identical species remain distinguishable without relying on color alone.

This simplifies balancing and lets any team complete the tasks.

## 4.2. Cooperation

There are no mandatory professions or classes with exclusive abilities.

Cooperation arises from:

- Limited station availability.
- The need to carry patients and medicine.
- Different needs appearing at the same time.
- Coordination to avoid unnecessary travel.
- Dividing tasks under pressure.

Game logic should let several players cooperate without constantly getting in one another's way.

## 4.3. Conflicts between players

The server manages temporary ownership of objects and patients.

If two players try to pick up the same patient simultaneously, only one succeeds.

The server processes conflicting commands in its accepted order. Each ownership transfer updates both ends atomically. A rejected command changes nothing and reports a reason such as occupied, out of range, wrong treatment, or unavailable during this phase. Occupied stations allow only the actions explicitly listed in section 2.5, such as retrieving a completed patient.

---

# 5. Rounds and difficulty

## 5.1. Structure

A round consists of:

1. Waiting room or lobby.
2. Character selection.
3. Ready confirmation.
4. Starting countdown.
5. Care period.
6. Results screen.
7. Option to play again.

Authoritative room phases are lobby, countdown, running, and results. Character selection and ready status belong to the lobby. Countdown lasts three seconds; arrivals, scoring, and gameplay input start only when the room enters running. Section 9.6 defines admission, host, and replay rules for these phases.

## 5.2. Duration

**MVP setting:** six minutes (360 seconds), excluding the countdown.

Duration is configurable internally for testing, but the first version does not need to offer players a duration setting.

## 5.3. Difficulty scaling

The following are initial tuning values, not a claim of proven balance. Patient rules and map capacities are identical in solo and multiplayer; arrival frequency and the active-patient limit scale with the team.

| Connected players | Base arrival interval | Maximum active patients |
|---|---:|---:|
| 1 | 24 seconds | 4 |
| 2 | 16 seconds | 6 |
| 3 | 12 seconds | 8 |
| 4 | 10 seconds | 10 |

| Elapsed round time | Interval multiplier | Chance of two treatments | Initial patience |
|---|---:|---:|---:|
| 0–119.999 seconds | 1.00 | 10% | 90 seconds |
| 120–239.999 seconds | 0.85 | 25% | 80 seconds |
| 240–329.999 seconds | 0.70 | 40% | 70 seconds |
| 330–359.999 seconds | No new arrivals | Not applicable | Existing budgets unchanged |

The effective interval is the base interval multiplied by the current stage multiplier. The first arrival attempt occurs five seconds after the round starts. Each attempt schedules the next from the current server time; stage changes affect the next scheduled interval, without retroactively advancing an already scheduled attempt. No attempt is admitted at or after 330 seconds. A two-treatment patient is equally likely to need injury plus burn or injury plus poison; single treatments and the six patient species are selected uniformly within their respective groups.

**Saturation:** an attempt is skipped if all four reception slots are occupied or the active-patient limit has been reached. No patient entity, score penalty, or admitted-patient statistic is created. Skipped attempts are not queued or replayed in a burst. The same rule applies to missed scheduler intervals after a server stall: make at most one current attempt, then schedule ahead. Active patients include all locations, including carriers, machines, and recovery.

**Team changes:** use currently connected players, excluding disconnected reservations. On a connection change, cancel the pending arrival and schedule a new attempt one full effective interval later. If the new active limit is below the current population, retain existing patients and skip arrivals until there is capacity. Do not alter existing patience budgets, treatment progress, or the round deadline. With zero connected players, suspend arrivals and new incidents; the round clock and existing patients continue under section 9.7.

The final 30 seconds provide time to clear the center. Playtests must check service throughput and travel time for every team size; shorten routes or reduce arrivals before increasing caps. There is no guarantee that poor coordination, repeated absences, or a full queue can always be recovered from.

## 5.4. Scoring

Points are awarded only on successful discharge, never on treatment completion. The HUD's treated-patient count means discharged patients throughout the game.

| Event | Points |
|---|---:|
| Patient discharged | +100 |
| Bonus for remaining patience | 0 to +50 |
| Patient lost | −50 |
| Patient unfinished at round end | 0 |

For each discharged patient, `bonus = floor(50 × remainingPatience / initialPatience)`, using the server's remaining patience at discharge. Clamp the ratio to 0–1; a zero-patience patient has already been lost and cannot be discharged. Pausing patience during healing never increases it.

`score = 100 × discharged + sum(discharge bonuses) − 50 × lost`. Negative scores are allowed. Skipped arrival attempts do not count as patients or losses.

At results, `admitted = discharged + lost + unfinished`. Success rate is `100 × discharged / admitted`; show one decimal place. If admitted is zero, display `N/A` and award zero stars. Use the exact ratio, before display rounding, for stars:

| Success rate | Stars |
|---|---:|
| Below 50% | 0 |
| At least 50%, below 70% | 1 |
| At least 70%, below 90% | 2 |
| At least 90% | 3 |

These thresholds are initial tuning values shared by all team sizes; adapting arrivals provides the initial solo balance.

**Worked example:** five patients were admitted. Three were discharged with initial patience of 90 seconds and remaining patience of 72, 45, and 18 seconds, giving bonuses of 40, 25, and 10. One patient was lost and one was unfinished. The score is `300 + 75 − 50 = 325`; success is `3 / 5 = 60.0%`, giving one star. The unfinished patient does not incur a loss penalty but remains in the success-rate denominator.

The MVP has no global leaderboard or user accounts.

## 5.5. End of round

The round ends at its authoritative deadline. There is no overtime or new action at or after that instant. All remaining active patients, including fully treated patients awaiting discharge, become unfinished without a loss penalty. Clear carried entities, reservations for preparation/repair, and gameplay timers; freeze one results snapshot. A late or repeated command cannot change it.

The deadline takes precedence over a discharge, patience expiry, treatment completion, or incident scheduled at exactly the same instant. An action is accepted only when processed by the server before the deadline; a client timestamp cannot backdate it. Clients show pending feedback until the server confirms a discharge.

The results screen shows:

- Total score.
- Patients treated.
- Patients lost.
- Patients unfinished and total admitted.
- Success rate.
- Star rating using the thresholds in section 5.4.

Results remain available to connected and reconnecting members until the host returns the room to the lobby. A replay starts a new round with all counters and gameplay state reset, as described in section 9.6.

---
# 6. Special incidents

Incidents are events that temporarily disrupt normal operation of the Pokémon Center.

Their purpose is to add variety, memorable situations, and cooperative pressure.

## 6.1. First incident: Pikachu's electric discharge

An active Pikachu can cause an electrical failure once its remaining patience reaches 50% or less of its initial budget. The server checks eligibility after applying the tick's patient actions and timers. Initial incident rules are:

- No incidents during the first 60 seconds or the final 30 seconds, and none with zero connected players.
- Each Pikachu may trigger at most one outage per round. There is a global 60-second cooldown from the last outage's start, and at most one broken machine at a time.
- Select the eligible Pikachu with the least remaining patience, then stable patient ID; select a working machine by stable station ID. The machine may be empty, treating, or holding a completed patient. The triggering patient need not occupy that machine.
- An outage immediately pauses healing progress and resumes patience consumption for an affected patient. Completed treatment is never undone. A clear visual warning and sound identify the machine.
- With empty hands, one player holds E at the broken machine for two uninterrupted seconds to repair it. Moving, releasing E, losing input, or disconnecting cancels repair and resets repair progress; healing progress remains preserved.
- Repair restores the previous working state. An unfinished treatment resumes from its remaining time; an empty machine stays empty and a completed patient becomes available for pickup or medicine.
- If the patient expires during an outage, remove it and free its occupancy while leaving the machine broken. Repair can still complete normally.

Outages do not spread, destroy objects, or award points. A round may have no naturally eligible Pikachu; the incident acceptance scenario uses a controlled fixture to exercise it reliably.

## 6.2. Future incidents

- Charmander sets a station on fire.
- Snorlax blocks a corridor.
- Psyduck causes temporary confusion.
- Ditto visually changes a patient's identity.
- Rotom interferes with electronic devices.

**These events are outside the MVP**, except for Pikachu's power outage.

---

# 7. Map and visual design

## 7.1. Camera

The MVP uses one fixed top-down camera showing the entire Pokémon Center and HUD. There is no camera following or scrolling. Preserve the map's aspect ratio when fitting the browser viewport.

## 7.2. First map

Use one small Pokémon Center.

Essential elements:

- Entrance and four reception slots.
- Four waiting slots and the pickup-only recovery area.
- Two healing machines.
- Medicine table with two preparation points and one disposal point.
- Four surfaces for placing medicine.
- Corridors and obstacles.
- Discharge area.

All interaction points must be accessible without moving another patient or player. The recovery area and discharge point remain accessible when every ordinary slot is occupied. The layout should create route choices and competition for station access; players do not physically obstruct one another.

## 7.3. Graphics system

- 2D pixel art.
- Sprites with directional animations.
- Rendering without texture smoothing.
- Tileset for the map.
- Separate floor, object, and collision layers.
- Visual depth through Y-coordinate sorting.

The virtual resolution and final tile size will be decided after checking the actual dimensions of the selected assets.

## 7.4. Animations

Animations initially needed:

**Players:**
- Idle.
- Walk.
- Interact, when an appropriate animation is available.

**Patients:**
- Idle.
- Walk, when appropriate.
- Damage or discomfort animation.
- Recovery animation.

Not every species needs a separate animation for every state. Overlaid icons and effects may be used.

---

# 8. Interface and user experience

## 8.1. Main menu

Options:

- Create room.
- Join room.
- Basic audio settings.
- Credits.

## 8.2. Lobby

The lobby shows:

- Room code.
- Connected players.
- Each player's chosen Pokémon.
- Ready / not ready status.
- Start game button for the host.

Registration is not required.

Players enter a name when they join; it is valid only for that session.

Names contain 1–16 visible characters after trimming and are rendered as plain text. Blank names are rejected. The lobby shows reserved disconnected slots and remaining reconnection time. Ready status, character selection, and host controls follow section 9.6; errors for invalid codes, full rooms, and unavailable room phases must be distinct.

## 8.3. In-game HUD

Main elements:

- Round timer.
- Score.
- Patients treated and lost.
- Information about waiting patients.
- Contextual interaction indicator.
- Machine and treatment status.

Information must remain readable without obscuring too much of the map.

## 8.4. Patient indicators

Display above each patient or in a nearby panel:

- Medical condition icon.
- Patience bar.
- Pending treatments.
- Treatment completion indicator.

Treatment icons show an unordered checklist, not a numbered recipe. A separate discharge icon appears when every required treatment is complete; the patience bar remains visible until the patient leaves.

Avoid long text during gameplay.

## 8.5. Audio

Use sound effects for:

- Patient arrivals.
- Picking up and dropping objects.
- Activating machines.
- Completing treatments.
- Treating patients.
- Losing patients.
- Triggering incidents.
- Ending rounds.

Initially use original effects or resources with compatible licenses.

---

# 9. Technical architecture

## 9.1. Stack

**Client**
- TypeScript
- Phaser
- Vite

**Server**
- Node.js
- TypeScript
- Colyseus

**Tools**
- Tiled for map design.
- PMD Collab for compatible sprites.
- Git for version control.

**Persistence**
- Not initially required.

## 9.2. Client responsibilities

The client handles:

- Rendering the map and entities.
- Playing animations.
- Capturing player input.
- Sending actions to the server.
- Interpolating remote movement.
- Displaying synchronized information.
- Playing sounds and visual effects.

The client is not the source of truth for shared state.

## 9.3. Server responsibilities

The server is authoritative over:

- Validated movement and positions.
- Player states.
- Patient spawning.
- Treatments and timers.
- Ownership of carried objects.
- Station availability.
- Scoring.
- Incidents.
- Round timer and end of game.

This prevents inconsistencies when several players interact at the same time.

## 9.4. Communication

Colyseus uses persistent connections to exchange input, actions, and state updates.

Planned initial messages:

| Message | Direction | Purpose |
|---|---|---|
| `player:input` | Client → server | Cardinal movement, facing, and held-interaction intent with round ID and sequence |
| `player:interact` | Client → server | One E press with target ID, expected occupant ID (null for empty targets), round ID, and action sequence |
| `player:ready` | Client → server | Change ready status |
| `player:select` | Client → server | Select character |
| `game:start` | Client → server | Request game start |
| `game:replay` | Client → server | Host requests return from results to lobby |
| `action:result` | Server → requesting client | Action sequence, accepted/rejected outcome, and reason |
| `game:event` | Server → client | One-off event and effects |
| `game:result` | Server → client | Notification that the authoritative results snapshot is available |

Continuous player, patient, and station state is synchronized through Colyseus's state system instead of sending separate messages for each property.

Room phase, round ID, authoritative timestamps, and final results belong to synchronized state. Reconnection must reconstruct the current view even if a one-off event was missed. Cosmetic events have a round-scoped ID so duplicate delivery does not replay a reward or sound.

Every state-changing client command includes the current round ID (null before the first countdown) and a monotonically increasing per-player command sequence. Sequences are not reset on reconnection or replay; a reconnect response provides the last consumed sequence so a reloaded client can continue. Consumed sequences, including rejected commands, cannot be applied again; duplicate requests may receive their previous outcome without a new mutation. Clear held input and movement at every room-phase transition.

Held preparation and repair begin with a validated `player:interact`; subsequent input reports whether E remains held. A release or missing fresh input cancels the hold. The server ignores duplicate or older input sequences and never reapplies an accepted action sequence. Invalid or stale interactions return a reason and do not fall through to another target. IDs identify server-owned entities; clients cannot create patients, transfer ownership, or choose a completion time by sending them.

## 9.5. Update rates

Initial testing configuration:

- Server simulation: 20 updates per second.
- State synchronization: initially 20 updates per second.
- Client rendering: target 60 FPS.
- Input: on change and as a heartbeat, at most 20 messages per second per player.
- Interpolation of remote entities.
- Local movement prediction if needed.

Use server elapsed time for deadlines and durations rather than counting rendered frames. Clear movement and cancel held actions when no fresh input has arrived for 250 milliseconds; stopping input must never leave a character walking indefinitely. This input timeout does not itself remove the player from the room.

These values are configurable and must meet the latency and performance scenarios in sections 13 and 14. Input smoothing or local prediction may be added to meet those targets without changing server authority.

## 9.6. Room management

Each room has:

- Internal identifier.
- Six-character access code using uppercase letters and digits without ambiguous characters; generation retries collisions with live rooms. Entry is case-insensitive.
- Maximum of four players.
- Current phase, host player ID, and round ID.
- Temporary player data.
- Complete Pokémon Center state.

The first version uses a single server instance and in-memory rooms. A server restart ends all rooms; clients return to the menu with a connection error. Restoring rounds after a process restart is outside the MVP.

### Phase and membership rules

| Phase | New member with a room code | Existing member reconnecting within 30 seconds | Host action |
|---|---|---|---|
| Lobby | Allowed if a seat is free | Restore reserved seat; not ready | Start if all conditions below hold |
| Countdown | Rejected with countdown-in-progress message | Restore seat; membership interruption has already cancelled countdown | Countdown proceeds only with the locked ready roster |
| Running | Rejected with game-in-progress message | Resume the same player with empty hands | No pause, restart, or force-finish control |
| Results | Rejected; wait for lobby | Show frozen results | Return everyone to lobby with `game:replay` |

Both connected players and reserved disconnected seats count toward capacity. Only the host may start or request replay; unauthorized requests change nothing. Starting requires 1–4 connected players, a valid character and ready confirmation from each, and no disconnected reservations. Character changes clear that player's ready status. Character and ready changes are rejected outside the lobby.

A successful start locks membership and enters the three-second countdown. Any departure or disconnection during countdown returns the room to lobby and clears all ready flags; no partial round or score is created. A disconnect in the lobby also clears that player's readiness.

The first member is host. When the host leaves or disconnects, ownership immediately transfers to the connected member with the earliest join order, breaking ties by player ID. Returning hosts do not reclaim ownership. If nobody is connected, the room has no active host; the first successful reconnection becomes host.

On replay, preserve the room code, member identities, and character selections; clear ready flags, patients, medicines, station states, locks, results, scores, spawn scheduling, and incident history. Allocate a fresh round ID when the next countdown starts. Messages carrying a previous round ID cannot mutate a new round. Reconnecting to the lobby always requires a new ready confirmation.

Phase 1 may configure a two-seat prototype for validation. The capacity is configurable from the start, and Phase 3 must enable and verify four seats before the complete-round milestone; a two-seat prototype does not meet MVP acceptance.

## 9.7. Disconnections

On server-detected disconnection, clear input, cancel preparation/repair, hide the avatar, and release carried entities in the same state update. A carried patient moves to the first empty waiting slot by slot ID, or joins the end of the recovery queue if waiting is full, retaining patience and medical progress. A carried medicine dose moves to the first free medicine surface, or is discarded if all four surfaces are full. No patient is deleted, healed, or penalized solely because its carrier disconnected.

Preserve the player's ID, character, and seat for 30 seconds from detection, using an opaque server-validated reconnect credential. A name or room code does not establish reconnection identity. A valid return before expiry restores that seat and an empty-handed avatar at the walkable entry point; released objects stay where the server placed them. At or after expiry the reservation is removed. Subsequent code-based joining follows the normal phase rules. Explicitly leaving the room performs the same cleanup but releases the seat immediately, without a reservation.

Remaining players continue playing. When the connected count changes, update future arrivals under section 5.3. When all players disconnect, the round clock, existing healing, and patience continue for the reservation window; new arrivals and incidents stop. The round may enter results during that window and a timely return sees those results. Once no connected members or reservations remain, discard the abandoned gameplay state and reset the room to an empty lobby without publishing an artificial score.

Remove a room after 60 continuous seconds with no connected players, including time spent awaiting reconnection. Any successful join or reconnection cancels that empty-room deadline. The 30-second seat reservation therefore expires before empty-room disposal. A live socket with no fresh input is first stopped by the 250-millisecond input timeout; the transport must declare an unresponsive connection disconnected within ten seconds of its last successful liveness check, triggering the same cleanup.

Clients receive clear reconnecting, reservation-expired, room-closed, and server-unavailable states. They must not display a successfully rejoined avatar or restore an old inventory until the server confirms the current state.

## 9.8. Simulation ordering and atomicity

Advance timers to the current server time before processing newly queued gameplay commands. Account for partial intervals: if healing completes halfway through an update, patience resumes for the remainder. Process timer boundaries chronologically; ties use round deadline first, then patience/input expiry, then healing/preparation/repair completion. An expired input hold cannot finish preparation or repair. An outage follows the timer and command processing described below. A discharge processed at the exact patience-expiry time loses the race; at the exact round deadline the patient is unfinished instead.

After advancing timers and applying connection cleanup, process valid commands in server acceptance order. Range and occupancy are checked against the state at execution, not the client's last snapshot. Then evaluate incidents and arrival attempts for the current time. If the round has ended, skip all further gameplay processing. Duplicate messages, concurrent pickups, a late medicine application, and a treatment completion for a removed patient must never duplicate an entity, complete a terminal patient, or change results.

Use monotonic elapsed time for simulation and expose sufficient server timing state for the HUD. Do not trust client clocks for ordering or scoring. Rendering may interpolate positions, but must not decide ownership or treatment completion.

---

# 10. Proposed project structure

A monorepo is recommended to share types, constants, and gameplay definitions.

```text
pokecenter-panic/
├── apps/
│   ├── client/
│   │   ├── src/
│   │   │   ├── scenes/
│   │   │   ├── entities/
│   │   │   ├── systems/
│   │   │   ├── ui/
│   │   │   ├── network/
│   │   │   └── main.ts
│   │   └── public/
│   │       └── assets/
│   │           └── external/ (third-party resources downloaded locally; not tracked)
│   └── server/
│       └── src/
│           ├── rooms/
│           ├── state/
│           ├── systems/
│           └── index.ts
├── packages/
│   └── shared/
│       └── src/
│           ├── constants/
│           ├── types/
│           └── config/
├── docs/
├── package.json
└── README.md
```

## 10.1. System organization

Divide the logic into:

- **PlayerSystem:** movement, interaction, and connection.
- **PatientSystem:** patient states, patience, and treatment.
- **StationSystem:** station occupancy and operation.
- **SpawnSystem:** patient generation and difficulty scaling.
- **TreatmentSystem:** treatment validation and application.
- **IncidentSystem:** incident triggering and resolution.
- **ScoreSystem:** scoring and statistics.
- **GameFlowSystem:** lobby, round, and results states.

Species, treatment, station, and incident configuration should be declarative where possible.

---
# 11. Visual asset management

## 11.1. Primary source

**PMD Collab Sprite Repository**

https://sprites.pmdcollab.org/#/

Pokémon Mystery Dungeon sprites will be the main visual reference for players and patients.

## 11.2. Integration

Before implementing a large number of Pokémon, develop an asset importer or pipeline that:

1. Identifies available sprites and animations.
2. Converts the necessary formats into Phaser-compatible resources.
3. Preserves animation directions and timing.
4. Generates metadata for each Pokémon.
5. Associates the required credits.

Prioritize reusing one animation system across all species.

Third-party resources will be consumed from an authorized external source or a local cache ignored by Git. The pipeline will not include copies of these resources in the repository. When introducing a resource, document its source, terms of use, and required attribution in a text manifest. Before relying on a remote URL, check its access terms, availability, and browser compatibility.

## 11.3. Map assets

Investigate tilesets compatible with PMD's visual style to build the Pokémon Center.

Missing resources, such as stretchers, counters, and medical stations, will be created as original sprites.

## 11.4. Rights and attribution

PokéCenter Panic is a noncommercial fan game.

However, using Pokémon characters, names, and visual assets remains subject to the rights of their owners. PMD Collab's attribution terms do not guarantee authorization from The Pokémon Company to distribute a fan game.

Review the origin and license of every resource, maintain a credits file, and recognize that a public release may receive a rights claim.

Do not use resources without checking their terms of use.

The public repository will not include third-party sprites, audio, fonts, tilesets, or other resources, even if the game can consume them from authorized sources.

The project's original code will be published under GNU GPL version 3 only (`GPL-3.0-only`). Distributed derivative versions must comply with its terms, including source code availability. The license allows commercial use of the original code; the fan game itself remains noncommercial. The GPL does not grant rights to Pokémon or third-party resources.

---

# 12. Development plan

## Phase 1 — Technical prototype

**Goal:** validate movement and connectivity.

- Create the Phaser and Vite project.
- Create the Colyseus server.
- Implement room creation and joining.
- Keep capacity configurable; this prototype may use two seats, with four required in Phase 3.
- Display a provisional map.
- Implement movement for two players.
- Synchronize positions.
- Add basic collisions.
- Validate collisions against shared map geometry on the server; players pass through one another.
- Implement input timeout and transport-disconnection detection before relying on persistent input.

**Outcome:** two players move together on the same map.

## Phase 2 — Interactions and patients

**Goal:** validate the core mechanic.

- Add PMD sprites.
- Create the patient system.
- Implement picking up and carrying patients.
- Create reception.
- Create the first healing machine.
- Implement treatment completion and discharge.
- Synchronize all interactions.
- Enforce patient ownership invariants and simultaneous-pickup rejection.
- Implement waiting/recovery placement and carrier-disconnection cleanup with the first carrying mechanic.

**Outcome:** players can treat a patient from arrival to discharge.

## Phase 3 — Complete gameplay loop

**Goal:** create a functional round.

- Add medicine and status conditions.
- Create automatic patient generation.
- Add patience.
- Implement scoring.
- Add a timer.
- Implement the lobby, game start, and results.
- Enable four-seat rooms and validate the same loop with 1, 2, 3, and 4 players.
- Implement host transfer, the 30-second reconnect window, countdown cancellation, and replay reset.
- Implement queue saturation, the final arrival cutoff, and exact deadline/scoring rules.

**Outcome:** a complete six-minute round with 1–4 players, reproducible results, and a working replay in the same room.

## Phase 4 — Cooperation and balancing

**Goal:** make the game fun.

- Adjust patient arrival frequency.
- Adjust treatment times.
- Playtest with 1–4 players.
- Optimize routes and collisions.
- Add Pikachu's electrical incident.
- Add audio and visual feedback.
- Check solo medicine handling, outage repair, and the effect of a mid-round team reduction.

**Outcome:** a first playable cooperative version.

## Phase 5 — Polish and release

**Goal:** share the game with friends.

- Improve the interface.
- Replace placeholder resources.
- Optimize initial loading.
- Adjust resolution and scaling.
- Verify reconnections and errors under the latency/disconnection scenarios in sections 13 and 14.
- Add credits.
- Prepare the web and server deployment.
- Execute the complete acceptance matrix and record browser, hardware, balance configuration, and measured results.

**Outcome:** a private beta for testing.

---

# 13. Nonfunctional requirements

## Performance

- Supported beta browsers are desktop Chrome and Firefox stable at release; record the exact tested versions and operating systems. Minimum supported viewport is 1280 × 720 CSS pixels. Touch controls are outside the MVP.
- Target 60 FPS with four players and ten active patients in one foreground client over a six-minute round. On the recorded reference desktop, median frame time must be at most 16.7 milliseconds and the 95th percentile at most 25 milliseconds, excluding initial loading. Record CPU, GPU, RAM, viewport, and build; this is a release target, not a measured result yet.
- At that room load, server simulation processing must remain below 25 milliseconds at the 95th percentile, within the 50-millisecond update budget. This validates one full room, not unspecified concurrent-room capacity.
- Avoid unnecessary loading during rounds.
- Use atlases and sprite sheets where appropriate.
- After ten consecutive join/play/leave cycles, verify that disposed rooms have no entity records or scheduled callbacks and clients retain no listeners or timers belonging to exited scenes. Replay must not multiply spawn or incident timers.

## Networking

- Authoritative simulation.
- Validation of every action.
- Run complete four-player rounds at both 100 and 200 milliseconds simulated round-trip latency, with up to ±30 milliseconds jitter and 1% packet loss. Confirmed interaction feedback must arrive within 500 milliseconds at the 95th percentile while connected; no duplicate ownership, phantom treatments, or divergent final results are allowed. Report the network emulator and actual configuration.
- Validate stale-input stopping, abrupt connection loss, and reconnect success/expiry independently; they are different failure modes.
- Recover synchronized state after reconnection without requiring replay of transient events. All connected clients must display the same patient counts, score, phase, and results after synchronization settles.

## Security

- Validate received messages and parameters.
- Initial inbound limits are 1 KiB per gameplay message, 40 messages per second per connection with a burst allowance of 40, and ten new interaction actions per second with a burst allowance of ten. Exceeding a limit rejects the excess without changing game state; sustained abuse may close the connection through the normal cleanup path. These limits allow the 20 Hz input heartbeat.
- Do not trust positions or scores sent directly by the client.
- Validate phase permissions and host identity on the server, and prevent duplicate action sequences or previous-round commands from changing state.
- Keep reconnect credentials private to their connection; never expose them in shared room state or logs. Render player names as plain text.
- Configure finite limits for room creation and code-join attempts before deployment; private rooms are not publicly listed. An access code grants ordinary membership only, never host or reconnect authority.
- Avoid exposing internal server information.

## Accessibility

- Simple, consistent controls.
- Medical conditions represented by icons, not just colors.
- Adjustable volume.
- Clear interaction indicators.
- Show holding progress and rejection reasons using icons or short text as well as sound; the game remains playable muted.
- Distinguish players by slot number and name even when they select identical species.

---
# 14. MVP acceptance criteria

The MVP is complete when the following scenarios pass. Deterministic server tests should use a controllable clock and seeded patient selection; user-visible interaction, layout, and network scenarios also require browser/playtest verification. Record evidence against each scenario. These are requirements for future implementation, not completed tests for this document revision.

| ID | Scenario | Required observable result |
|---|---|---|
| AC-01 | Create a room and join from three other browser sessions; attempt a fifth join and an invalid code | Four distinct members share one room; full-room and invalid-code errors are clear; no extra seat is allocated |
| AC-02 | Select characters, including duplicate species; start with an unready member or from a non-host client | Players remain distinguishable; invalid starts change nothing; one ready solo player or all ready team members can start a three-second countdown |
| AC-03 | Disconnect during countdown, then attempt new code-based joins during running and results | Countdown cancels to lobby with all ready flags cleared; new joins during running/results are rejected without disturbing the round |
| AC-04 | Move toward walls, another player, and a target across a wall; open the menu or stop input | Map collisions remain authoritative, players pass through each other, interaction cannot cross walls, menu does not pause the round, and movement/held actions stop after 250 ms without fresh input |
| AC-05 | Two players pick up the same patient in the same update, including the front of recovery, then repeat/retry the winning command | Exactly one carrier owns that patient; the loser gets feedback instead of a different queued patient; no duplicate entity or repeated action occurs |
| AC-06 | A solo player treats injury plus burn, then injury plus poison, using both treatment orders | Waiting placement, medicine preparation/application, healing, pickup, and discharge work without another player; no fixed treatment order is enforced |
| AC-07 | Use wrong or redundant medicine; try medicating a carried/treating patient; cancel preparation | Invalid actions change neither dose nor patient; cancelled preparation creates no dose and releases its lock; held E never produces multiple doses |
| AC-08 | Attempt all invalid placements and simultaneous use of one medicine surface or preparation point | Hands and ownership stay consistent; one claimant succeeds; clear rejection feedback appears; disposal accepts only medicine |
| AC-09 | Observe patience during transport, waiting, healing, completed-machine occupancy, and recovery; expire a carried patient | Only advancing healing pauses patience; expiry clears the carrier's hand and increments lost/penalty exactly once; a late medicine action cannot revive the patient |
| AC-10 | Use a controlled eligible Pikachu to interrupt healing after one second; cancel and then complete repair | Three seconds of healing remain; patience runs during the outage; cancelled repair resets repair progress only; successful repair resumes healing; cooldown and one-broken-machine limits hold |
| AC-11 | Expire a patient inside a broken machine, then finish repair | The patient is lost once, occupancy is released, and repair restores an empty working machine without completing the removed patient's treatment |
| AC-12 | Fill reception or the active-patient limit, then advance several spawn intervals and free a slot | Attempts are skipped without entities, losses, or admitted-count changes; no accumulated burst occurs; the next scheduled eligible attempt admits one patient |
| AC-13 | Run with 1, 2, 3, and 4 players; cross difficulty stages; disconnect a player while above the reduced cap | Configured intervals, treatment mixes, patience budgets, and caps apply; existing patients are preserved; future spawns use the new team size; no admission occurs at or after 330 seconds |
| AC-14 | Reproduce section 5.4's five-patient scoring example and the empty-round case | Results show 325 points, three discharged, one lost, one unfinished, 60.0%, and one star; zero admissions give zero score, N/A success, and zero stars |
| AC-15 | Discharge before, exactly at, and after the round deadline; expire patience exactly at the deadline | Only the pre-deadline discharge succeeds; every remaining patient is unfinished; score/result snapshot never changes afterward; a pre-deadline patience/discharge tie instead produces one loss |
| AC-16 | Disconnect while carrying a patient with all waiting slots full; separately disconnect with medicine and full surfaces | Within one simulation update after detection, patient enters accessible recovery unchanged, medicine is discarded, avatar disappears, and all player preparation/repair locks are released |
| AC-17 | Abruptly lose transport; reconnect with a valid credential before 30 seconds, at expiry, and with an invalid credential | Detection meets the ten-second liveness bound; timely return restores only the reserved identity with empty hands; expired/invalid returns cannot reclaim that seat or inventory |
| AC-18 | Disconnect the host, reconnect it, and disconnect all members | Earliest remaining member becomes host; former host does not reclaim control; no arrivals/incidents occur with nobody connected; timely return sees the advanced round/results; expired abandonment resets to lobby and 60-second emptiness disposes the room |
| AC-19 | Finish a round, request replay, and start again; deliver an old-round interaction | Code and character selections persist; readiness, entities, counters, locks, outages, and timers reset; old-round input has no effect and spawns do not double |
| AC-20 | Complete the performance, latency, and ten-cycle cleanup scenarios in section 13 | Recorded measurements meet the specified budgets and all clients agree on final state; disposed rooms/scenes retain none of their gameplay resources |
| AC-21 | Load the deployed game in both supported browsers at the minimum viewport, with audio muted | No installation is needed; whole map, HUD, target/progress/rejection indicators, and credits remain usable; a full solo and cooperative round can be completed |
| AC-22 | Send malformed, oversized, excessive, unauthorized, and repeated messages | The server rejects them without partial state changes or a room crash; subsequent valid actions still work for connected clients |

Balance playtests must include at least three complete rounds per team size, recording admitted/discharged/lost/unfinished counts, scores, outage count, and brief feedback about waiting versus overload. If results require tuning, update the configuration tables and examples consistently before accepting the beta; do not silently change the gameplay rules.

---

# 15. Features outside the MVP

The following ideas are deliberately excluded from the first version:

- A campaign and multiple Pokémon Centers.
- Dozens or hundreds of species.
- Character evolutions.
- Class abilities.
- Hospital customization.
- Cosmetic unlocks.
- Global leaderboards.
- Persistent accounts and profiles.
- Built-in voice chat.
- Full mobile support.
- Competitive mode.
- Level editor.
- Complex medicine crafting system.
- Weekly events.
- Monetization.

Consider these only after confirming that the core loop is fun.

---

# 16. Decisions and remaining tuning

## 16.1. Decisions fixed for the MVP

| Topic | Version 0.2 decision |
|---|---|
| Treatment order | Any compatible order; all required treatments must finish before discharge |
| Patient state | Separate location, medical progress, and lifecycle; discharge readiness is derived |
| Carrying and medicine | One entity per player; medicine applies only to stationary, available patients; waiting slots support solo play |
| Player collisions | Map collisions only; players pass through one another |
| Controls and camera | Cardinal keyboard movement, contextual E, local menu without pause, fixed whole-map camera |
| Patience | Paused only during advancing healing; continues during transport, outages, and the trip to discharge |
| End of round | Hard 360-second deadline; remaining patients unfinished; explicit score, success, and stars in section 5.4 |
| Room lifecycle | New joins only in lobby; automatic host transfer; 30-second reconnect reservation; 60-second empty-room disposal |
| Difficulty | Initial tables for 1–4 players, bounded queues, skipped overflow arrivals, and a 30-second final clearing period |
| Prototype capacity | Two-seat validation in Phase 1; four-seat support and acceptance in Phase 3 |
| Carrying visuals | Generic stretcher and condition-marked medicine bottle, with no species-pair animations |

## 16.2. Work that still needs evidence

**Art sizing:** select the tileset, sprite scale, and virtual resolution after inspecting approved assets. Preserve the fixed camera, reachable interaction points, and minimum viewport contract. Validate the importer with one species before expanding the roster.

**Balance:** playtest the explicitly specified arrival, patience, healing/preparation/repair, and star values with each team size. Tune numeric configuration while preserving the interaction and lifecycle rules; record changes in this document.

**Performance and feel:** record a reference desktop and test the section 13 budgets under real rendering and simulated network load. Choose interpolation settings and add local movement prediction if required by those measurements.

**Deployment:** select hosting and configure finite room-creation/join-attempt limits before the beta. Validate external asset availability and credits using the existing asset policy in section 11.

Touch controls, mobile support, and other excluded features remain outside the MVP and do not block this baseline.

---

# 17. Principles for controlling scope

1. **Picking up and treating one patient must be fun first.**
2. Do not add new systems before completing the core loop.
3. Pokémon should share behaviors whenever possible.
4. Special events should build on existing systems.
5. Prioritize cooperation over the amount of content.
6. No future feature should be required to release a private beta.

The priority is to produce a playable prototype for friends quickly, learn from the first rounds, and evolve only what adds real fun.

---

# 18. Revision history

| Version | Changes |
|---|---|
| 0.1 | Initial functional and technical draft |
| 0.2 | Resolved treatment order and player collisions; separated patient state dimensions; added interaction and transition tables, solo medicine rules, patience and outage semantics, difficulty/saturation defaults, exact scoring and deadline behavior, room/reconnect/replay rules, measurable acceptance scenarios, and the prototype-to-four-player milestone |

**End of document — Version 0.2**
