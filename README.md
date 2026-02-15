# Bullfrog Drums Web MVP

Web prototype of a virtual Bullfrog Drums instrument for sample-pack workflow.

## Mini Manual

This is a prototype of Erica Synths Bullfrog Drums web version, created by Geeky Punks.

You can play and jam with our sample packs.

Important:

- Click the GeekyPunks logo to randomize patterns and kit behavior.
- Or simply refresh the page to get a fresh randomized result.

This version is still in the making, so minor bugs may happen.

### Idea For Next Update

- When you like the groove, hover the right speaker: it should blend to a darker state.
- Click the right speaker to save/export the full 4-bar loop as a stereo WAV file.
- Goal: quick capture of random ideas.

## Run locally

Use a local static server (required for sample loading via `fetch`):

```bash
cd /Users/leonsomov/Documents/GitHub/Bullfrog_Drums
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish-ready structure

Keep this exact structure at repository root:

- `index.html`
- `styles.css`
- `app.js`
- `assets/`
- `factory/GeekyPunks_sample_kit/A...G/*.wav`

## What is included

- Hardware-style interface inspired by Bullfrog panel design.
- 7 drum tracks, 16-step sequencer, mute per track.
- Play/Pause/Stop/Rec controls.
- Per-voice sound controls: pitch, decay, loop point, cutoff, resonance, drive, pan.
- Global controls: tempo and volume.
- Per-track level controls.
- Per-track sample loading (`audio/*`) with fallback internal drum voices.
- Save/Load kit as JSON (pattern + controls + embedded sample audio data).

## Quick workflow for sample kits

1. Load a sample into each track using `Load` in the sample slot list.
2. Program pattern steps on the 16-step grid.
3. Tune levels + sound controls.
4. Click `Save Kit JSON` to export one sharable kit file.
5. On another session, click `Load Kit JSON` to restore everything.
