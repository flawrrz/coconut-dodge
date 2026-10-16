# Coconut Dodge

A small browser game for [start.ng](https://start.ng). The palms are dropping coconuts: dodge them as your own start.ng character, catch the naira coins, grab hearts to heal, and survive as long as you can.

Play it at **https://coconut-dodge.start.ng**.

## Controls

- Arrow keys or A / D to move
- Touch or mouse: drag to move
- P or Esc to pause

## How it works

Plain HTML, CSS and JavaScript (ES modules and a canvas), with no build step and no dependencies.

- `startng.js` talks to start.ng through its hidden connect page (`startng:whoami`, `startng:score`, `startng:leaderboard`).
- `character.js` draws the player's start.ng character from their `style` (body, colours, hair, hat, accessory).
- `startng.json` defines the leaderboard columns: score, coins caught and time survived.

Opened locally, the game plays as a guest; sign-in and the leaderboard work once it's live on `coconut-dodge.start.ng`.

To run it locally, serve the folder (ES modules don't load from `file://`):

```
python -m http.server 8000
```
