# PokéCenter Panic — Level campaign design

**Status:** Design proposal; not implemented. Balance values are initial tuning values pending playtests.\
**Updated:** 2026-10-21\
**Related:** [specification](specification.md) (sections 2, 3, 5, 6 and 7)

This document proposes a first campaign of five levels that ramps from a guided introduction to frantic four-player rounds, in the spirit of *Overcooked*. Each level introduces at most one new idea, then the following level makes the team use it under pressure.

Where a level relies on a mechanic that does not exist yet, it is marked **(future)** and summarised in [section 4](#4-future-mechanics-used-by-the-campaign). Those mechanics need a specification update before implementation. Level 3 deliberately matches the current MVP rules and map so that the existing implementation remains the campaign's reference point.

---

# 1. Campaign overview

| # | Name | New idea | Duration | Healing machines | Prep points | Seats | Species | Two-treatment chance | Initial patience | Incidents |
|---|---|---|---:|---:|---|---:|---:|---|---|---|
| 1 | Pallet Clinic | Carry, heal, Burn Heal, discharge | 3 min | 1 | Burn Heal | 4 | 3 | 0% | 120 s | None |
| 2 | Viridian Center | Antidote, two-treatment patients, two routes | 4 min | 2 | Burn Heal, Antidote | 6 | 5 | 15% | 100 s | None |
| 3 | Cerulean Center (MVP map) | Full center, recovery queue, Pikachu outage | 6 min | 2 | Burn Heal, Antidote | 8 | 6 | 10% → 40% | 90 → 70 s | Pikachu outage |
| 4 | Lavender Split Wing | Separated wings, pass-through hatch, fire | 6 min | 3 | Burn Heal, Antidote | 8 | 6 | 25% → 45% | 85 → 65 s | Outage, Charmander fire (future) |
| 5 | Saffron Emergency | Split medicine tables, blocked corridors, ambulance waves | 6 min | 3 | Burn Heal, Antidote (separate tables) | 8 | 6 | 35% → 55% | 80 → 60 s | Outage, fire, Snorlax, Psyduck (future) |

## 1.1. Difficulty levers

Difficulty increases through these levers, applied roughly in this order:

1. **Recipe variety:** more treatment kinds, then two-treatment patients, then a higher share of them.
2. **Arrival pressure:** shorter arrival intervals and higher active-patient caps.
3. **Patience:** lower initial budgets, so mistakes cost patients sooner.
4. **Travel:** longer, split or partly blocked routes that reward dividing the work.
5. **Disruption:** incidents that temporarily remove a station or a route.

Each level adds no more than one new lever at a time.

## 1.2. Shared rules

- All levels use the movement, interaction, patient, scoring and star rules from the specification. Stars use the shared success-rate thresholds in section 5.4.
- Arrival tables follow the section 5.3 rules: each cell is **arrival interval / maximum active patients** for 1–4 connected players. Saturated attempts are skipped, never queued. The active-patient cap never exceeds ten, which is the recovery queue capacity.
- New arrivals stop 30 seconds before the round deadline so the team can clear the center.
- Every level has a recovery area, a discharge point that arrivals never occupy, and at least one waiting seat per maximum solo active patient.
- Walkable corridors are at least two tiles (96 units) wide; the player collision body is 80 units wide.
- **Progression:** the MVP has no persistence, so the host can choose any level in the lobby. If campaign progress is added later, the next level unlocks with at least one star on the previous one.

## 1.3. Floor plan legend

One character represents one 48-unit tile. Footprints are approximate; final coordinates belong in shared map data when the level is implemented.

| Symbol | Meaning |
|---|---|
| `#` | Wall |
| `.` | Floor |
| `D` | Entrance door |
| `=` | Reception counter or solid divider |
| `R` | Reception check-in section of the counter |
| `X` | Discharge point |
| `W` | Waiting seat (benches are solid) |
| `V` | Recovery area |
| `HHH` | Healing machine footprint (3 × 2 tiles) |
| `M` | Medicine table body |
| `B` / `A` | Burn Heal / Antidote preparation point |
| `T` | Medicine disposal point |
| `S` | Medicine surface |
| `O` | Decorative obstacle (plants, island counter) |
| `P` | Player spawn |

---

# 2. Levels

## Level 1 — Pallet Clinic

**Goal:** learn the core loop without pressure. Suitable for solo play and first sessions.

```
################
#HHH...MBMT..SS#
#HHH...........#
#.........VVVV.#
#==RRR===XX=...#
#..............#
#....P..P......#
#..............#
#.WWWW.........#
#..............#
#######DD#######
```

**Layout:** a compact 16 × 11 tile room. The counter separates the public lobby from the medical area with one wide gap on the right. One healing machine sits in the left corner, and a short medicine table offers only Burn Heal. Two medicine surfaces let players practise placing doses.

| Setting | Value |
|---|---|
| Duration | 180 s; last arrival at 150 s |
| Stations | 1 healing machine, 1 Burn Heal point, 1 disposal point, 2 surfaces, 4 seats, recovery |
| Species | Pikachu, Charmander, Squirtle (uniform) |
| Treatments | Injury 50%, burn 50%; no combinations, no poison |
| Initial patience | 120 s |
| Incidents | None; Pikachu outages are disabled |

**Scripted opening:** at 3 s an injured Pikachu (healing machine only), at 25 s a burned Charmander (Burn Heal only), and at 45 s an injured Squirtle that arrives while the first patient may still be awaiting discharge. Random arrivals start after 60 s.

| Connected players | 0 s onward |
|---|---:|
| 1 | 20 s / 3 |
| 2 | 18 s / 3 |
| 3 | 16 s / 4 |
| 4 | 14 s / 4 |

**Design intent:** every patient needs one action, so a single player can always keep up. Four seats and long patience make it hard to lose a patient. Contextual hints, already active on the MVP map, explain each first interaction.

## Level 2 — Viridian Center

**Goal:** introduce the Antidote and the first two-treatment patients, and give the team a choice between two routes.

```
#####################
#HHH...MBMTMAM...HHH#
#HHH.............HHH#
#.......SSSS........#
#..............VVVV.#
#..===RRR===XX===...#
#...................#
#......P.P.P.P......#
#...................#
#.WWW...........WWW.#
#...................#
#########DDD#########
```

**Layout:** 21 × 12 tiles. Two healing machines stand in the medical corners, with a central table offering both Burn Heal and Antidote and four medicine surfaces. The counter has a narrow left gap and a wider right gap near discharge, so the team starts to choose routes.

| Setting | Value |
|---|---|
| Duration | 240 s; last arrival at 210 s |
| Stations | 2 healing machines, Burn Heal and Antidote points, 1 disposal point, 4 surfaces, 6 seats, recovery |
| Species | Pikachu, Charmander, Squirtle, Bulbasaur, Eevee (uniform) |
| Treatments | Injury 35%, burn 25%, poison 25%, injury + burn 7.5%, injury + poison 7.5% |
| Initial patience | 100 s |
| Incidents | None |

**Scripted opening:** the first poisoned patient arrives at 20 s so that the Antidote point is noticed early. The first two-treatment patient appears no earlier than 45 s.

| Connected players | 0–59.999 s | 60 s onward |
|---|---:|---:|
| 1 | 16 s / 4 | 13 s / 5 |
| 2 | 14 s / 5 | 11 s / 6 |
| 3 | 12 s / 5 | 10 s / 7 |
| 4 | 11 s / 6 | 9 s / 7 |

**Design intent:** two machines and two preparation points let pairs split naturally into a healer and a medic. Two-treatment patients teach that treatments can be done in either order, for example medicine on a waiting seat before healing.

## Level 3 — Cerulean Center (MVP map)

**Goal:** play the full MVP center: eight seats, the recovery queue and the first incident.

```
############################
#..........................#
#..........................#
#..HHH....MMBMTMAMM...HHH..#
#..HHH....MMMMMMMMM...HHH..#
#..HHH................HHH..#
#..........SSSS............#
#...................VVVVV..#
#..........................#
#====RRRRRRRRRRRR==XX......#
#..........................#
#...........PPPP...........#
#..........................#
#..........................#
#..........................#
#..........................#
#....WWWW...........WWWW...#
#..........................#
############DDDD############
```

**Layout:** approximates the implemented clinic in `packages/shared/src/map.ts`. A divider continues the counter to the left wall, so the only route between the lobby and the medical area is the wide right-hand corridor beside discharge.

| Setting | Value |
|---|---|
| Duration | 360 s; last arrival at 330 s |
| Stations | 2 healing machines, Burn Heal and Antidote points, 1 disposal point, 4 surfaces, 8 seats, recovery |
| Species | All six MVP species (uniform) |
| Treatments and patience | Timed-round schedule from specification section 5.3: 10% / 25% / 40% two-treatment chance and 90 / 80 / 70 s patience (implemented) |
| Incidents | Pikachu electric outage (specification section 6.1) |

**Arrivals:** use the implemented three-stage table from specification section 5.3 unchanged (opening 18 / 16 / 14 / 12 s, through busy 10 / 9 / 8 / 7 s).

**Guided opening (implemented):** an injured Pikachu, a burned Charmander, a poisoned Bulbasaur and an injured, burned Squirtle arrive first, so the team meets the healing machine, both preparation points and a two-treatment patient before random admissions start. First-use tips and the discharge streak from specification sections 8.3 and 5.4 are active on this map.

**Design intent:** the single corridor creates real travel cost, and the outage is the first time a station disappears mid-round. This level is the MVP acceptance target, so its values must stay aligned with the specification.

## Level 4 — Lavender Split Wing

**Goal:** force the team to divide the center into zones and pass work across them.

```
############################
#............#.............#
#.HHH....HHH.#..MMBMTMAMM..#
#.HHH....HHH.#..MMMMMMMMM..#
#............S...SS........#
#............S.............#
#............#.......VVVVV.#
#............#.............#
#..=======RRRRRR=====XX==..#
#..........................#
#..........PPPP............#
#......HHH.................#
#.WWWW.HHH........OO...WWWW#
#..........................#
############DDDD############
```

**Layout:** a wall splits the medical area into a **healing wing** on the left (two machines plus a third machine described below) and a **medicine wing** on the right (table and recovery). The wings connect only through the public lobby, using a narrow corridor at each end of the counter. Two medicine surfaces are built into the dividing wall as a **pass-through hatch**: a dose placed from one side can be picked up from the other. The hatch uses the existing one-tile surface reach and needs no new rule.

The third healing machine sits in the lobby next to the left bench. It is close to arrivals but far from medicine, which tempts teams into longer routes for two-treatment patients.

| Setting | Value |
|---|---|
| Duration | 360 s; last arrival at 330 s |
| Stations | 3 healing machines, Burn Heal and Antidote points, 1 disposal point, 2 hatch surfaces + 2 table surfaces, 8 seats, recovery |
| Species | All six MVP species (uniform) |
| Two-treatment chance | 25% (0–119.999 s), 35% (120–239.999 s), 45% (240 s onward) |
| Initial patience | 85 s, 75 s, 65 s for the same periods |
| Incidents | Pikachu outage; Charmander fire **(future)** |

| Connected players | 0–59.999 s | 60–179.999 s | 180 s onward |
|---|---:|---:|---:|
| 1 | 15 s / 5 | 12 s / 6 | 11 s / 7 |
| 2 | 12 s / 6 | 10 s / 8 | 8 s / 9 |
| 3 | 10 s / 7 | 8 s / 9 | 7 s / 10 |
| 4 | 9 s / 8 | 7 s / 10 | 6 s / 10 |

**Design intent:** the best strategy is a medic who stays in the medicine wing and feeds doses through the hatch, while healers shuttle patients. Solo players must plan the long loop carefully, so solo values are gentler.

## Level 5 — Saffron Emergency

**Goal:** a frantic finale that combines every previous idea with frequent disruption.

```
############################
#MMBMT.......HHH......TMAMM#
#SS..........HHH........SS.#
#..........................#
#.HHH....OOOOOOOO....HHH...#
#.HHH....OOSSSSOO....HHH...#
#..........................#
#..................VVVVV...#
#..====RRRRRRRRRRRR==XX==..#
#..........................#
#...........PPPP...........#
#..........................#
#.WWWW...OO........OO..WWWW#
#..........................#
############DDDD############
```

**Layout:** the medicine table is split in two. **Burn Heal** is in the top-left corner and **Antidote** in the top-right, each with its own disposal point and two surfaces. Three healing machines surround a central island that holds four shared surfaces and forces players to walk around it. The counter has two narrow corridors, one at each end; Snorlax can block one of them.

| Setting | Value |
|---|---|
| Duration | 360 s; last arrival at 330 s |
| Stations | 3 healing machines, 1 Burn Heal and 1 Antidote point on separate tables, 2 disposal points, 8 surfaces, 8 seats, recovery |
| Species | All six MVP species (uniform) |
| Two-treatment chance | 35% (0–119.999 s), 45% (120–239.999 s), 55% (240 s onward) |
| Initial patience | 80 s, 70 s, 60 s for the same periods |
| Incidents | Pikachu outage; Charmander fire, Snorlax corridor block, Psyduck confusion and ambulance waves **(future)** |

| Connected players | 0–59.999 s | 60–179.999 s | 180 s onward |
|---|---:|---:|---:|
| 1 | 13 s / 5 | 11 s / 6 | 9 s / 7 |
| 2 | 11 s / 6 | 9 s / 8 | 7 s / 9 |
| 3 | 9 s / 8 | 7 s / 9 | 6 s / 10 |
| 4 | 8 s / 8 | 6 s / 10 | 5 s / 10 |

**Ambulance waves (future):** at 120 s and 240 s, up to three patients arrive two seconds apart, subject to the usual seat and cap limits. Skipped wave arrivals are not replayed.

**Design intent:** split preparation points make each medicine a separate trip, the island punishes careless routes, and blocked corridors force the team to reroute. Three stars here require clear roles and constant communication.

---

# 3. Throughput sanity check

These rough estimates support the initial tuning and must be replaced by playtest data. Players move at 144 units per second, about three tiles per second.

| Task | Approximate player time |
|---|---:|
| Seat → healing machine → (4 s unattended healing) → discharge | 12–18 s |
| Prepare a dose (2 s) and walk to a seated patient | 5–9 s |
| Seated medicine-only patient → discharge after medicine | 4–7 s |
| Two-treatment patient, efficient order | 18–26 s |

With these estimates one player handles roughly three to four patients per minute on Level 1 and two to three on Level 5. The solo arrival intervals above keep saturation intermittent rather than constant. Larger teams receive faster arrivals, but their caps stay at ten or lower.

---

# 4. Future mechanics used by the campaign

These mechanics come from specification section 6.2 or from this campaign. They are proposals only and need rules, acceptance scenarios and tests before implementation.

| Mechanic | First level | Proposed rule |
|---|---|---|
| Contextual hints | 1 | Implemented on the MVP map (specification section 8.3): short prompts show the first time each interaction becomes available. They disappear after use and never block input. |
| Charmander fire | 4 | An active Charmander at 40% patience or less can ignite one medicine preparation point or healing machine once per round. The station cannot be used until a player with empty hands holds E for two seconds beside it. Fire does not spread. Same cooldown and timing limits as the Pikachu outage, with at most one broken or burning station at a time. |
| Snorlax corridor block | 5 | Every 75 s, Snorlax sleeps in one counter corridor for 20 s. It never blocks both corridors, never blocks a corridor occupied by a player, and never makes the discharge point, recovery or any station unreachable. |
| Psyduck confusion | 5 | An active Psyduck at 30% patience or less can confuse the nearest player for four seconds. The player's left/right input is reversed, with a clear visual indicator. At most once per Psyduck and never during the final 30 seconds. |
| Ambulance waves | 5 | Timed bursts of up to three arrivals. They follow saturation rules and never exceed the active cap. |
| Split medicine tables | 5 | Map data supports more than one medicine table and more than one disposal point. No rule change is needed beyond multiple station instances. |
| Level selection | All | The host chooses a level in the lobby. The level ID is part of room state and is reset on replay only if the host changes it. |

---

# 5. Implementation notes

The current code hard-codes one map and one difficulty schedule. Making levels playable would require these changes, which should be tracked as separate cards on the project board:

- Move station positions, obstacles, seats and spawn points from module constants in `packages/shared/src/map.ts` and `medicine.ts` into a level definition. Support a variable number of healing machines, preparation points, disposal points and surfaces.
- Drive `RoomArrivals` from per-level arrival stages, species pools, treatment weights, patience schedules, scripted openings and the final-arrival cutoff.
- Build the client 3D room and 2D collision projection from level data rather than a single fixed layout. Frame the camera so smaller rooms are not lost in the 1324 × 892 clinic frame.
- Add automated level validation: every station and recovery area is reachable from every spawn, corridors fit the player body, the discharge point stays reachable with all seats occupied, and every treatment in a level's pool has a matching station.
