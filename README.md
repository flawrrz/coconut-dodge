# Coconut Dodge

A small browser game for [start.ng](https://start.ng). The palms are dropping coconuts: dodge them as your own start.ng character, catch the naira coins, grab hearts to heal, pick up power-ups, and survive as long as you can.

Play it at **https://coconut-dodge.start.ng**.

## Controls

- Arrow keys or A / D to move
- Mouse: hold and drag to move
- Touch: drag — the character follows how far your finger moves, so it never ends up under it
- P or Esc to pause; the buttons in the top right pause, mute sound effects, toggle the music, and go full screen

## What's in a run

- **Coconuts** fall faster and more often the longer you last. Golden ones pay 200 if you let them land; splitting ones break into two mid-air.
- **Palm bursts**: a rustle and a red marker, then a cluster of coconuts in that column. Yellow chevrons mark aimed drops.
- **Coins** chain: 3 in a row within 2.5 seconds pays x2, 6 pays x3. A bonk breaks the chain.
- **Near misses** pay 25, and dodging anything scores over time.
- **Hearts** restore a life. **Power-ups** stack if you catch one while it's already running: shield (7s, bounces coconuts), magnet (9s, pulls in coins, hearts and power-ups), slow-mo (6s).

## Sound and accessibility

Sound effects and the background loop each have their own toggle, and both choices are remembered. With the system's "reduce motion" setting on, the game drops the screen shake, slows the invulnerability flash, and stops the blinking power-up chips. Scores are announced to screen readers when a run ends.

## How it works

Plain HTML, CSS and JavaScript (ES modules and a canvas), with no build step and no dependencies.

- `startng.js` talks to start.ng through its hidden connect page (`startng:whoami`, `startng:score`, `startng:leaderboard`).
- `character.js` draws the player's start.ng character from their `style` (body, colours, hair, hat, accessory).
- `scene.js` draws the beach and everything that falls out of the palms.
- `audio.js` builds the sound effects and the music loop out of oscillators; there are no audio files.
- `startng.json` defines the leaderboard columns: score, coins caught and time survived.

Opened locally, the game plays as a guest; sign-in and the leaderboard work once it's live on `coconut-dodge.start.ng`.

To run it locally, serve the folder (ES modules don't load from `file://`):

```
python -m http.server 8000
```
