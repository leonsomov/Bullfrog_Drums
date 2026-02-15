"use strict";

const VOICES = [
  { letter: "A", name: "Kick", description: "kick drum" },
  { letter: "B", name: "Snare", description: "snare drum" },
  { letter: "C", name: "Toms/Perc", description: "toms and percussions" },
  { letter: "D", name: "Claps", description: "claps and noise-based samples" },
  { letter: "E", name: "Abstract", description: "abstract sounds and drones" },
  { letter: "F", name: "HiHat", description: "open and closed hi-hats" },
  { letter: "G", name: "Cymbal", description: "crash and ride cymbals" }
];

const TRACKS = VOICES.map((voice) => voice.name);
const SEQ_STEPS = 16;
const SLOTS_PER_VOICE = 64;
const FACTORY_SLOT_COUNT = 20;
const GEEKY_TARGET_PER_VOICE = 10;

const CONTROL_DEFS = [
  { id: "pitch", label: "Pitch", min: -12, max: 12, step: 0.1, value: 0, theme: "theme-sky", group: "tone" },
  {
    id: "decay",
    label: "Decay",
    min: 0.05,
    max: 4.8,
    step: 0.01,
    value: 0.36,
    theme: "theme-red",
    group: "tone"
  },
  {
    id: "loopPoint",
    label: "Loop Point",
    min: 0,
    max: 0.95,
    step: 0.01,
    value: 0,
    theme: "theme-yellow",
    group: "tone"
  },
  {
    id: "cutoff",
    label: "Cutoff",
    min: 60,
    max: 16000,
    step: 1,
    value: 6200,
    theme: "theme-green",
    group: "tone"
  },
  {
    id: "resonance",
    label: "Resonance",
    min: 0,
    max: 24,
    step: 0.1,
    value: 1.5,
    theme: "theme-green",
    group: "tone"
  },
  {
    id: "drive",
    label: "Drive",
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.08,
    theme: "theme-red",
    group: "tone"
  },
  { id: "pan", label: "Pan", min: -1, max: 1, step: 0.01, value: 0, theme: "theme-red", group: "tone" }
];
const TONE_CONTROL_IDS = new Set(CONTROL_DEFS.map((def) => def.id));

const MASTER_DEFS = [
  {
    id: "tempo",
    label: "Data",
    min: 70,
    max: 180,
    step: 1,
    value: 120,
    theme: "theme-master",
    group: "master"
  },
  {
    id: "volume",
    label: "Volume",
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.84,
    theme: "theme-master",
    group: "master"
  }
];

class BullfrogDrums {
  constructor() {
    this.controls = {};
    this.voiceControls = TRACKS.map(() =>
      Object.fromEntries(CONTROL_DEFS.map((def) => [def.id, def.value]))
    );
    this.trackLevels = TRACKS.map(() => 0.84);
    this.trackMutes = TRACKS.map(() => false);
    this.pattern = TRACKS.map(() => Array.from({ length: SEQ_STEPS }, () => false));
    this.patternBanks = Array.from({ length: 8 }, () => TRACKS.map(() => Array.from({ length: SEQ_STEPS }, () => false)));
    this.patternBankIndex = 0;
    this.stepButtons = [];
    this.trackSlotChip = null;
    this.trackLabelText = null;
    this.trackMuteButton = null;
    this.selectedTrackIndex = 0;
    this.sequenceStart = 0;
    this.sequenceEnd = SEQ_STEPS - 1;
    this.stepProbability = 1;
    this.ratchetRepeats = 1;
    this.accentAmount = 0.35;
    this.loopEnabled = true;
    this.lastStep = SEQ_STEPS;
    this.trackStartSteps = TRACKS.map(() => 0);
    this.trackEndSteps = TRACKS.map(() => SEQ_STEPS - 1);
    this.trackStepProbability = TRACKS.map(() => 1);
    this.trackRatchetRepeats = TRACKS.map(() => 1);
    this.trackAccentAmounts = TRACKS.map(() => 0.35);

    this.dataMode = "tempo";
    this.modeButtons = [];

    this.knobs = new Map();
    this.knobDefs = new Map();
    this.levelHitTimers = TRACKS.map(() => null);

    this.activeVoiceIndex = 0;
    this.selectedSlotIndex = 0;
    this.voiceActiveSlots = TRACKS.map(() => 0);
    this.sampleBanks = Array.from({ length: TRACKS.length }, () => Array.from({ length: SLOTS_PER_VOICE }, () => null));

    this.voiceTabButtons = [];
    this.slotButtons = [];

    this.isPlaying = false;
    this.recArmed = false;
    this.shuffleOn = false;
    this.currentStep = 0;
    this.playheadStep = -1;
    this.lastScheduledStep = -1;
    this.lookAheadMs = 25;
    this.scheduleAheadSec = 0.11;
    this.nextNoteTime = 0;
    this.schedulerId = null;
    this.uiTimeouts = [];
    this.samplePreviewTimeout = null;
    this.stepAutomation = Array.from({ length: SEQ_STEPS }, () => ({}));
    this.dragLockCount = 0;
    this.lockedScrollY = 0;

    this.audioCtx = null;
    this.masterInput = null;
    this.masterHeadroom = null;
    this.masterFilter = null;
    this.masterDrive = null;
    this.masterPan = null;
    this.masterSoftClip = null;
    this.masterLimiter = null;
    this.masterGain = null;
    this.trackInputs = [];
    this.trackPreDrives = [];
    this.trackFilters = [];
    this.trackFilterStages = [];
    this.trackResPeaks = [];
    this.trackDrives = [];
    this.trackPans = [];
    this.noiseBuffer = null;
    this.honeySpeakerEls = [];
    this.honeyMeterNode = null;
    this.honeyMeterBuffer = null;
    this.honeyMeterFrame = null;
    this.honeyLevels = [0, 0];

    this.readDom();
    this.buildPatternDefaults();
    this.buildKnobs();
    this.buildSequencer();
    this.buildVoiceManager();
    this.bindUiEvents();
    this.bindDisplayEditors();
    this.renderAllSteps();
    this.renderMainDisplay();
    this.renderStepDisplay();
    this.applyControlState();
    this.updateSampleReadyLed();
    this.renderVoiceManager();
    this.randomizePatternAndKit();
    this.bindAdaptiveLayout();
    this.autoloadGeekyFactoryPack();
  }

  readDom() {
    this.sceneEl = document.querySelector(".scene");
    this.machineEl = document.querySelector(".machine");
    this.levelKnobs = document.getElementById("levelKnobs");
    this.toneKnobs = document.getElementById("toneKnobs");
    this.masterDataKnob = document.getElementById("masterDataKnob");
    this.masterVolumeKnob = document.getElementById("masterVolumeKnob");

    this.gridHead = document.getElementById("gridHead");
    this.gridBody = document.getElementById("sequencerGrid");

    this.voiceTabs = document.getElementById("voiceTabs");
    this.slotGrid = document.getElementById("slotGrid");
    this.voiceDescription = document.getElementById("voiceDescription");
    this.selectedSlotInfo = document.getElementById("selectedSlotInfo");
    this.voiceCounts = document.getElementById("voiceCounts");

    this.playPauseBtn = document.getElementById("playPauseBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.recBtn = document.getElementById("recBtn");
    this.shuffleBtn = document.getElementById("shuffleBtn");
    this.reverseBtn = document.getElementById("reverseBtn");
    this.clearPatternBtn = document.getElementById("clearPatternBtn");
    this.randomizeBtn = document.getElementById("randomizeBtn");
    this.modeTrackBtn = document.getElementById("modeTrackBtn");
    this.modeLastStepBtn = document.getElementById("modeLastStepBtn");
    this.modePatternBtn = document.getElementById("modePatternBtn");
    this.modeMuteBtn = document.getElementById("modeMuteBtn");
    this.modeKitBtn = document.getElementById("modeKitBtn");
    this.modeSampleBtn = document.getElementById("modeSampleBtn");
    this.modeStartBtn = document.getElementById("modeStartBtn");
    this.modeEndBtn = document.getElementById("modeEndBtn");
    this.modeLoopBtn = document.getElementById("modeLoopBtn");
    this.modeAccentBtn = document.getElementById("modeAccentBtn");
    this.modeRatchetBtn = document.getElementById("modeRatchetBtn");
    this.modeOddsBtn = document.getElementById("modeOddsBtn");
    this.modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

    this.saveKitBtn = document.getElementById("saveKitBtn");
    this.loadKitBtn = document.getElementById("loadKitBtn");
    this.kitLoader = document.getElementById("kitLoader");

    this.importPackBtn = document.getElementById("importPackBtn");
    this.validatePackBtn = document.getElementById("validatePackBtn");
    this.packFolderInput = document.getElementById("packFolderInput");

    this.loadSlotBtn = document.getElementById("loadSlotBtn");
    this.assignSlotBtn = document.getElementById("assignSlotBtn");
    this.auditionSlotBtn = document.getElementById("auditionSlotBtn");
    this.clearSlotBtn = document.getElementById("clearSlotBtn");
    this.slotFileInput = document.getElementById("slotFileInput");

    this.bpmDisplay = document.getElementById("bpmDisplay");
    this.displayLabel = document.getElementById("displayLabel");
    this.stepDisplay = document.getElementById("stepDisplay");
    this.bpmDisplayCard = this.bpmDisplay?.closest(".display") || null;
    this.stepDisplayCard = this.stepDisplay?.closest(".display") || null;
    this.sampleReadyLed = document.getElementById("sampleReady");
    this.sourceMode = document.getElementById("sourceMode");
    this.statusLine = document.getElementById("statusLine");
    this.geekyLogoAction = document.getElementById("geekyLogoAction");
    this.honeySpeakerEls = Array.from(document.querySelectorAll(".honey-grid"));
    this.applyHoneyAnalyzerLevels(0, 0);
  }

  buildPatternDefaults() {
    this.pattern = this.generateGoodGroovePattern();
    this.patternBanks[this.patternBankIndex] = this.clonePattern(this.pattern);
    this.sequenceStart = 0;
    this.sequenceEnd = SEQ_STEPS - 1;
    this.lastStep = this.sequenceEnd + 1;
  }

  buildKnobs() {
    TRACKS.forEach((_, trackIndex) => {
      const def = {
        id: `level-${trackIndex}`,
        label: `Level${trackIndex + 1}`,
        min: 0,
        max: 1,
        step: 0.01,
        value: this.trackLevels[trackIndex],
        theme: "",
        group: "level"
      };
      this.createKnob(def, this.levelKnobs);
    });

    CONTROL_DEFS.forEach((def) => {
      const initialValue = this.voiceControls[this.selectedTrackIndex][def.id];
      this.controls[def.id] = initialValue;
      this.createKnob({ ...def, value: initialValue }, this.toneKnobs);
    });

    MASTER_DEFS.forEach((def) => {
      this.controls[def.id] = def.value;
      const parent = def.id === "tempo" ? this.masterDataKnob : this.masterVolumeKnob;
      this.createKnob(def, parent);
    });
  }

  createKnob(def, parent) {
    if (!parent) {
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "knob-wrap";
    wrap.dataset.id = def.id;
    wrap.classList.add(def.group || "tone");

    const cap = document.createElement("button");
    cap.type = "button";
    cap.className = `knob-cap ${def.theme || ""}`.trim();
    cap.setAttribute("aria-label", def.label);
    cap.style.touchAction = "none";

    const marker = document.createElement("span");
    marker.className = "marker";
    cap.appendChild(marker);

    const label = document.createElement("div");
    label.className = "knob-label";
    label.textContent = def.label;

    const value = document.createElement("div");
    value.className = "knob-value";

    wrap.appendChild(cap);
    wrap.appendChild(label);
    wrap.appendChild(value);
    parent.appendChild(wrap);

    const knob = {
      def: { ...def },
      wrap,
      cap,
      labelEl: label,
      valueLabel: value,
      value: def.value
    };

    this.knobs.set(def.id, knob);
    this.knobDefs.set(def.id, def);
    this.setKnobValue(def.id, def.value, { silent: true });

    cap.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startVal = knob.value;
      this.beginDragLock();
      cap.setPointerCapture(pointerId);

      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        const delta = startY - moveEvent.clientY;
        const range = def.max - def.min;
        const dragScale = def.id === "tempo" ? 700 : 520;
        const nextVal = startVal + (delta * range) / dragScale;
        this.setKnobValue(def.id, nextVal);
      };

      const onUp = () => {
        cap.removeEventListener("pointermove", onMove);
        cap.removeEventListener("pointerup", onUp);
        cap.removeEventListener("pointercancel", onUp);
        this.endDragLock();
      };

      cap.addEventListener("pointermove", onMove);
      cap.addEventListener("pointerup", onUp);
      cap.addEventListener("pointercancel", onUp);
    });

    // iOS fallback: ensure knob drag works inside scrollable page.
    let touchStartY = 0;
    let touchStartVal = knob.value;
    const onTouchStart = (event) => {
      if (!event.touches || event.touches.length !== 1) {
        return;
      }
      event.preventDefault();
      touchStartY = event.touches[0].clientY;
      touchStartVal = knob.value;
      this.beginDragLock();
    };
    const onTouchMove = (event) => {
      if (!event.touches || event.touches.length !== 1) {
        return;
      }
      event.preventDefault();
      const delta = touchStartY - event.touches[0].clientY;
      const range = def.max - def.min;
      const dragScale = def.id === "tempo" ? 700 : 520;
      const nextVal = touchStartVal + (delta * range) / dragScale;
      this.setKnobValue(def.id, nextVal);
    };
    const onTouchEnd = (event) => {
      event.preventDefault();
      this.endDragLock();
    };
    cap.addEventListener("touchstart", onTouchStart, { passive: false });
    cap.addEventListener("touchmove", onTouchMove, { passive: false });
    cap.addEventListener("touchend", onTouchEnd, { passive: false });
    cap.addEventListener("touchcancel", onTouchEnd, { passive: false });

    cap.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const next = knob.value + (event.deltaY < 0 ? def.step : -def.step);
        this.setKnobValue(def.id, next);
      },
      { passive: false }
    );

    cap.addEventListener("dblclick", () => {
      this.setKnobValue(def.id, def.value);
    });
  }

  setKnobValue(id, nextValue, options = {}) {
    const { silent = false, bypassDataMode = false, skipTrackToneStore = false } = options;
    const knob = this.knobs.get(id);
    if (!knob) {
      return;
    }

    const { def } = knob;
    const snapped = this.snap(this.clamp(nextValue, def.min, def.max), def.step);
    let effectiveValue = snapped;
    if (id === "tempo" && !bypassDataMode && (this.dataMode === "sample" || this.dataMode === "kit")) {
      effectiveValue = this.normalizePlaybackSlot(snapped);
    }
    knob.value = effectiveValue;

    const normalized = (effectiveValue - def.min) / (def.max - def.min || 1);
    const rotation = -135 + normalized * 270;
    knob.cap.style.setProperty("--rotation", `${rotation}deg`);
    knob.valueLabel.textContent = this.formatValue(id, effectiveValue);

    if (id === "tempo" && this.dataMode !== "tempo" && !bypassDataMode) {
      const slotValue = Math.round(effectiveValue);
      const cappedSlot = this.normalizePlaybackSlot(slotValue);
      if (this.dataMode === "sample") {
        const resolvedSlot = this.resolvePlaybackSlotForVoice(this.selectedTrackIndex, cappedSlot, { mutate: true });
        this.selectedSlotIndex = resolvedSlot;
        this.activeVoiceIndex = this.selectedTrackIndex;
        this.prepareSampleForPlayback(this.selectedTrackIndex, resolvedSlot);
      } else if (this.dataMode === "track") {
        const trackValue = this.clamp(slotValue, 0, TRACKS.length - 1);
        this.setSelectedTrack(trackValue);
      } else if (this.dataMode === "lastStep") {
        this.setLastStep(slotValue);
      } else if (this.dataMode === "start") {
        this.setTrackStartStep(this.selectedTrackIndex, slotValue);
      } else if (this.dataMode === "end") {
        this.setTrackEndStep(this.selectedTrackIndex, slotValue);
      } else if (this.dataMode === "kit") {
        this.setKitSlotForAllVoices(cappedSlot);
      } else if (this.dataMode === "pattern") {
        this.setPatternBank(slotValue - 1);
      } else if (this.dataMode === "odds") {
        const value = this.clamp(slotValue / 100, 0, 1);
        this.trackStepProbability[this.selectedTrackIndex] = value;
        this.stepProbability = value;
      } else if (this.dataMode === "ratchet") {
        const value = this.clamp(slotValue, 1, 4);
        this.trackRatchetRepeats[this.selectedTrackIndex] = value;
        this.ratchetRepeats = value;
      } else if (this.dataMode === "accent") {
        const value = this.clamp(slotValue / 100, 0, 1);
        this.trackAccentAmounts[this.selectedTrackIndex] = value;
        this.accentAmount = value;
      } else if (this.dataMode === "loop") {
        this.loopEnabled = slotValue >= 1;
      }
      this.updateTrackSlotChips();
      this.renderVoiceManager();
      this.renderMainDisplay();
      if (this.dataMode === "sample" && !this.isPlaying) {
        this.scheduleSamplePreview(this.selectedTrackIndex);
      }
      if (!silent) {
        const message =
          this.dataMode === "sample"
            ? `SAMPLE mode: ${VOICES[this.selectedTrackIndex].letter} slot set to ${String(cappedSlot).padStart(2, "0")}.`
            : this.dataMode === "lastStep"
              ? `LAST STEP set to ${String(this.lastStep).padStart(2, "0")}.`
              : this.dataMode === "start"
                ? `START step for Track ${this.selectedTrackIndex + 1} set to ${String(
                    this.trackStartSteps[this.selectedTrackIndex] + 1
                  ).padStart(2, "0")}.`
                : this.dataMode === "end"
                  ? `END step for Track ${this.selectedTrackIndex + 1} set to ${String(
                      this.trackEndSteps[this.selectedTrackIndex] + 1
                    ).padStart(2, "0")}.`
              : this.dataMode === "kit"
                ? `KIT mode: all voices set to slot ${String(cappedSlot).padStart(2, "0")}.`
                : this.dataMode === "pattern"
                  ? `PATTERN bank ${this.patternBankIndex + 1} selected.`
                  : this.dataMode === "odds"
                    ? `PROB for Track ${this.selectedTrackIndex + 1} set to ${Math.round(
                        this.trackStepProbability[this.selectedTrackIndex] * 100
                      )}%.`
                    : this.dataMode === "ratchet"
                      ? `RATCHET for Track ${this.selectedTrackIndex + 1} set to x${
                          this.trackRatchetRepeats[this.selectedTrackIndex]
                        }.`
                      : this.dataMode === "accent"
                        ? `ACCENT for Track ${this.selectedTrackIndex + 1} set to ${Math.round(
                            this.trackAccentAmounts[this.selectedTrackIndex] * 100
                          )}%.`
                        : this.dataMode === "loop"
                          ? `LOOP ${this.loopEnabled ? "ON" : "OFF"}.`
              : `TRACK mode: selected Track ${this.selectedTrackIndex + 1}.`;
        this.setStatus(message, "ok");
      }
      return;
    }

    if (id.startsWith("level-")) {
      const trackIndex = Number(id.split("-")[1]);
      this.trackLevels[trackIndex] = snapped;
    } else if (TONE_CONTROL_IDS.has(id)) {
      if (!skipTrackToneStore) {
        this.voiceControls[this.selectedTrackIndex][id] = snapped;
      }
      this.controls[id] = snapped;
    } else {
      this.controls[id] = snapped;
    }

    this.recordKnobAutomation(id, snapped, { silent, bypassDataMode });

    if (!silent) {
      this.onControlChanged(id);
    }
  }

  getVoiceTone(trackIndex) {
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    return this.voiceControls[safeTrack] || this.voiceControls[0];
  }

  normalizePlaybackSlot(slot) {
    return this.clamp(Math.round(Number(slot) || 0), 0, GEEKY_TARGET_PER_VOICE - 1);
  }

  getAvailableSlotsForVoice(voiceIndex, options = {}) {
    const { geekyOnly = true } = options;
    const safeVoice = this.clamp(Math.round(voiceIndex), 0, TRACKS.length - 1);
    const maxSlot = geekyOnly ? GEEKY_TARGET_PER_VOICE : SLOTS_PER_VOICE;
    const available = [];
    const bank = this.sampleBanks[safeVoice];
    for (let slot = 0; slot < maxSlot; slot += 1) {
      if (bank?.[slot]) {
        available.push(slot);
      }
    }
    return available;
  }

  resolvePlaybackSlotForVoice(voiceIndex, requestedSlot, options = {}) {
    const { mutate = true } = options;
    const safeVoice = this.clamp(Math.round(voiceIndex), 0, TRACKS.length - 1);
    const normalized = this.normalizePlaybackSlot(requestedSlot);
    const bank = this.sampleBanks[safeVoice];

    let resolved = normalized;
    if (!bank?.[resolved]) {
      const available = this.getAvailableSlotsForVoice(safeVoice);
      if (available.length > 0) {
        resolved = available.reduce(
          (best, slot) => (Math.abs(slot - normalized) < Math.abs(best - normalized) ? slot : best),
          available[0]
        );
      }
    }

    if (mutate) {
      this.voiceActiveSlots[safeVoice] = resolved;
    }
    return resolved;
  }

  getPlaybackSampleForTrack(trackIndex) {
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    const resolvedSlot = this.resolvePlaybackSlotForVoice(safeTrack, this.voiceActiveSlots[safeTrack], { mutate: true });
    return {
      slot: resolvedSlot,
      sample: this.sampleBanks[safeTrack]?.[resolvedSlot] || null
    };
  }

  normalizeVoiceSlotsToLoadedSamples() {
    for (let voiceIndex = 0; voiceIndex < TRACKS.length; voiceIndex += 1) {
      const resolved = this.resolvePlaybackSlotForVoice(voiceIndex, this.voiceActiveSlots[voiceIndex], { mutate: true });
      this.prepareSampleForPlayback(voiceIndex, resolved);
    }
    this.selectedSlotIndex = this.resolvePlaybackSlotForVoice(this.selectedTrackIndex, this.selectedSlotIndex, { mutate: false });
  }

  setKitSlotForAllVoices(slot) {
    const normalized = this.normalizePlaybackSlot(slot);
    let selectedResolved = normalized;
    for (let voiceIndex = 0; voiceIndex < TRACKS.length; voiceIndex += 1) {
      const resolved = this.resolvePlaybackSlotForVoice(voiceIndex, normalized, { mutate: true });
      this.prepareSampleForPlayback(voiceIndex, resolved);
      if (voiceIndex === this.selectedTrackIndex) {
        selectedResolved = resolved;
      }
    }
    this.selectedSlotIndex = selectedResolved;
    this.activeVoiceIndex = this.selectedTrackIndex;
  }

  syncToneControlsForSelectedTrack() {
    const tone = this.getVoiceTone(this.selectedTrackIndex);
    CONTROL_DEFS.forEach((def) => {
      this.setKnobValue(def.id, tone[def.id], { silent: true, bypassDataMode: true, skipTrackToneStore: true });
    });
  }

  recordKnobAutomation(id, value, options = {}) {
    const { silent = false, bypassDataMode = false } = options;
    if (silent || bypassDataMode || !this.recArmed || !this.isPlaying) {
      return;
    }
    if (id === "tempo" && this.dataMode !== "tempo") {
      return;
    }
    const step = this.playheadStep >= 0 ? this.playheadStep : this.lastScheduledStep;
    if (!Number.isInteger(step) || step < 0 || step >= SEQ_STEPS) {
      return;
    }
    const automationKey = TONE_CONTROL_IDS.has(id) ? `${id}@${this.selectedTrackIndex}` : id;
    if (!this.stepAutomation[step]) {
      this.stepAutomation[step] = {};
    }
    this.stepAutomation[step][automationKey] = value;
  }

  applyStepAutomation(step) {
    const automation = this.stepAutomation[step];
    if (!automation) {
      return;
    }
    const entries = Object.entries(automation);
    if (entries.length === 0) {
      return;
    }
    entries.forEach(([key, value]) => {
      const [id, maybeTrack] = key.split("@");
      if (maybeTrack !== undefined && TONE_CONTROL_IDS.has(id)) {
        const trackIndex = Number(maybeTrack);
        if (Number.isInteger(trackIndex) && trackIndex >= 0 && trackIndex < TRACKS.length) {
          this.voiceControls[trackIndex][id] = value;
          if (trackIndex === this.selectedTrackIndex) {
            this.setKnobValue(id, value, {
              silent: true,
              bypassDataMode: true,
              skipTrackToneStore: true
            });
          }
        }
        return;
      }
      this.setKnobValue(id, value, { silent: true, bypassDataMode: id === "tempo" });
    });
    this.applyControlState();
  }

  onControlChanged(id) {
    if (id === "tempo") {
      this.renderMainDisplay();
    }
    this.applyControlState();
  }

  applyControlState() {
    this.renderMainDisplay();
    if (!this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.controls.volume * 0.8, now, 0.01);
    this.masterFilter.frequency.setTargetAtTime(18000, now, 0.01);
    this.masterFilter.Q.setTargetAtTime(0.707, now, 0.01);
    this.setPanValue(this.masterPan, 0, now, 0.01);
    this.masterDrive.curve = this.makeDriveCurve(0);
    this.applyAllTrackToneStates();
  }

  startHoneyAnalyzer() {
    if (!this.honeySpeakerEls.length || this.honeyMeterFrame !== null) {
      return;
    }
    const step = () => {
      this.honeyMeterFrame = window.requestAnimationFrame(step);
      this.updateHoneyAnalyzerFrame();
    };
    step();
  }

  updateHoneyAnalyzerFrame() {
    if (!this.audioCtx || !this.honeyMeterNode || !this.honeyMeterBuffer) {
      this.applyHoneyAnalyzerLevels(0, 0);
      return;
    }

    this.honeyMeterNode.getByteFrequencyData(this.honeyMeterBuffer);
    const bins = this.honeyMeterBuffer;
    const split = this.clamp(Math.floor(bins.length * 0.42), 8, bins.length - 8);

    let lowSum = 0;
    for (let i = 0; i < split; i += 1) {
      lowSum += bins[i];
    }
    let highSum = 0;
    for (let i = split; i < bins.length; i += 1) {
      highSum += bins[i];
    }

    const lowNorm = split > 0 ? lowSum / (split * 255) : 0;
    const highCount = bins.length - split;
    const highNorm = highCount > 0 ? highSum / (highCount * 255) : 0;

    const overall = this.clamp(((lowNorm * 0.62 + highNorm * 0.38) - 0.02) * 2.05, 0, 1);
    const spread = this.clamp((lowNorm - highNorm) * 0.28, -0.16, 0.16);
    const targetLeft = this.clamp(overall + spread, 0, 1);
    const targetRight = this.clamp(overall - spread, 0, 1);

    this.honeyLevels[0] = this.smoothHoneyLevel(this.honeyLevels[0], targetLeft);
    this.honeyLevels[1] = this.smoothHoneyLevel(this.honeyLevels[1], targetRight);
    this.applyHoneyAnalyzerLevels(this.honeyLevels[0], this.honeyLevels[1]);
  }

  smoothHoneyLevel(current, target) {
    const attack = 0.38;
    const release = 0.14;
    const speed = target > current ? attack : release;
    return current + (target - current) * speed;
  }

  applyHoneyAnalyzerLevels(leftLevel, rightLevel) {
    if (!this.honeySpeakerEls.length) {
      return;
    }
    const left = this.clamp(leftLevel, 0, 1);
    const right = this.clamp(rightLevel, 0, 1);
    this.honeySpeakerEls.forEach((element, index) => {
      const level = index === 0 ? left : right;
      element.style.setProperty("--analyzer-level", level.toFixed(3));
      element.classList.toggle("is-active", level > 0.02);
    });
  }

  buildSequencer() {
    this.gridHead.innerHTML = "";
    this.gridBody.innerHTML = "";
    const row = document.createElement("div");
    row.className = "track-row single-track-row";
    this.trackLabelText = null;
    this.trackSlotChip = null;
    this.trackMuteButton = null;

    this.stepButtons = [];
    for (let bank = 0; bank < 4; bank += 1) {
      const bankWrap = document.createElement("div");
      bankWrap.className = "step-bank";

      const bankHead = document.createElement("div");
      bankHead.className = "step-bank-head";

      const bankBody = document.createElement("div");
      bankBody.className = "step-bank-body";

      for (let i = 0; i < 4; i += 1) {
        const step = bank * 4 + i;

        const headCell = document.createElement("span");
        headCell.textContent = String(step + 1);
        bankHead.appendChild(headCell);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "step";
        button.dataset.step = String(step);
        button.addEventListener("click", () => {
          const track = this.selectedTrackIndex;
          this.pattern[track][step] = !this.pattern[track][step];
          this.renderStep(track, step);
        });
        this.stepButtons[step] = button;
        bankBody.appendChild(button);
      }

      bankWrap.appendChild(bankHead);
      bankWrap.appendChild(bankBody);
      row.appendChild(bankWrap);
    }

    this.gridBody.appendChild(row);
    this.updateTrackSlotChips();
    this.setSelectedTrack(0, { syncVoice: false });
  }

  buildVoiceManager() {
    this.voiceTabs.innerHTML = "";
    this.voiceTabButtons = [];
    VOICES.forEach((voice, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "voice-tab";
      tab.dataset.voice = String(index);

      const letter = document.createElement("span");
      letter.className = "voice-letter";
      letter.textContent = voice.letter;

      const name = document.createElement("span");
      name.textContent = voice.name;

      tab.appendChild(letter);
      tab.appendChild(name);
      tab.addEventListener("click", () => {
        this.activeVoiceIndex = index;
        this.selectedTrackIndex = index;
        this.selectedSlotIndex = this.voiceActiveSlots[index];
        this.setSelectedTrack(index, { syncVoice: false });
        this.renderVoiceManager();
        if (this.dataMode === "sample") {
          this.syncDataKnobToCurrentMode();
        }
      });

      this.voiceTabs.appendChild(tab);
      this.voiceTabButtons.push(tab);
    });

    this.slotGrid.innerHTML = "";
    this.slotButtons = [];
    for (let slot = 0; slot < SLOTS_PER_VOICE; slot += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-btn";
      button.textContent = String(slot);
      button.dataset.slot = String(slot);
      button.addEventListener("click", () => {
        this.selectedSlotIndex = slot;
        this.renderVoiceManager();
      });
      this.slotGrid.appendChild(button);
      this.slotButtons.push(button);
    }
  }

  renderVoiceManager() {
    VOICES.forEach((voice, index) => {
      this.voiceTabButtons[index].classList.toggle("active", index === this.activeVoiceIndex);
    });

    const voice = VOICES[this.activeVoiceIndex];
    const playbackSlot = this.normalizePlaybackSlot(this.voiceActiveSlots[this.activeVoiceIndex]);
    const counts = this.getVoiceCounts(this.activeVoiceIndex);

    this.voiceDescription.textContent = `${voice.letter} - ${voice.description}`;
    this.selectedSlotInfo.textContent = `Selected slot ${String(this.selectedSlotIndex).padStart(2, "0")} | Playback slot ${String(
      playbackSlot
    ).padStart(2, "0")}`;
    this.voiceCounts.textContent = `Geeky target ${counts.geeky}/${GEEKY_TARGET_PER_VOICE} | Factory ${counts.factory}/${FACTORY_SLOT_COUNT} | User ${counts.user}/44`;

    this.slotButtons.forEach((button, slot) => {
      const sample = this.sampleBanks[this.activeVoiceIndex][slot];
      button.classList.remove("factory", "user", "erica-reserve", "filled", "selected", "assigned");
      button.classList.add(slot < FACTORY_SLOT_COUNT ? "factory" : "user");
      if (slot >= GEEKY_TARGET_PER_VOICE && slot < FACTORY_SLOT_COUNT) {
        button.classList.add("erica-reserve");
      }
      if (sample) {
        button.classList.add("filled");
      }
      if (slot === this.selectedSlotIndex) {
        button.classList.add("selected");
      }
      if (slot === playbackSlot) {
        button.classList.add("assigned");
      }
      button.title = sample ? `${sample.name} (${sample.wavMeta.sampleRate}Hz / ${sample.wavMeta.bitsPerSample}bit)` : `Slot ${slot}`;
    });

    this.updateTrackSlotChips();
  }

  getVoiceCounts(voiceIndex) {
    const bank = this.sampleBanks[voiceIndex];
    const geeky = bank.slice(0, GEEKY_TARGET_PER_VOICE).filter(Boolean).length;
    const factory = bank.slice(0, FACTORY_SLOT_COUNT).filter(Boolean).length;
    const user = bank.slice(FACTORY_SLOT_COUNT).filter(Boolean).length;
    return { geeky, factory, user };
  }

  updateTrackSlotChips() {
    if (!this.trackSlotChip) {
      return;
    }
    this.trackSlotChip.textContent = `S${String(this.normalizePlaybackSlot(this.voiceActiveSlots[this.selectedTrackIndex])).padStart(2, "0")}`;
  }

  setSelectedTrack(trackIndex, options = {}) {
    const { syncVoice = true } = options;
    this.selectedTrackIndex = trackIndex;
    if (this.trackLabelText) {
      this.trackLabelText.textContent = `${VOICES[trackIndex].letter} ${TRACKS[trackIndex]}`;
    }
    if (this.trackMuteButton) {
      this.trackMuteButton.classList.toggle("muted", this.trackMutes[trackIndex]);
      this.trackMuteButton.setAttribute("aria-label", `Mute ${TRACKS[trackIndex]}`);
    }
    this.updateTrackSlotChips();
    this.renderAllSteps();
    this.syncToneControlsForSelectedTrack();

    if (syncVoice) {
      this.activeVoiceIndex = trackIndex;
      this.selectedSlotIndex = this.normalizePlaybackSlot(this.voiceActiveSlots[trackIndex]);
      this.renderVoiceManager();
    }

    if (this.dataMode !== "tempo") {
      this.syncDataKnobToCurrentMode();
    }
  }

  setDataMode(mode, options = {}) {
    const { activeButton = null } = options;
    this.dataMode = mode;
    if (activeButton) {
      this.activateExclusiveModeButton(activeButton);
    }
    this.syncDataKnobToCurrentMode();
    this.renderMainDisplay();
  }

  syncDataKnobToCurrentMode() {
    const knob = this.knobs.get("tempo");
    if (!knob) {
      return;
    }

    if (this.dataMode === "tempo") {
      knob.def.min = 70;
      knob.def.max = 180;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data";
      this.setKnobValue("tempo", this.controls.tempo, { silent: true });
      return;
    }

    if (this.dataMode === "track") {
      knob.def.min = 0;
      knob.def.max = TRACKS.length - 1;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Track";
      this.setKnobValue("tempo", this.selectedTrackIndex, { silent: true });
      return;
    }

    if (this.dataMode === "lastStep") {
      knob.def.min = 1;
      knob.def.max = SEQ_STEPS;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Step";
      this.setKnobValue("tempo", this.lastStep, { silent: true });
      return;
    }

    if (this.dataMode === "start") {
      knob.def.min = 1;
      knob.def.max = SEQ_STEPS;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Start";
      this.setKnobValue("tempo", this.trackStartSteps[this.selectedTrackIndex] + 1, { silent: true });
      return;
    }

    if (this.dataMode === "end") {
      knob.def.min = 1;
      knob.def.max = SEQ_STEPS;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/End";
      this.setKnobValue("tempo", this.trackEndSteps[this.selectedTrackIndex] + 1, { silent: true });
      return;
    }

    if (this.dataMode === "pattern") {
      knob.def.min = 1;
      knob.def.max = this.patternBanks.length;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Patt";
      this.setKnobValue("tempo", this.patternBankIndex + 1, { silent: true });
      return;
    }

    if (this.dataMode === "odds") {
      knob.def.min = 0;
      knob.def.max = 100;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Prob";
      this.setKnobValue("tempo", this.trackStepProbability[this.selectedTrackIndex] * 100, { silent: true });
      return;
    }

    if (this.dataMode === "ratchet") {
      knob.def.min = 1;
      knob.def.max = 4;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Ratch";
      this.setKnobValue("tempo", this.trackRatchetRepeats[this.selectedTrackIndex], { silent: true });
      return;
    }

    if (this.dataMode === "accent") {
      knob.def.min = 0;
      knob.def.max = 100;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Accent";
      this.setKnobValue("tempo", this.trackAccentAmounts[this.selectedTrackIndex] * 100, { silent: true });
      return;
    }

    if (this.dataMode === "loop") {
      knob.def.min = 0;
      knob.def.max = 1;
      knob.def.step = 1;
      knob.labelEl.textContent = "Data/Loop";
      this.setKnobValue("tempo", this.loopEnabled ? 1 : 0, { silent: true });
      return;
    }

    knob.def.min = 0;
    knob.def.max = GEEKY_TARGET_PER_VOICE - 1;
    knob.def.step = 1;
    knob.labelEl.textContent = this.dataMode === "sample" ? "Data/Sample" : "Data/Kit";

    const value =
      this.dataMode === "sample"
        ? this.normalizePlaybackSlot(this.voiceActiveSlots[this.selectedTrackIndex])
        : this.voiceActiveSlots.every((slot) => this.normalizePlaybackSlot(slot) === this.normalizePlaybackSlot(this.voiceActiveSlots[0]))
          ? this.normalizePlaybackSlot(this.voiceActiveSlots[0])
          : 0;
    this.setKnobValue("tempo", value, { silent: true });
  }

  bindUiEvents() {
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener("click", async () => {
        if (this.isPlaying) {
          this.pauseTransport();
        } else {
          await this.startTransport();
        }
      });
    }

    if (this.stopBtn) {
      this.stopBtn.addEventListener("click", () => {
        this.stopTransport();
      });
    }

    if (this.recBtn) {
      this.recBtn.addEventListener("click", () => {
        this.recArmed = !this.recArmed;
        this.recBtn.classList.toggle("live", this.recArmed);
        this.setStatus(this.recArmed ? "Record arm enabled." : "Record arm disabled.");
      });
    }

    if (this.shuffleBtn) {
      this.shuffleBtn.addEventListener("click", () => {
        this.shuffleOn = !this.shuffleOn;
        this.shuffleBtn.classList.toggle("live", this.shuffleOn);
        this.setStatus(this.shuffleOn ? "Shuffle ON (16th-note swing)." : "Shuffle OFF.");
      });
    }

    if (this.reverseBtn) {
      this.reverseBtn.addEventListener("click", () => {
        this.pattern = this.pattern.map((row) => [...row].reverse());
        this.stepAutomation = [...this.stepAutomation].reverse();
        this.renderAllSteps();
        this.setStatus("Pattern reversed.");
      });
    }

    if (this.clearPatternBtn) {
      this.clearPatternBtn.addEventListener("click", () => {
        this.clearPattern();
        this.setStatus("Pattern cleared.");
      });
    }

    this.modeButtons
      .filter((button) => button.classList.contains("bar-btn"))
      .forEach((button) => {
        button.addEventListener("click", () => {
          const bar = Number(button.dataset.bar);
          if (Number.isFinite(bar)) {
            this.setPatternBank(this.clamp(bar - 1, 0, this.patternBanks.length - 1));
            this.syncDataKnobToCurrentMode();
          }
        });
      });

    const bindDataModeButton = (button, mode, message) => {
      if (!button) {
        return;
      }
      button.addEventListener("click", () => {
        this.setDataMode(mode, { activeButton: button });
        if (message) {
          this.setStatus(message);
        }
      });
    };

    bindDataModeButton(this.modeTrackBtn, "track", "TRACK mode: DATA knob selects track A-G.");
    bindDataModeButton(this.modeSampleBtn, "sample", "SAMPLE mode: DATA knob scrolls slots on selected track.");
    bindDataModeButton(this.modeKitBtn, "kit", "KIT mode: DATA knob sets all voices to the same slot.");
    bindDataModeButton(this.modeLastStepBtn, "lastStep", "LAST STEP mode: DATA knob sets sequence length.");
    bindDataModeButton(this.modePatternBtn, "pattern", "PATTERN mode: DATA knob selects pattern bank.");
    bindDataModeButton(this.modeStartBtn, "start", "START mode: DATA knob sets first step for selected track.");
    bindDataModeButton(this.modeEndBtn, "end", "END mode: DATA knob sets last step for selected track.");
    bindDataModeButton(this.modeLoopBtn, "loop", "LOOP mode: DATA knob toggles loop on/off.");
    bindDataModeButton(this.modeAccentBtn, "accent", "ACCENT mode: DATA knob sets accent amount for selected track.");
    bindDataModeButton(this.modeRatchetBtn, "ratchet", "RATCHET mode: DATA knob sets repeats for selected track.");
    bindDataModeButton(this.modeOddsBtn, "odds", "ODDS/PROB mode: DATA knob sets hit probability for selected track.");

    if (this.modeMuteBtn) {
      this.modeMuteBtn.addEventListener("click", () => {
        const track = this.selectedTrackIndex;
        this.trackMutes[track] = !this.trackMutes[track];
        this.setDataMode("tempo", { activeButton: this.modeMuteBtn });
        this.setStatus(
          `${VOICES[track].letter} ${TRACKS[track]} ${this.trackMutes[track] ? "muted" : "unmuted"}.`,
          this.trackMutes[track] ? "warn" : "ok"
        );
      });
    }

    const handledButtons = new Set([
      this.modeTrackBtn,
      this.modeSampleBtn,
      this.modeKitBtn,
      this.modeLastStepBtn,
      this.modePatternBtn,
      this.modeStartBtn,
      this.modeEndBtn,
      this.modeLoopBtn,
      this.modeAccentBtn,
      this.modeRatchetBtn,
      this.modeOddsBtn,
      this.modeMuteBtn,
      this.randomizeBtn,
      this.shuffleBtn,
      this.reverseBtn,
      this.clearPatternBtn
    ]);
    this.modeButtons.forEach((button) => {
      if (button.classList.contains("bar-btn") || handledButtons.has(button)) {
        return;
      }
      button.addEventListener("click", () => {
        this.setDataMode("tempo", { activeButton: button });
      });
    });

    if (this.modePatternBtn) {
      this.activateExclusiveModeButton(this.modePatternBtn);
    }

    if (this.randomizeBtn) {
      this.randomizeBtn.addEventListener("click", () => {
        this.randomizePatternAndKit();
        this.setStatus("Generated a fresh pattern and randomized kit.");
      });
    }

    if (this.importPackBtn && this.packFolderInput) {
      this.importPackBtn.addEventListener("click", () => {
        this.packFolderInput.click();
      });

      this.packFolderInput.addEventListener("change", async () => {
        const files = this.packFolderInput.files;
        if (!files || files.length === 0) {
          return;
        }
        await this.importPackFolder(files);
        this.packFolderInput.value = "";
      });
    }

    if (this.validatePackBtn) {
      this.validatePackBtn.addEventListener("click", () => {
        this.validatePackSpec();
      });
    }

    if (this.loadSlotBtn && this.slotFileInput) {
      this.loadSlotBtn.addEventListener("click", () => {
        this.slotFileInput.click();
      });

      this.slotFileInput.addEventListener("change", async () => {
        const file = this.slotFileInput.files?.[0];
        if (!file) {
          return;
        }
        try {
          await this.loadSampleFileToSlot(this.activeVoiceIndex, this.selectedSlotIndex, file);
          this.setStatus(
            `Loaded ${file.name} to ${VOICES[this.activeVoiceIndex].letter}${String(this.selectedSlotIndex).padStart(2, "0")}.`,
            "ok"
          );
        } catch (error) {
          this.setStatus(String(error.message || "Could not load sample."), "warn");
        }
        this.slotFileInput.value = "";
      });
    }

    if (this.assignSlotBtn) {
      this.assignSlotBtn.addEventListener("click", () => {
        this.voiceActiveSlots[this.activeVoiceIndex] = this.normalizePlaybackSlot(this.selectedSlotIndex);
        this.renderVoiceManager();
        this.setStatus(
          `${VOICES[this.activeVoiceIndex].letter} playback slot set to ${String(
            this.normalizePlaybackSlot(this.selectedSlotIndex)
          ).padStart(2, "0")}.`,
          "ok"
        );
      });
    }

    if (this.auditionSlotBtn) {
      this.auditionSlotBtn.addEventListener("click", async () => {
        await this.auditionSelectedSlot();
      });
    }

    if (this.clearSlotBtn) {
      this.clearSlotBtn.addEventListener("click", () => {
        this.clearVoiceSlot(this.activeVoiceIndex, this.selectedSlotIndex);
        this.setStatus(
          `Cleared ${VOICES[this.activeVoiceIndex].letter}${String(this.selectedSlotIndex).padStart(2, "0")}.`,
          "warn"
        );
      });
    }

    if (this.saveKitBtn) {
      this.saveKitBtn.addEventListener("click", async () => {
        await this.saveKitAsJson();
      });
    }

    if (this.loadKitBtn && this.kitLoader) {
      this.loadKitBtn.addEventListener("click", () => {
        this.kitLoader.click();
      });

      this.kitLoader.addEventListener("change", async () => {
        const file = this.kitLoader.files?.[0];
        if (!file) {
          return;
        }
        await this.loadKitFromJson(file);
        this.kitLoader.value = "";
      });
    }

    if (this.sourceMode) {
      this.sourceMode.addEventListener("click", () => {
        this.sourceMode.textContent = this.sourceMode.textContent === "LINE" ? "MIC" : "LINE";
      });
    }

    if (this.geekyLogoAction) {
      this.geekyLogoAction.addEventListener("click", () => {
        this.randomizePatternAndKit();
        this.setStatus("Geeky Punks logo: randomized pattern and drum kit.", "ok");
      });
    }

    document.addEventListener("keydown", async (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (this.isPlaying) {
          this.pauseTransport();
        } else {
          await this.startTransport();
        }
      } else if (event.key.toLowerCase() === "s") {
        this.stopTransport();
      } else if (event.key.toLowerCase() === "r") {
        this.recBtn.click();
      }
    });
  }

  activateExclusiveModeButton(activeButton) {
    const exclusive = this.modeButtons.filter(
      (button) => !button.classList.contains("bar-btn") && ![this.shuffleBtn, this.reverseBtn, this.clearPatternBtn].includes(button)
    );
    exclusive.forEach((button) => {
      button.classList.remove("live-lite");
      button.classList.toggle("active-lite", button === activeButton);
    });
  }

  bindDisplayEditors() {
    const card = this.bpmDisplayCard;
    if (!card) {
      return;
    }

    card.style.touchAction = "none";
    card.classList.add("display-editable");

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.classList?.contains("display-edit-input")) {
        return;
      }
      event.preventDefault();
      this.beginDragLock();

      const config = this.getDisplayEditConfig();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startValue = config.getValue();
      card.setPointerCapture(pointerId);

      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        const delta = startY - moveEvent.clientY;
        const raw = startValue + delta / config.pixelsPerStep;
        const snapped = this.snap(this.clamp(raw, config.min, config.max), config.step);
        config.onCommit(snapped);
      };

      const onUp = () => {
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerup", onUp);
        card.removeEventListener("pointercancel", onUp);
        this.endDragLock();
      };

      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerup", onUp);
      card.addEventListener("pointercancel", onUp);
    });

    card.addEventListener("dblclick", () => {
      const config = this.getDisplayEditConfig();
      this.openInlineDisplayInput(card, config.getValue(), config);
    });

    let touchStartY = 0;
    let touchStartValue = 0;
    card.addEventListener(
      "touchstart",
      (event) => {
        if (!event.touches || event.touches.length !== 1) {
          return;
        }
        event.preventDefault();
        const config = this.getDisplayEditConfig();
        touchStartY = event.touches[0].clientY;
        touchStartValue = config.getValue();
        this.beginDragLock();
      },
      { passive: false }
    );
    card.addEventListener(
      "touchmove",
      (event) => {
        if (!event.touches || event.touches.length !== 1) {
          return;
        }
        event.preventDefault();
        const config = this.getDisplayEditConfig();
        const delta = touchStartY - event.touches[0].clientY;
        const raw = touchStartValue + delta / config.pixelsPerStep;
        const snapped = this.snap(this.clamp(raw, config.min, config.max), config.step);
        config.onCommit(snapped);
      },
      { passive: false }
    );
    const releaseDisplayTouch = (event) => {
      event.preventDefault();
      this.endDragLock();
    };
    card.addEventListener("touchend", releaseDisplayTouch, { passive: false });
    card.addEventListener("touchcancel", releaseDisplayTouch, { passive: false });
  }

  bindAdaptiveLayout() {
    const apply = () => this.applyAdaptiveLayout();
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("pageshow", apply);
    window.addEventListener("orientationchange", () => {
      window.setTimeout(apply, 120);
    });
  }

  applyAdaptiveLayout() {
    if (!this.sceneEl || !this.machineEl) {
      return;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const mobile = viewportWidth <= 1180;
    const phoneLike = Math.min(viewportWidth, viewportHeight) <= 920;
    const landscape = viewportWidth > viewportHeight;
    const landscapeFullscreen = mobile && phoneLike && landscape;

    const resetFullscreenClasses = () => {
      document.body.classList.remove("phone-landscape-fullscreen");
      document.documentElement.classList.remove("phone-landscape-fullscreen");
    };

    if (!mobile) {
      this.machineEl.style.transform = "";
      this.machineEl.style.transformOrigin = "";
      this.machineEl.style.width = "";
      this.machineEl.style.minWidth = "";
      this.sceneEl.style.minHeight = "";
      this.sceneEl.style.height = "";
      this.sceneEl.style.width = "";
      this.sceneEl.style.padding = "";
      this.sceneEl.style.overflow = "";
      resetFullscreenClasses();
      return;
    }

    const desktopWidth = 1800;
    this.machineEl.style.width = `${desktopWidth}px`;
    this.machineEl.style.minWidth = `${desktopWidth}px`;
    const rawHeight = this.machineEl.scrollHeight;
    const safeWidth = Math.max(320, viewportWidth - (landscapeFullscreen ? 0 : 10));
    const widthScale = safeWidth / desktopWidth;

    if (landscapeFullscreen) {
      const safeHeight = Math.max(220, viewportHeight - 2);
      const heightScale = safeHeight / rawHeight;
      const scale = this.clamp(Math.min(widthScale, heightScale), 0.3, 1);

      this.machineEl.style.transformOrigin = "top center";
      this.machineEl.style.transform = `scale(${scale})`;
      this.sceneEl.style.minHeight = `${Math.ceil(viewportHeight)}px`;
      this.sceneEl.style.height = `${Math.ceil(viewportHeight)}px`;
      this.sceneEl.style.width = `${Math.ceil(viewportWidth)}px`;
      this.sceneEl.style.padding = "0";
      this.sceneEl.style.overflow = "hidden";
      document.body.classList.add("phone-landscape-fullscreen");
      document.documentElement.classList.add("phone-landscape-fullscreen");
      return;
    }

    const scale = this.clamp(widthScale, 0.42, 1);
    this.machineEl.style.transformOrigin = "top center";
    this.machineEl.style.transform = `scale(${scale})`;
    this.sceneEl.style.minHeight = `${Math.ceil(rawHeight * scale + 12)}px`;
    this.sceneEl.style.height = "";
    this.sceneEl.style.width = "";
    this.sceneEl.style.padding = "";
    this.sceneEl.style.overflow = "";
    resetFullscreenClasses();
  }

  beginDragLock() {
    this.dragLockCount += 1;
    if (this.dragLockCount !== 1) {
      return;
    }
    this.lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = `-${this.lockedScrollY}px`;
    document.body.classList.add("drag-lock");
    document.documentElement.classList.add("drag-lock");
  }

  endDragLock() {
    this.dragLockCount = Math.max(0, this.dragLockCount - 1);
    if (this.dragLockCount > 0) {
      return;
    }
    document.body.classList.remove("drag-lock");
    document.documentElement.classList.remove("drag-lock");
    document.body.style.top = "";
    window.scrollTo(0, this.lockedScrollY || 0);
  }

  getDisplayEditConfig() {
    const knob = this.knobs.get("tempo");
    const min = knob?.def?.min ?? 70;
    const max = knob?.def?.max ?? 180;
    const step = knob?.def?.step ?? 1;
    const pixelsPerStep = this.dataMode === "tempo" ? 4 : 14;

    const getValue = () => {
      if (this.dataMode === "track") {
        return this.selectedTrackIndex;
      }
      if (this.dataMode === "sample") {
        return this.normalizePlaybackSlot(this.voiceActiveSlots[this.selectedTrackIndex]);
      }
      if (this.dataMode === "kit") {
        return this.voiceActiveSlots.every(
          (slot) => this.normalizePlaybackSlot(slot) === this.normalizePlaybackSlot(this.voiceActiveSlots[0])
        )
          ? this.normalizePlaybackSlot(this.voiceActiveSlots[0])
          : 0;
      }
      if (this.dataMode === "lastStep") {
        return this.lastStep;
      }
      if (this.dataMode === "start") {
        return this.trackStartSteps[this.selectedTrackIndex] + 1;
      }
      if (this.dataMode === "end") {
        return this.trackEndSteps[this.selectedTrackIndex] + 1;
      }
      if (this.dataMode === "pattern") {
        return this.patternBankIndex + 1;
      }
      if (this.dataMode === "odds") {
        return this.trackStepProbability[this.selectedTrackIndex] * 100;
      }
      if (this.dataMode === "ratchet") {
        return this.trackRatchetRepeats[this.selectedTrackIndex];
      }
      if (this.dataMode === "accent") {
        return this.trackAccentAmounts[this.selectedTrackIndex] * 100;
      }
      if (this.dataMode === "loop") {
        return this.loopEnabled ? 1 : 0;
      }
      return this.controls.tempo;
    };

    return {
      min,
      max,
      step,
      pixelsPerStep,
      getValue,
      onCommit: (value) => this.setKnobValue("tempo", value)
    };
  }

  openInlineDisplayInput(card, currentValue, options) {
    const existing = card.querySelector(".display-edit-input");
    if (existing) {
      existing.focus();
      existing.select();
      return;
    }

    const { min, max, step, onCommit } = options;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "display-edit-input";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(Math.round(currentValue));

    card.appendChild(input);
    input.focus();
    input.select();

    const finish = (apply) => {
      if (apply) {
        const value = Number(input.value);
        if (Number.isFinite(value)) {
          const snapped = this.snap(this.clamp(value, min, max), step);
          onCommit(snapped);
        }
      }
      input.remove();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        finish(true);
      } else if (event.key === "Escape") {
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      finish(true);
    });
  }

  setTempo(value) {
    const tempo = this.snap(this.clamp(value, 70, 180), 1);
    this.controls.tempo = tempo;
    if (this.dataMode === "tempo") {
      this.setKnobValue("tempo", tempo, { silent: true, bypassDataMode: true });
    }
    this.applyControlState();
  }

  setLastStep(value) {
    this.setSequenceEnd(value);
  }

  setTrackStartStep(trackIndex, value) {
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    const next = Math.round(this.clamp(value, 1, SEQ_STEPS)) - 1;
    this.trackStartSteps[safeTrack] = Math.min(next, this.trackEndSteps[safeTrack]);
  }

  setTrackEndStep(trackIndex, value) {
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    const next = Math.round(this.clamp(value, 1, SEQ_STEPS)) - 1;
    this.trackEndSteps[safeTrack] = Math.max(next, this.trackStartSteps[safeTrack]);
  }

  setSequenceStart(value) {
    const next = Math.round(this.clamp(value, 1, SEQ_STEPS)) - 1;
    this.sequenceStart = Math.min(next, this.sequenceEnd);
    if (this.currentStep < this.sequenceStart || this.currentStep > this.sequenceEnd) {
      this.currentStep = this.sequenceStart;
    }
    if (this.playheadStep < this.sequenceStart || this.playheadStep > this.sequenceEnd) {
      this.playheadStep = -1;
    }
    this.renderStepDisplay();
  }

  setSequenceEnd(value) {
    const next = Math.round(this.clamp(value, 1, SEQ_STEPS)) - 1;
    this.sequenceEnd = Math.max(next, this.sequenceStart);
    this.lastStep = this.sequenceEnd + 1;
    if (this.currentStep < this.sequenceStart || this.currentStep > this.sequenceEnd) {
      this.currentStep = this.sequenceStart;
    }
    if (this.playheadStep < this.sequenceStart || this.playheadStep > this.sequenceEnd) {
      this.playheadStep = -1;
    }
    this.renderStepDisplay();
    if (!this.isPlaying) {
      this.clearPlayhead();
    }
  }

  clonePattern(pattern) {
    return pattern.map((row) => [...row]);
  }

  setPatternBank(index) {
    const safeIndex = Math.round(this.clamp(index, 0, this.patternBanks.length - 1));
    this.patternBanks[this.patternBankIndex] = this.clonePattern(this.pattern);
    this.patternBankIndex = safeIndex;
    this.pattern = this.clonePattern(this.patternBanks[safeIndex]);
    this.updateBarButtonsFromPatternBank();
    this.renderAllSteps();
  }

  updateBarButtonsFromPatternBank() {
    const barIndex = (this.patternBankIndex % 4) + 1;
    this.modeButtons
      .filter((button) => button.classList.contains("bar-btn"))
      .forEach((button) => {
        button.classList.toggle("active-lite", Number(button.dataset.bar) === barIndex);
      });
  }

  clearPattern() {
    this.pattern = TRACKS.map(() => Array.from({ length: SEQ_STEPS }, () => false));
    this.patternBanks[this.patternBankIndex] = this.clonePattern(this.pattern);
    this.stepAutomation = Array.from({ length: SEQ_STEPS }, () => ({}));
    this.renderAllSteps();
  }

  randomizePattern() {
    this.pattern = this.generateGoodGroovePattern();
    this.patternBanks[this.patternBankIndex] = this.clonePattern(this.pattern);
    this.stepAutomation = Array.from({ length: SEQ_STEPS }, () => ({}));
    this.renderAllSteps();
  }

  randomizePatternAndKit() {
    this.stepProbability = 1;
    this.ratchetRepeats = 1;
    this.trackStepProbability = this.trackStepProbability.map(() => 1);
    this.trackRatchetRepeats = this.trackRatchetRepeats.map(() => 1);
    this.trackAccentAmounts = this.trackAccentAmounts.map(() => 0.35);
    this.trackStartSteps = this.trackStartSteps.map(() => 0);
    this.trackEndSteps = this.trackEndSteps.map(() => SEQ_STEPS - 1);
    this.accentAmount = this.trackAccentAmounts[this.selectedTrackIndex];
    this.loopEnabled = true;
    this.shuffleOn = false;
    if (this.shuffleBtn) {
      this.shuffleBtn.classList.remove("live");
    }
    this.randomizePattern();
    this.randomizeKit();
    this.randomizeTrackFiveStepPositions();
    this.setTempo(Math.round(this.randomRange(96, 150)));
  }

  randomizeKit() {
    this.randomizeVoiceSlotsFromLoaded();

    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
      const levelRange = trackIndex === 4 ? [0.48, 0.82] : [0.62, 0.96];
      const level = this.randomRange(levelRange[0], levelRange[1]);
      this.setKnobValue(`level-${trackIndex}`, level, { silent: true });
    }

    const baseToneRanges = {
      pitch: [-4, 4],
      decay: [0.12, 0.82],
      loopPoint: [0, 0.2],
      cutoff: [900, 12500],
      resonance: [0.7, 4.4],
      drive: [0.02, 0.24],
      pan: [-0.35, 0.35]
    };

    const perTrackOverrides = {
      0: {
        pitch: [-2.5, 2],
        decay: [0.14, 0.55],
        loopPoint: [0, 0.08],
        cutoff: [1400, 9800],
        resonance: [0.8, 3.2],
        drive: [0.03, 0.22],
        pan: [0, 0]
      },
      4: {
        decay: [2.2, 4.6],
        loopPoint: [0.06, 0.62],
        cutoff: [700, 7800],
        resonance: [0.8, 3.8],
        drive: [0, 0],
        pan: [-0.22, 0.22]
      },
      5: {
        loopPoint: [0, 0.06],
        cutoff: [5200, 14500]
      },
      6: {
        loopPoint: [0, 0.07],
        cutoff: [4400, 14500]
      }
    };

    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
      const trackRanges = {
        ...baseToneRanges,
        ...(perTrackOverrides[trackIndex] || {})
      };
      Object.entries(trackRanges).forEach(([id, [min, max]]) => {
        const def = CONTROL_DEFS.find((item) => item.id === id);
        if (!def) {
          return;
        }
        let raw = this.randomRange(min, max);
        if (trackIndex === 4 && id === "pitch") {
          raw = this.randomPadPitch();
        } else if (trackIndex === 4 && id === "loopPoint") {
          raw = this.randomPadLoopPoint();
        } else if (trackIndex === 4 && id === "drive") {
          raw = 0;
        }
        const snapped = this.snap(this.clamp(raw, def.min, def.max), def.step);
        this.voiceControls[trackIndex][id] = snapped;
      });
    }

    this.syncToneControlsForSelectedTrack();

    this.applyControlState();
    this.renderMainDisplay();
    this.renderAllSteps();
  }

  randomizeTrackFiveStepPositions() {
    const trackIndex = 4;
    const loopDef = CONTROL_DEFS.find((def) => def.id === "loopPoint");
    const panDef = CONTROL_DEFS.find((def) => def.id === "pan");
    if (!loopDef || !panDef) {
      return;
    }

    for (let step = 0; step < SEQ_STEPS; step += 1) {
      if (!this.stepAutomation[step]) {
        this.stepAutomation[step] = {};
      }

      const hasHit = Boolean(this.pattern[trackIndex][step]);
      const loopCenter = hasHit ? this.randomPadLoopPoint() : this.randomRange(0.08, 0.4);
      const loopJitter = this.randomRange(-0.055, 0.055);
      const loopPoint = this.snap(this.clamp(loopCenter + loopJitter, 0.04, 0.68), loopDef.step);

      const panRange = hasHit ? 0.24 : 0.15;
      const pan = this.snap(this.clamp(this.randomRange(-panRange, panRange), panDef.min, panDef.max), panDef.step);

      this.stepAutomation[step][`loopPoint@${trackIndex}`] = loopPoint;
      this.stepAutomation[step][`pan@${trackIndex}`] = pan;
    }
  }

  randomizeVoiceSlotsFromLoaded() {
    for (let voiceIndex = 0; voiceIndex < TRACKS.length; voiceIndex += 1) {
      const available = this.getAvailableSlotsForVoice(voiceIndex);
      if (available.length > 0) {
        this.voiceActiveSlots[voiceIndex] = available[Math.floor(Math.random() * available.length)];
      } else {
        this.voiceActiveSlots[voiceIndex] = Math.floor(this.randomRange(0, 10));
      }
      this.prepareSampleForPlayback(voiceIndex, this.voiceActiveSlots[voiceIndex]);
    }
    this.selectedSlotIndex = this.voiceActiveSlots[this.selectedTrackIndex] || 0;
    this.activeVoiceIndex = this.selectedTrackIndex;
    this.updateTrackSlotChips();
    this.renderVoiceManager();
    this.syncDataKnobToCurrentMode();
  }

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  randomPadPitch() {
    const semitones = [-7, -5, -3, 0, 2, 3, 5, 7];
    return semitones[Math.floor(Math.random() * semitones.length)];
  }

  randomPadLoopPoint() {
    const anchors = [0.08, 0.12, 0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.58];
    const base = anchors[Math.floor(Math.random() * anchors.length)];
    const jitter = this.randomRange(-0.015, 0.015);
    return this.clamp(base + jitter, 0.04, 0.65);
  }

  generateGoodGroovePattern() {
    const pattern = TRACKS.map(() => Array.from({ length: SEQ_STEPS }, () => false));

    const grooves = [
      {
        kick: [0, 7, 8, 10, 14],
        snare: [4, 12],
        clap: [12],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        tom: [6, 13],
        fx: [15],
        cymbal: [0]
      },
      {
        kick: [0, 3, 8, 11, 14],
        snare: [4, 12],
        clap: [4, 12],
        hihat: [0, 2, 3, 6, 8, 10, 11, 14],
        tom: [2, 9],
        fx: [7, 15],
        cymbal: [0, 8]
      },
      {
        kick: [0, 5, 8, 12, 14],
        snare: [4, 12, 15],
        clap: [12],
        hihat: [1, 3, 5, 7, 9, 11, 13, 15],
        tom: [6, 10],
        fx: [14],
        cymbal: [0]
      },
      {
        kick: [0, 6, 8, 10, 13, 15],
        snare: [4, 12],
        clap: [4, 13],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        tom: [2, 6, 10, 14],
        fx: [11],
        cymbal: [0, 15]
      }
    ];

    const maybe = (chance) => Math.random() < chance;
    const groove = grooves[Math.floor(Math.random() * grooves.length)];
    groove.kick.forEach((step) => {
      pattern[0][step] = true;
    });
    groove.snare.forEach((step) => {
      pattern[1][step] = true;
    });
    groove.tom.forEach((step) => {
      if (maybe(0.85)) {
        pattern[2][step] = true;
      }
    });
    groove.clap.forEach((step) => {
      if (maybe(0.9)) {
        pattern[3][step] = true;
      }
    });
    const padMotifs = [
      [0, 8],
      [4, 12],
      [0, 10],
      [2, 14],
      [0, 12],
      [6, 14]
    ];
    const chosenPadMotif = padMotifs[Math.floor(Math.random() * padMotifs.length)];
    pattern[4].fill(false);
    chosenPadMotif.forEach((step) => {
      pattern[4][step] = true;
    });
    if (maybe(0.35)) {
      const tails = [7, 11, 15];
      pattern[4][tails[Math.floor(Math.random() * tails.length)]] = true;
    }
    if (maybe(0.22)) {
      pattern[4][(chosenPadMotif[0] + 4) % SEQ_STEPS] = true;
    }
    groove.hihat.forEach((step) => {
      if (maybe(0.92)) {
        pattern[5][step] = true;
      }
    });
    groove.cymbal.forEach((step) => {
      if (maybe(0.72)) {
        pattern[6][step] = true;
      }
    });

    if (maybe(0.42)) {
      pattern[0][15] = true;
    }
    if (maybe(0.35)) {
      pattern[1][11] = true;
    }
    if (maybe(0.55)) {
      pattern[5][7] = true;
    }
    if (maybe(0.3)) {
      pattern[5][15] = true;
    }

    return pattern;
  }

  renderAllSteps() {
    for (let step = 0; step < SEQ_STEPS; step += 1) {
      this.renderStep(this.selectedTrackIndex, step);
    }
  }

  renderStep(track, step) {
    const button = this.stepButtons[step];
    if (!button) {
      return;
    }
    const activeTrack = this.selectedTrackIndex;
    button.classList.toggle("is-on", Boolean(this.pattern[activeTrack][step]));
    button.classList.toggle("is-current", step === this.playheadStep);
  }

  renderPlayhead(step) {
    this.playheadStep = step;
    for (let s = 0; s < SEQ_STEPS; s += 1) {
      const button = this.stepButtons[s];
      if (button) {
        button.classList.toggle("is-current", s === step);
      }
    }
  }

  clearPlayhead() {
    this.playheadStep = -1;
    this.renderStepDisplay();
    for (let step = 0; step < SEQ_STEPS; step += 1) {
      if (this.stepButtons[step]) {
        this.stepButtons[step].classList.remove("is-current");
      }
    }
  }

  renderTempoDisplay() {
    this.renderMainDisplay();
  }

  renderStepDisplay() {
    const value = String(Math.max(1, this.lastStep)).padStart(2, "0");
    if (this.stepDisplay) {
      this.stepDisplay.textContent = value;
    }
  }

  renderMainDisplay() {
    if (!this.bpmDisplay) {
      return;
    }

    let value = String(Math.round(this.controls.tempo));
    let label = "BPM";

    if (this.dataMode === "track") {
      value = String(this.selectedTrackIndex + 1);
      label = "TRACK";
    } else if (this.dataMode === "sample") {
      value = String(this.normalizePlaybackSlot(this.voiceActiveSlots[this.selectedTrackIndex] ?? 0)).padStart(2, "0");
      label = "SAMPLE";
    } else if (this.dataMode === "kit") {
      const slot = this.voiceActiveSlots.every((s) => this.normalizePlaybackSlot(s) === this.normalizePlaybackSlot(this.voiceActiveSlots[0]))
        ? this.normalizePlaybackSlot(this.voiceActiveSlots[0])
        : 0;
      value = String(slot).padStart(2, "0");
      label = "KIT";
    } else if (this.dataMode === "pattern") {
      value = String(this.patternBankIndex + 1).padStart(2, "0");
      label = "PATT";
    } else if (this.dataMode === "start") {
      value = String(this.trackStartSteps[this.selectedTrackIndex] + 1).padStart(2, "0");
      label = "START";
    } else if (this.dataMode === "end") {
      value = String(this.trackEndSteps[this.selectedTrackIndex] + 1).padStart(2, "0");
      label = "END";
    } else if (this.dataMode === "odds") {
      value = String(Math.round(this.trackStepProbability[this.selectedTrackIndex] * 100)).padStart(2, "0");
      label = "PROB";
    } else if (this.dataMode === "ratchet") {
      value = String(this.trackRatchetRepeats[this.selectedTrackIndex]);
      label = "RATCH";
    } else if (this.dataMode === "accent") {
      value = String(Math.round(this.trackAccentAmounts[this.selectedTrackIndex] * 100)).padStart(2, "0");
      label = "ACC";
    } else if (this.dataMode === "loop") {
      value = this.loopEnabled ? "ON" : "OFF";
      label = "LOOP";
    } else if (this.dataMode === "lastStep") {
      value = String(this.lastStep).padStart(2, "0");
      label = "STEP";
    }

    this.bpmDisplay.textContent = value;
    if (this.displayLabel) {
      this.displayLabel.textContent = label;
    }
  }

  async startTransport() {
    await this.ensureAudioReady();
    await this.decodePathBackedSamples();
    await this.decodeAllSampleBuffers();
    this.isPlaying = true;
    this.playPauseBtn.classList.add("live");
    this.currentStep = this.sequenceStart;
    this.clearScheduledUi();
    this.nextNoteTime = this.audioCtx.currentTime + 0.04;

    if (this.schedulerId) {
      clearInterval(this.schedulerId);
    }

    this.schedulerId = window.setInterval(() => this.scheduler(), this.lookAheadMs);
    this.scheduler();
  }

  pauseTransport() {
    this.isPlaying = false;
    this.playPauseBtn.classList.remove("live");

    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }

    this.clearScheduledUi();
  }

  stopTransport() {
    this.pauseTransport();
    this.currentStep = 0;
    this.lastScheduledStep = -1;
    this.clearPlayhead();
  }

  clearScheduledUi() {
    while (this.uiTimeouts.length) {
      const timeout = this.uiTimeouts.pop();
      clearTimeout(timeout);
    }
  }

  scheduler() {
    if (!this.isPlaying || !this.audioCtx) {
      return;
    }

    while (this.isPlaying && this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadSec) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  scheduleStep(step, time) {
    this.lastScheduledStep = step;
    this.applyStepAutomation(step);
    const secPerStep = 60 / this.controls.tempo / 4;

    const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    const timeout = window.setTimeout(() => {
      this.renderPlayhead(step);
      this.uiTimeouts = this.uiTimeouts.filter((id) => id !== timeout);
    }, delay);
    this.uiTimeouts.push(timeout);

    for (let track = 0; track < TRACKS.length; track += 1) {
      if (!this.pattern[track][step] || this.trackMutes[track]) {
        continue;
      }
      const trackStart = this.trackStartSteps[track] ?? 0;
      const trackEnd = this.trackEndSteps[track] ?? (SEQ_STEPS - 1);
      if (step < trackStart || step > trackEnd) {
        continue;
      }
      const stepProbability = this.trackStepProbability[track] ?? this.stepProbability;
      if (Math.random() > stepProbability) {
        continue;
      }
      const repeats = Math.max(1, this.trackRatchetRepeats[track] ?? this.ratchetRepeats);
      const spacing = secPerStep / repeats;
      const accentAmount = this.trackAccentAmounts[track] ?? this.accentAmount;
      const accentScale = step % 4 === 0 ? 1 + accentAmount * 0.35 : 1;
      const repeatCompensation = 1 / Math.sqrt(repeats);
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        this.triggerTrack(track, time + repeat * spacing, { levelScale: accentScale * repeatCompensation });
      }
    }
  }

  advanceStep() {
    const secPerStep = 60 / this.controls.tempo / 4;
    let swingOffset = 0;
    if (this.shuffleOn && this.currentStep % 2 === 1) {
      swingOffset = secPerStep * 0.12;
    }
    this.nextNoteTime += Math.max(0.002, secPerStep + swingOffset);

    if (this.currentStep >= this.sequenceEnd) {
      if (this.loopEnabled) {
        this.currentStep = this.sequenceStart;
      } else {
        this.currentStep = this.sequenceEnd;
        this.pauseTransport();
      }
      return;
    }
    this.currentStep += 1;
  }

  async ensureAudioReady() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.buildAudioGraph();
      this.applyControlState();
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    this.startHoneyAnalyzer();
  }

  buildAudioGraph() {
    this.masterInput = this.audioCtx.createGain();
    this.masterHeadroom = this.audioCtx.createGain();
    this.masterHeadroom.gain.value = 0.5;
    this.masterFilter = this.audioCtx.createBiquadFilter();
    this.masterFilter.type = "lowpass";
    this.masterFilter.frequency.value = 18000;
    this.masterFilter.Q.value = 0.707;
    this.masterDrive = this.audioCtx.createWaveShaper();
    this.masterDrive.oversample = "4x";
    this.masterPan = this.createPanNode(0);
    this.masterSoftClip = this.audioCtx.createWaveShaper();
    this.masterSoftClip.oversample = "4x";
    this.masterSoftClip.curve = this.makeSoftClipCurve(0.45);
    this.masterLimiter = this.audioCtx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -12;
    this.masterLimiter.knee.value = 10;
    this.masterLimiter.ratio.value = 2.5;
    this.masterLimiter.attack.value = 0.005;
    this.masterLimiter.release.value = 0.12;
    this.masterGain = this.audioCtx.createGain();
    this.masterDrive.curve = this.makeDriveCurve(0);
    this.honeyMeterNode = this.audioCtx.createAnalyser();
    this.honeyMeterNode.fftSize = 256;
    this.honeyMeterNode.smoothingTimeConstant = 0.78;
    this.honeyMeterBuffer = new Uint8Array(this.honeyMeterNode.frequencyBinCount);

    this.masterInput.connect(this.masterHeadroom);
    this.masterHeadroom.connect(this.masterFilter);
    this.masterFilter.connect(this.masterDrive);
    this.masterDrive.connect(this.masterPan);
    this.masterPan.connect(this.masterSoftClip);
    this.masterSoftClip.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterGain);
    this.masterGain.connect(this.audioCtx.destination);
    this.masterGain.connect(this.honeyMeterNode);

    this.trackInputs = [];
    this.trackPreDrives = [];
    this.trackFilters = [];
    this.trackFilterStages = [];
    this.trackResPeaks = [];
    this.trackDrives = [];
    this.trackPans = [];
    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
      const input = this.audioCtx.createGain();
      input.gain.value = 0.78;
      const preDrive = this.audioCtx.createWaveShaper();
      preDrive.oversample = "4x";
      preDrive.curve = this.makeDriveCurve(0.14);
      const filterStages = Array.from({ length: 4 }, () => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 18000;
        filter.Q.value = 0.707;
        return filter;
      });
      const resonancePeak = this.audioCtx.createBiquadFilter();
      resonancePeak.type = "peaking";
      resonancePeak.frequency.value = 1200;
      resonancePeak.Q.value = 1.2;
      resonancePeak.gain.value = 0;
      const drive = this.audioCtx.createWaveShaper();
      drive.oversample = "4x";
      drive.curve = this.makeDriveCurve(0);
      const pan = this.createPanNode(0);

      input.connect(preDrive);
      preDrive.connect(filterStages[0]);
      filterStages[0].connect(filterStages[1]);
      filterStages[1].connect(filterStages[2]);
      filterStages[2].connect(filterStages[3]);
      filterStages[3].connect(resonancePeak);
      resonancePeak.connect(drive);
      drive.connect(pan);
      pan.connect(this.masterInput);

      this.trackInputs.push(input);
      this.trackPreDrives.push(preDrive);
      this.trackFilters.push(filterStages[0]);
      this.trackFilterStages.push(filterStages);
      this.trackResPeaks.push(resonancePeak);
      this.trackDrives.push(drive);
      this.trackPans.push(pan);
    }

    this.noiseBuffer = this.makeNoiseBuffer();
    this.applyAllTrackToneStates();
  }

  applyTrackToneState(trackIndex) {
    if (!this.audioCtx) {
      return;
    }
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    const tone = this.getVoiceTone(safeTrack);
    const preDrive = this.trackPreDrives[safeTrack];
    const filterStages = this.trackFilterStages[safeTrack];
    const resonancePeak = this.trackResPeaks[safeTrack];
    const drive = this.trackDrives[safeTrack];
    const pan = this.trackPans[safeTrack];
    if (!preDrive || !filterStages || filterStages.length === 0 || !resonancePeak || !drive || !pan) {
      return;
    }
    const now = this.audioCtx.currentTime;
    const cutoffFloor = this.getTrackCutoffFloor(safeTrack);
    const ladderCutoff = Math.max(cutoffFloor, this.mapCutoffToLadderFrequency(tone.cutoff));
    const q = this.mapResonanceToLadderQ(tone.resonance);
    const resonanceNorm = this.clamp(q / 18, 0, 1);
    const driveNorm = this.clamp(tone.drive, 0, 1);
    const musicalDrive = Math.pow(driveNorm, 1.8);
    const preDriveAmount = this.clamp(0.02 + resonanceNorm * 0.12 + musicalDrive * 0.28, 0, 0.42);
    preDrive.curve = this.makeDriveCurve(preDriveAmount);
    drive.curve = this.makeDriveCurve(this.clamp(musicalDrive * 0.35 + resonanceNorm * 0.02, 0, 0.4));

    const cutoffMultipliers = [1.3, 1.08, 0.9, 0.72];
    const qWeights = [0.18, 0.3, 0.52, 0.84];
    filterStages.forEach((filter, index) => {
      const stageMin = Math.max(38, cutoffFloor * 0.72);
      const stageCutoff = this.clamp(ladderCutoff * (cutoffMultipliers[index] || 1), stageMin, 18000);
      const stageQ = this.clamp(0.18 + q * (qWeights[index] || 0.25), 0.1, 28);
      filter.frequency.setTargetAtTime(stageCutoff, now, 0.01);
      filter.Q.setTargetAtTime(stageQ, now, 0.01);
    });

    resonancePeak.frequency.setTargetAtTime(this.clamp(ladderCutoff * 0.92, Math.max(45, cutoffFloor * 0.7), 15000), now, 0.01);
    resonancePeak.Q.setTargetAtTime(this.clamp(0.45 + q * 0.5, 0.3, 24), now, 0.01);
    resonancePeak.gain.setTargetAtTime(-8 + resonanceNorm * 14, now, 0.01);

    this.setPanValue(pan, this.clamp(tone.pan, -1, 1), now, 0.01);
  }

  mapCutoffToLadderFrequency(cutoffValue) {
    const minIn = CONTROL_DEFS.find((def) => def.id === "cutoff")?.min ?? 60;
    const maxIn = CONTROL_DEFS.find((def) => def.id === "cutoff")?.max ?? 16000;
    const norm = this.clamp((cutoffValue - minIn) / Math.max(1, maxIn - minIn), 0, 1);
    const shaped = Math.pow(norm, 2.05);
    return 38 + shaped * (12600 - 38);
  }

  getTrackCutoffFloor(trackIndex) {
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    if (safeTrack === 5) {
      return 4800;
    }
    if (safeTrack === 6) {
      return 4200;
    }
    return 38;
  }

  mapResonanceToLadderQ(resonanceValue) {
    const minIn = CONTROL_DEFS.find((def) => def.id === "resonance")?.min ?? 0;
    const maxIn = CONTROL_DEFS.find((def) => def.id === "resonance")?.max ?? 24;
    const norm = this.clamp((resonanceValue - minIn) / Math.max(0.001, maxIn - minIn), 0, 1);
    return Math.pow(norm, 1.28) * 18;
  }

  applyAllTrackToneStates() {
    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
      this.applyTrackToneState(trackIndex);
    }
  }

  createPanNode(initialPan = 0) {
    if (typeof this.audioCtx.createStereoPanner === "function") {
      const panner = this.audioCtx.createStereoPanner();
      panner.pan.value = this.clamp(initialPan, -1, 1);
      return panner;
    }
    const gain = this.audioCtx.createGain();
    gain.__panFallback = true;
    return gain;
  }

  setPanValue(node, panValue, time = 0, smoothing = 0.01) {
    if (!node) {
      return;
    }
    if (node.pan && typeof node.pan.setTargetAtTime === "function") {
      node.pan.setTargetAtTime(this.clamp(panValue, -1, 1), time, smoothing);
    }
  }

  triggerTrack(trackIndex, time, options = {}) {
    const { allowHtmlFallback = false, levelScale = 1 } = options;
    const level = this.clamp(this.trackLevels[trackIndex] * levelScale, 0, 0.72);
    if (level <= 0.001) {
      return;
    }
    this.indicateTrackLoudness(trackIndex, level, time);

    const { sample } = this.getPlaybackSampleForTrack(trackIndex);
    if (sample) {
      if (sample.buffer) {
        this.playSampleBuffer(trackIndex, sample.buffer, level, time);
        return;
      }
      if (sample.path) {
        if (!sample.pathDecodeFailed) {
          this.queuePathSampleDecode(sample);
        }
        if (sample.buffer) {
          this.playSampleBuffer(trackIndex, sample.buffer, level, time);
          return;
        }
        // Avoid per-hit HTML media element playback while sequencer is running on mobile.
        if (allowHtmlFallback || (!this.isPlaying && sample.pathDecodeFailed)) {
          this.playHtmlAudioSample(trackIndex, sample.path, level, () => {
            this.playInternalVoice(trackIndex, level, time);
          });
          return;
        }
        this.playInternalVoice(trackIndex, level, time);
        return;
      }
      if (sample.arrayBuffer && this.audioCtx && !sample.decodeFailed) {
        this.decodeSampleEntry(sample);
        if (sample.buffer) {
          this.playSampleBuffer(trackIndex, sample.buffer, level, time);
          return;
        }
      }
      this.playInternalVoice(trackIndex, level, time);
      return;
    }

    this.playInternalVoice(trackIndex, level, time);
  }

  indicateTrackLoudness(trackIndex, level, time) {
    const knob = this.knobs.get(`level-${trackIndex}`);
    if (!knob || !knob.wrap) {
      return;
    }
    const strength = this.clamp(level, 0, 1);
    const delayMs = this.audioCtx ? Math.max(0, (time - this.audioCtx.currentTime) * 1000) : 0;
    window.setTimeout(() => {
      knob.wrap.style.setProperty("--hit-level", strength.toFixed(3));
      knob.wrap.classList.add("is-hit");
      const prev = this.levelHitTimers[trackIndex];
      if (prev) {
        clearTimeout(prev);
      }
      this.levelHitTimers[trackIndex] = window.setTimeout(() => {
        knob.wrap.classList.remove("is-hit");
        this.levelHitTimers[trackIndex] = null;
      }, 125);
    }, delayMs);
  }

  scheduleSamplePreview(trackIndex) {
    if (this.samplePreviewTimeout) {
      clearTimeout(this.samplePreviewTimeout);
    }
    this.samplePreviewTimeout = window.setTimeout(() => {
      this.samplePreviewTimeout = null;
      this.previewTrackSample(trackIndex);
    }, 90);
  }

  prepareSampleForPlayback(trackIndex, slotIndex) {
    if (!this.audioCtx) {
      return;
    }
    const sample = this.sampleBanks[trackIndex]?.[slotIndex];
    if (!sample || sample.buffer) {
      return;
    }
    if (sample.arrayBuffer) {
      this.decodeSampleEntry(sample);
      return;
    }
    if (sample.path && !sample.pathDecodeFailed) {
      this.queuePathSampleDecode(sample);
    }
  }

  async previewTrackSample(trackIndex) {
    try {
      await this.ensureAudioReady();
      await this.decodePathBackedSamples();
      await this.decodeAllSampleBuffers();
      if (this.isPlaying) {
        return;
      }
      this.triggerTrack(trackIndex, this.audioCtx.currentTime + 0.01, { allowHtmlFallback: true });
    } catch (_error) {
      // Ignore preview errors on restricted browsers.
    }
  }

  queuePathSampleDecode(sample) {
    if (
      !this.audioCtx ||
      !sample ||
      !sample.path ||
      sample.buffer ||
      sample.decodePromise ||
      sample.pathDecodeFailed
    ) {
      return;
    }
    sample.decodePromise = fetch(sample.path)
      .then((response) => {
        if (!response.ok) {
          throw new Error("sample fetch failed");
        }
        return response.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        sample.arrayBuffer = arrayBuffer.slice(0);
        const wavMeta = this.parseWavMetadata(arrayBuffer);
        if (wavMeta?.ok) {
          sample.wavMeta = wavMeta;
        }
        const ok = await this.decodeSampleEntry(sample);
        if (!ok || !sample.buffer) {
          sample.pathDecodeFailed = true;
        }
      })
      .catch(() => {
        sample.pathDecodeFailed = true;
      })
      .finally(() => {
        sample.decodePromise = null;
      });
  }

  async decodePathBackedSamples() {
    if (!this.audioCtx) {
      return;
    }

    const tasks = [];
    for (const bank of this.sampleBanks) {
      for (const sample of bank) {
        if (!sample || !sample.path || sample.buffer || sample.pathDecodeFailed) {
          continue;
        }
        this.queuePathSampleDecode(sample);
        if (sample.decodePromise) {
          tasks.push(sample.decodePromise);
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  playHtmlAudioSample(trackIndex, path, level, onFail = null) {
    const tone = this.getVoiceTone(trackIndex);
    const audio = new Audio(path);
    audio.preload = "auto";
    audio.volume = 1;
    audio.playbackRate = Math.pow(2, tone.pitch / 12);
    audio.currentTime = 0;

    if (this.audioCtx && this.masterInput) {
      let source = null;
      let amp = null;
      let toneNodes = null;
      let stopTimer = null;
      const release = () => {
        if (stopTimer) {
          clearTimeout(stopTimer);
          stopTimer = null;
        }
        if (source) {
          try {
            source.disconnect();
          } catch (_error) {
            // Ignore disconnection errors from already-released nodes.
          }
          source = null;
        }
        if (amp) {
          try {
            amp.disconnect();
          } catch (_error) {
            // Ignore disconnection errors from already-released nodes.
          }
          amp = null;
        }
        if (toneNodes) {
          toneNodes.forEach((node) => {
            try {
              node.disconnect();
            } catch (_error) {
              // Ignore disconnection errors from already-released nodes.
            }
          });
          toneNodes = null;
        }
      };

      try {
        source = this.audioCtx.createMediaElementSource(audio);
        amp = this.audioCtx.createGain();
        const now = this.audioCtx.currentTime;
        const decay = this.getEffectiveDecay(trackIndex, tone.decay);
        const peak = Math.max(0.0001, this.clamp(level, 0, 1));
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.linearRampToValueAtTime(peak, now + 0.002);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        source.connect(amp);
        toneNodes = this.connectNodeWithTrackTone(amp, trackIndex);

        stopTimer = window.setTimeout(() => {
          audio.pause();
          release();
        }, Math.round(Math.max(80, decay * 1100)));
      } catch (_error) {
        release();
      }

      audio.addEventListener(
        "ended",
        () => {
          release();
        },
        { once: true }
      );
      audio.addEventListener(
        "error",
        () => {
          release();
        },
        { once: true }
      );
    }

    audio.addEventListener(
      "error",
      () => {
        if (typeof onFail === "function") {
          onFail();
        }
      },
      { once: true }
    );
    audio.play().catch(() => {
      if (typeof onFail === "function") {
        onFail();
      }
    });
  }

  playSampleBuffer(trackIndex, buffer, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, tone.pitch / 12);

    const amp = this.audioCtx.createGain();
    const decay = this.getEffectiveDecay(trackIndex, tone.decay);
    const peak = Math.max(0.0001, level);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.0016);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    source.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);

    const safeDuration = Math.max(0.003, buffer.duration);
    const rawStart = Math.min(safeDuration - 0.002, safeDuration * tone.loopPoint);
    const sampleRate = buffer.sampleRate || 48000;
    const rawStartSample = Math.floor(rawStart * sampleRate);
    const zeroCrossStartSample = this.findNearestZeroCrossing(buffer, rawStartSample, 1536);
    const startAt = zeroCrossStartSample / sampleRate;
    const maxDuration = Math.max(0.003, safeDuration - startAt);
    const duration = Math.min(Math.max(decay * 2.4, 0.05), maxDuration);

    source.start(time, Math.max(0, startAt), duration);
    source.stop(time + duration + 0.02);
    source.onended = () => {
      try {
        source.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };
  }

  connectNodeWithTrackTone(node, trackIndex) {
    if (!this.audioCtx || !this.masterInput || !node) {
      return [];
    }
    const safeTrack = this.clamp(Math.round(trackIndex), 0, TRACKS.length - 1);
    const input = this.trackInputs[safeTrack];
    if (!input) {
      node.connect(this.masterInput);
      return [];
    }
    node.connect(input);
    return [input];
  }

  getEffectiveDecay(trackIndex, rawDecay) {
    const base = Math.max(0.04, Number(rawDecay) || 0.04);
    if (trackIndex === 4) {
      return this.clamp(base * 1.8, 0.2, 8);
    }
    return base;
  }

  findNearestZeroCrossing(buffer, centerSample, searchRadius = 1024) {
    const data = buffer.getChannelData(0);
    if (!data || data.length < 4) {
      return Math.max(0, centerSample);
    }

    const minIndex = Math.max(1, centerSample - searchRadius);
    const maxIndex = Math.min(data.length - 2, centerSample + searchRadius);
    let bestIndex = centerSample;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = minIndex; i <= maxIndex; i += 1) {
      const a = data[i - 1];
      const b = data[i];
      const crossing = a === 0 || b === 0 || (a < 0 && b >= 0) || (a > 0 && b <= 0);
      if (!crossing) {
        continue;
      }
      const distance = Math.abs(i - centerSample);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        if (distance === 0) {
          break;
        }
      }
    }

    return bestIndex;
  }

  playInternalVoice(track, level, time) {
    switch (track) {
      case 0:
        this.playKick(track, level, time);
        break;
      case 1:
        this.playSnare(track, level, time);
        break;
      case 2:
        this.playPerc(track, level, time, 260);
        break;
      case 3:
        this.playClap(track, level, time);
        break;
      case 4:
        this.playFx(track, level, time);
        break;
      case 5:
        this.playHat(track, level, time);
        break;
      case 6:
        this.playPerc(track, level, time, 520);
        break;
      default:
        this.playHat(track, level, time);
        break;
    }
  }

  playKick(trackIndex, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    const osc = this.audioCtx.createOscillator();
    const amp = this.audioCtx.createGain();
    const ratio = Math.pow(2, tone.pitch / 12);

    osc.type = "sine";
    osc.frequency.setValueAtTime(145 * ratio, time);
    osc.frequency.exponentialRampToValueAtTime(43 * ratio, time + Math.min(0.22, tone.decay * 0.8));

    amp.gain.setValueAtTime(level, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.12, tone.decay * 1.1));

    osc.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);
    osc.start(time);
    osc.stop(time + 0.4);
    osc.onended = () => {
      try {
        osc.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };
  }

  playSnare(trackIndex, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    this.playNoiseBurst(trackIndex, time, level * 0.85, Math.max(0.05, tone.decay * 0.5), 1700, 6200);

    const toneOsc = this.audioCtx.createOscillator();
    const amp = this.audioCtx.createGain();
    const ratio = Math.pow(2, tone.pitch / 12);

    toneOsc.type = "triangle";
    toneOsc.frequency.value = 190 * ratio;
    amp.gain.setValueAtTime(level * 0.26, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.1, tone.decay * 0.65));

    toneOsc.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);
    toneOsc.start(time);
    toneOsc.stop(time + 0.26);
    toneOsc.onended = () => {
      try {
        toneOsc.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };
  }

  playClap(trackIndex, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    const duration = Math.max(0.04, tone.decay * 0.42);
    [0, 0.012, 0.027].forEach((offset, index) => {
      const burstLevel = index === 2 ? level * 0.9 : level * 0.6;
      this.playNoiseBurst(trackIndex, time + offset, burstLevel, duration, 900, 6800);
    });
  }

  playHat(trackIndex, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    this.playNoiseBurst(trackIndex, time, level * 0.75, Math.max(0.03, tone.decay * 0.28), 4500, 14000);
  }

  playPerc(trackIndex, level, time, baseFreq) {
    const tone = this.getVoiceTone(trackIndex);
    const osc = this.audioCtx.createOscillator();
    const amp = this.audioCtx.createGain();
    const ratio = Math.pow(2, tone.pitch / 12);

    osc.type = "triangle";
    osc.frequency.value = baseFreq * ratio;
    amp.gain.setValueAtTime(level * 0.58, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, tone.decay * 0.72));

    osc.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);
    osc.start(time);
    osc.stop(time + 0.32);
    osc.onended = () => {
      try {
        osc.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };
  }

  playFx(trackIndex, level, time) {
    const tone = this.getVoiceTone(trackIndex);
    const osc = this.audioCtx.createOscillator();
    const amp = this.audioCtx.createGain();
    const ratio = Math.pow(2, tone.pitch / 12);

    osc.type = "square";
    osc.frequency.setValueAtTime(320 * ratio, time);
    osc.frequency.exponentialRampToValueAtTime(90 * ratio, time + 0.11);

    amp.gain.setValueAtTime(level * 0.45, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.11, tone.decay * 0.9));

    osc.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);
    osc.start(time);
    osc.stop(time + 0.3);
    osc.onended = () => {
      try {
        osc.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };

    this.playNoiseBurst(trackIndex, time, level * 0.25, Math.max(0.04, tone.decay * 0.35), 2300, 9000);
  }

  playNoiseBurst(trackIndex, time, level, decay, highpass, lowpass) {
    const tone = this.getVoiceTone(trackIndex);
    const source = this.audioCtx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = Math.pow(2, tone.pitch / 24);

    const hp = this.audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpass;

    const lp = this.audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = lowpass;

    const amp = this.audioCtx.createGain();
    amp.gain.setValueAtTime(Math.max(0.0001, level), time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    source.connect(hp);
    hp.connect(lp);
    lp.connect(amp);
    this.connectNodeWithTrackTone(amp, trackIndex);

    source.start(time);
    source.stop(time + decay + 0.02);
    source.onended = () => {
      try {
        source.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        hp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        lp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
      try {
        amp.disconnect();
      } catch (_error) {
        // Ignore disconnection errors from already-released nodes.
      }
    };
  }

  makeNoiseBuffer() {
    const length = this.audioCtx.sampleRate;
    const buffer = this.audioCtx.createBuffer(1, length, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  makeDriveCurve(amount) {
    const drive = this.clamp(Number(amount) || 0, 0, 1);
    const samples = 2048;
    const curve = new Float32Array(samples);

    if (drive <= 0.001) {
      for (let i = 0; i < samples; i += 1) {
        curve[i] = (i * 2) / (samples - 1) - 1;
      }
      return curve;
    }

    const intensity = 1 + drive * 4.2;
    const asymmetry = 0.08 * drive;
    const wet = 0.6 + drive * 0.28;
    const dry = 1 - wet;
    const norm = Math.tanh(intensity * (1 + asymmetry));

    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / (samples - 1) - 1;
      const asymmetricX = x + asymmetry * x * x * Math.sign(x);
      const saturated = Math.tanh(asymmetricX * intensity) / norm;
      const blended = dry * x + wet * saturated;
      curve[i] = this.clamp(blended * (1 - drive * 0.14), -1, 1);
    }

    // Slight smoothing reduces brittle digital edge at higher drive values.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 1; i < samples; i += 1) {
        curve[i] = curve[i - 1] * 0.12 + curve[i] * 0.88;
      }
    }

    return curve;
  }

  makeSoftClipCurve(amount = 1) {
    const drive = this.clamp(amount, 0.2, 2.5);
    const samples = 2048;
    const curve = new Float32Array(samples);
    const norm = Math.tanh(1 + drive * 1.4);
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * (1 + drive * 1.4)) / norm;
    }
    return curve;
  }

  async loadSampleFileToSlot(voiceIndex, slotIndex, file, options = {}) {
    const arrayBuffer = await file.arrayBuffer();
    await this.loadArrayBufferToSlot(voiceIndex, slotIndex, arrayBuffer, file.name, file.type || "audio/wav", options);
  }

  async loadArrayBufferToSlot(voiceIndex, slotIndex, arrayBuffer, name, type, options = {}) {
    const { silent = false, skipRender = false, dataBase64 = null, path = null } = options;

    const wavMeta = this.parseWavMetadata(arrayBuffer);
    const validation = this.validateWavMetadata(wavMeta);
    if (!validation.ok) {
      throw new Error(`Invalid WAV for ${VOICES[voiceIndex].letter}${slotIndex}: ${validation.issues.join("; ")}`);
    }
    let decoded = null;
    if (this.audioCtx) {
      decoded = await this.audioCtx.decodeAudioData(arrayBuffer.slice(0));
    }

    this.sampleBanks[voiceIndex][slotIndex] = {
      voice: VOICES[voiceIndex].letter,
      slot: slotIndex,
      name,
      type,
      wavMeta,
      buffer: decoded,
      arrayBuffer: arrayBuffer.slice(0),
      dataBase64,
      path,
      decodePromise: null,
      decodeFailed: false,
      pathDecodeFailed: false
    };

    this.updateSampleReadyLed();
    if (!skipRender) {
      this.renderVoiceManager();
    }

    if (!silent) {
      this.setStatus(`Loaded ${name} into ${VOICES[voiceIndex].letter}${String(slotIndex).padStart(2, "0")}.`, "ok");
    }
  }

  clearVoiceSlot(voiceIndex, slotIndex) {
    this.sampleBanks[voiceIndex][slotIndex] = null;
    this.updateSampleReadyLed();
    this.renderVoiceManager();
  }

  async auditionSelectedSlot() {
    const voiceIndex = this.activeVoiceIndex;
    const slotIndex = this.selectedSlotIndex;
    const sample = this.sampleBanks[voiceIndex][slotIndex];

    await this.ensureAudioReady();
    await this.decodeAllSampleBuffers();

    if (sample && sample.buffer) {
      this.playSampleBuffer(voiceIndex, sample.buffer, this.trackLevels[voiceIndex], this.audioCtx.currentTime + 0.01);
      this.setStatus(`Auditioned ${VOICES[voiceIndex].letter}${String(slotIndex).padStart(2, "0")}.`, "ok");
      return;
    }

    if (sample && sample.path) {
      this.playHtmlAudioSample(voiceIndex, sample.path, this.trackLevels[voiceIndex]);
      this.setStatus(`Auditioned ${VOICES[voiceIndex].letter}${String(slotIndex).padStart(2, "0")}.`, "ok");
      return;
    }

    this.playInternalVoice(voiceIndex, this.trackLevels[voiceIndex], this.audioCtx.currentTime + 0.01);
    this.setStatus(`No sample in ${VOICES[voiceIndex].letter}${String(slotIndex).padStart(2, "0")}; played internal voice.`, "warn");
  }

  async decodeAllSampleBuffers() {
    if (!this.audioCtx) {
      return;
    }

    const tasks = [];
    for (const bank of this.sampleBanks) {
      for (const entry of bank) {
        if (!entry || entry.buffer || !entry.arrayBuffer) {
          continue;
        }
        tasks.push(this.decodeSampleEntry(entry));
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  async decodeSampleEntry(entry) {
    if (!this.audioCtx || !entry || entry.buffer || !entry.arrayBuffer) {
      return Boolean(entry?.buffer);
    }
    if (entry.decodeFailed) {
      return false;
    }
    try {
      entry.buffer = await this.audioCtx.decodeAudioData(entry.arrayBuffer.slice(0));
      entry.decodeFailed = false;
      return true;
    } catch (_error) {
      const fallback = this.decodePcm16WavToAudioBuffer(entry.arrayBuffer);
      if (fallback) {
        entry.buffer = fallback;
        entry.decodeFailed = false;
        return true;
      }
      entry.buffer = null;
      entry.decodeFailed = true;
      return false;
    }
  }

  decodePcm16WavToAudioBuffer(arrayBuffer) {
    if (!this.audioCtx || !arrayBuffer) {
      return null;
    }
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 44) {
      return null;
    }

    const riff = this.readAscii(view, 0, 4);
    const wave = this.readAscii(view, 8, 4);
    if (riff !== "RIFF" || wave !== "WAVE") {
      return null;
    }

    let offset = 12;
    let fmt = null;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset + 8 <= view.byteLength) {
      const chunkId = this.readAscii(view, offset, 4);
      const size = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;

      if (chunkId === "fmt " && size >= 16 && dataStart + 16 <= view.byteLength) {
        fmt = {
          audioFormat: view.getUint16(dataStart, true),
          channels: view.getUint16(dataStart + 2, true),
          sampleRate: view.getUint32(dataStart + 4, true),
          bitsPerSample: view.getUint16(dataStart + 14, true)
        };
      } else if (chunkId === "data" && dataStart + size <= view.byteLength) {
        dataOffset = dataStart;
        dataSize = size;
      }

      offset = dataStart + size + (size % 2);
      if (offset > view.byteLength) {
        break;
      }
    }

    if (!fmt || dataOffset < 0) {
      return null;
    }
    if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16 || fmt.channels < 1) {
      return null;
    }

    const channels = fmt.channels;
    const frameSize = channels * 2;
    const frameCount = Math.floor(dataSize / frameSize);
    if (frameCount <= 0) {
      return null;
    }

    const audioBuffer = this.audioCtx.createBuffer(channels, frameCount, fmt.sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let frame = 0; frame < frameCount; frame += 1) {
        const sampleIndex = dataOffset + frame * frameSize + channel * 2;
        if (sampleIndex + 1 >= view.byteLength) {
          channelData[frame] = 0;
          continue;
        }
        channelData[frame] = view.getInt16(sampleIndex, true) / 32768;
      }
    }
    return audioBuffer;
  }

  async autoloadGeekyFactoryPack() {
    const basePath = "factory/GeekyPunks_sample_kit";
    let loaded = 0;
    let failed = 0;

    for (let voiceIndex = 0; voiceIndex < VOICES.length; voiceIndex += 1) {
      for (let slotIndex = 0; slotIndex < 10; slotIndex += 1) {
        const path = `${basePath}/${VOICES[voiceIndex].letter}/${slotIndex}.wav`;
        try {
          const response = await fetch(path);
          if (!response.ok) {
            throw new Error("missing file");
          }
          const arrayBuffer = await response.arrayBuffer();
          await this.loadArrayBufferToSlot(voiceIndex, slotIndex, arrayBuffer, `${slotIndex}.wav`, "audio/wav", {
            silent: true,
            skipRender: true,
            path
          });
          loaded += 1;
        } catch (_error) {
          // Fallback for strict local-file environments where fetch/decode is blocked:
          // keep a direct path sample so slot selection still changes playback.
          this.sampleBanks[voiceIndex][slotIndex] = {
            voice: VOICES[voiceIndex].letter,
            slot: slotIndex,
            name: `${slotIndex}.wav`,
            type: "audio/wav",
            wavMeta: { ok: true, sampleRate: 48000, bitsPerSample: 16, channels: 1, audioFormat: 1 },
            buffer: null,
            arrayBuffer: null,
            dataBase64: null,
            path,
            decodePromise: null,
            decodeFailed: false,
            pathDecodeFailed: false
          };
          loaded += 1;
          failed += 1;
        }
      }
    }

    this.activeVoiceIndex = 0;
    this.selectedTrackIndex = 0;
    this.selectedSlotIndex = 0;
    this.normalizeVoiceSlotsToLoadedSamples();
    this.updateSampleReadyLed();
    this.renderVoiceManager();
    this.syncDataKnobToCurrentMode();

    if (loaded > 0) {
      this.setStatus(
        failed > 0
          ? `Loaded ${loaded} GeekyPunks samples from provided pack (${failed} not found).`
          : `Loaded ${loaded} GeekyPunks samples from provided pack.`,
        failed > 0 ? "warn" : "ok"
      );
    } else {
      this.setStatus("Could not autoload provided samples. Use Import A-G Folder to load your updated pack.", "warn");
    }
  }

  async importPackFolder(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    this.setStatus(`Importing ${files.length} files...`);

    const parseIssues = [];
    const mapped = new Map();

    for (const file of files) {
      const relativePath = (file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
      const parts = relativePath.split("/").filter(Boolean);

      if (parts.length < 2) {
        continue;
      }

      const folder = parts[parts.length - 2].toUpperCase();
      const filename = parts[parts.length - 1];
      const lowerName = filename.toLowerCase();

      if (filename.startsWith(".")) {
        continue;
      }

      if (folder === "H") {
        parseIssues.push(`${relativePath} skipped (H is reserved for live-recorded samples).`);
        continue;
      }

      const voiceIndex = VOICES.findIndex((voice) => voice.letter === folder);
      if (voiceIndex === -1) {
        parseIssues.push(`${relativePath} skipped (unknown folder, expected A-G).`);
        continue;
      }

      if (!lowerName.endsWith(".wav")) {
        parseIssues.push(`${relativePath} skipped (must be .wav).`);
        continue;
      }

      const stem = filename.replace(/\.[^.]+$/, "");
      if (!/^\d+$/.test(stem)) {
        parseIssues.push(`${relativePath} skipped (filename must be numeric).`);
        continue;
      }

      const slotIndex = Number(stem);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS_PER_VOICE) {
        parseIssues.push(`${relativePath} skipped (slot must be 0..63).`);
        continue;
      }

      const key = `${voiceIndex}:${slotIndex}`;
      mapped.set(key, { voiceIndex, slotIndex, file, relativePath });
    }

    let loaded = 0;
    const loadIssues = [];

    for (const item of mapped.values()) {
      try {
        await this.loadSampleFileToSlot(item.voiceIndex, item.slotIndex, item.file, { silent: true, skipRender: true });
        loaded += 1;
      } catch (error) {
        loadIssues.push(`${item.relativePath}: ${error.message}`);
      }
    }

    this.renderVoiceManager();
    this.normalizeVoiceSlotsToLoadedSamples();

    const issueSummary = [...parseIssues, ...loadIssues];
    if (loaded > 0 && issueSummary.length === 0) {
      this.setStatus(`Imported ${loaded} samples from A-G pack.`, "ok");
    } else if (loaded > 0) {
      this.setStatus(`Imported ${loaded} samples with ${issueSummary.length} issue(s).`, "warn");
    } else {
      this.setStatus(`Import failed. ${issueSummary.length || 1} issue(s) found.`, "warn");
    }

    this.validatePackSpec({ silentOnSuccess: true });
  }

  validatePackSpec(options = {}) {
    const { silentOnSuccess = false } = options;
    const issues = [];

    VOICES.forEach((voice, voiceIndex) => {
      const bank = this.sampleBanks[voiceIndex];
      const geekyCount = bank.slice(0, GEEKY_TARGET_PER_VOICE).filter(Boolean).length;
      const factoryCount = bank.slice(0, FACTORY_SLOT_COUNT).filter(Boolean).length;

      if (geekyCount < GEEKY_TARGET_PER_VOICE) {
        issues.push(
          `${voice.letter}: slots 0-9 have ${geekyCount}/${GEEKY_TARGET_PER_VOICE} (need ${GEEKY_TARGET_PER_VOICE}).`
        );
      }

      bank.forEach((entry, slotIndex) => {
        if (!entry) {
          return;
        }

        const stem = entry.name.replace(/\.[^.]+$/, "");
        if (!/^\d+$/.test(stem)) {
          issues.push(`${voice.letter}${slotIndex}: filename "${entry.name}" is not numeric.`);
        }

        const wavValidation = this.validateWavMetadata(entry.wavMeta);
        if (!wavValidation.ok) {
          issues.push(`${voice.letter}${slotIndex}: ${wavValidation.issues.join("; ")}.`);
        }
      });

      if (factoryCount > FACTORY_SLOT_COUNT) {
        issues.push(`${voice.letter}: factory slots exceed ${FACTORY_SLOT_COUNT}.`);
      }
    });

    if (issues.length === 0) {
      if (!silentOnSuccess) {
        this.setStatus(
          "Pack validation OK: A-G folders comply with mono WAV / 48kHz / 16-bit and slots 0-9 are filled per voice.",
          "ok"
        );
      }
      return { ok: true, issues: [] };
    }

    this.setStatus(`Validation issues (${issues.length}): ${issues.slice(0, 3).join(" | ")}`, "warn");
    return { ok: false, issues };
  }

  parseWavMetadata(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 44) {
      return { ok: false, reason: "file too short" };
    }

    const riff = this.readAscii(view, 0, 4);
    const wave = this.readAscii(view, 8, 4);
    if (riff !== "RIFF" || wave !== "WAVE") {
      return { ok: false, reason: "not a RIFF/WAVE file" };
    }

    let offset = 12;
    let fmt = null;

    while (offset + 8 <= view.byteLength) {
      const chunkId = this.readAscii(view, offset, 4);
      const size = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;

      if (chunkId === "fmt " && size >= 16 && dataStart + 16 <= view.byteLength) {
        fmt = {
          audioFormat: view.getUint16(dataStart, true),
          channels: view.getUint16(dataStart + 2, true),
          sampleRate: view.getUint32(dataStart + 4, true),
          bitsPerSample: view.getUint16(dataStart + 14, true)
        };
        break;
      }

      offset = dataStart + size + (size % 2);
    }

    if (!fmt) {
      return { ok: false, reason: "missing fmt chunk" };
    }

    return { ok: true, ...fmt };
  }

  validateWavMetadata(wavMeta) {
    const issues = [];

    if (!wavMeta || !wavMeta.ok) {
      issues.push(wavMeta?.reason || "invalid WAV header");
      return { ok: false, issues };
    }

    if (!(wavMeta.audioFormat === 1 || wavMeta.audioFormat === 65534)) {
      issues.push(`unsupported WAV format ${wavMeta.audioFormat}`);
    }
    if (wavMeta.channels !== 1) {
      issues.push(`channels ${wavMeta.channels} (must be mono)`);
    }
    if (wavMeta.sampleRate !== 48000) {
      issues.push(`sample rate ${wavMeta.sampleRate}Hz (must be 48000Hz)`);
    }
    if (wavMeta.bitsPerSample !== 16) {
      issues.push(`bit depth ${wavMeta.bitsPerSample} (must be 16-bit)`);
    }

    return { ok: issues.length === 0, issues };
  }

  readAscii(view, start, length) {
    let output = "";
    for (let i = 0; i < length; i += 1) {
      output += String.fromCharCode(view.getUint8(start + i));
    }
    return output;
  }

  updateSampleReadyLed() {
    const hasSample = this.sampleBanks.some((voiceBank) => voiceBank.some(Boolean));
    this.sampleReadyLed.classList.toggle("ready", hasSample);
  }

  async saveKitAsJson() {
    try {
      const sampleBanks = [];

      for (let voiceIndex = 0; voiceIndex < VOICES.length; voiceIndex += 1) {
        for (let slotIndex = 0; slotIndex < SLOTS_PER_VOICE; slotIndex += 1) {
          const entry = this.sampleBanks[voiceIndex][slotIndex];
          if (!entry) {
            continue;
          }

          let dataBase64 = entry.dataBase64 || null;
          if (!dataBase64 && entry.arrayBuffer) {
            dataBase64 = this.arrayBufferToBase64(entry.arrayBuffer);
          }

          if (!dataBase64) {
            continue;
          }

          sampleBanks.push({
            voice: VOICES[voiceIndex].letter,
            slot: slotIndex,
            name: entry.name,
            type: entry.type || "audio/wav",
            data: dataBase64
          });
        }
      }

      const kit = {
        format: "bullfrog-drums-web-kit-v2",
        exportedAt: new Date().toISOString(),
        controls: { ...this.controls },
        voiceControls: this.voiceControls.map((tone) => ({ ...tone })),
        trackLevels: [...this.trackLevels],
        pattern: this.pattern.map((row) => [...row]),
        voiceActiveSlots: [...this.voiceActiveSlots],
        sampleBanks
      };

      const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bullfrog-drums-kit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.setStatus("Kit exported as JSON.", "ok");
    } catch (error) {
      this.setStatus("Failed to save kit JSON.", "warn");
    }
  }

  async loadKitFromJson(file) {
    try {
      const text = await file.text();
      const kit = JSON.parse(text);
      if (!kit || !Array.isArray(kit.pattern)) {
        throw new Error("Invalid kit file");
      }

      await this.ensureAudioReady();
      this.stopTransport();

      if (kit.controls && typeof kit.controls === "object") {
        if (Object.prototype.hasOwnProperty.call(kit.controls, "tempo")) {
          this.setKnobValue("tempo", Number(kit.controls.tempo), {
            silent: true,
            bypassDataMode: true
          });
        }
        if (Object.prototype.hasOwnProperty.call(kit.controls, "volume")) {
          this.setKnobValue("volume", Number(kit.controls.volume), { silent: true });
        }
      }

      if (Array.isArray(kit.voiceControls)) {
        kit.voiceControls.forEach((trackTone, trackIndex) => {
          if (!trackTone || trackIndex < 0 || trackIndex >= TRACKS.length) {
            return;
          }
          CONTROL_DEFS.forEach((def) => {
            const value = Number(trackTone[def.id]);
            if (!Number.isFinite(value)) {
              return;
            }
            const snapped = this.snap(this.clamp(value, def.min, def.max), def.step);
            this.voiceControls[trackIndex][def.id] = snapped;
          });
        });
      } else if (kit.controls && typeof kit.controls === "object") {
        CONTROL_DEFS.forEach((def) => {
          const value = Number(kit.controls[def.id]);
          if (!Number.isFinite(value)) {
            return;
          }
          const snapped = this.snap(this.clamp(value, def.min, def.max), def.step);
          for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
            this.voiceControls[trackIndex][def.id] = snapped;
          }
        });
      }

      if (Array.isArray(kit.trackLevels)) {
        kit.trackLevels.forEach((value, trackIndex) => {
          if (trackIndex < TRACKS.length) {
            this.setKnobValue(`level-${trackIndex}`, Number(value), { silent: true });
          }
        });
      }

      this.pattern = TRACKS.map((_, trackIndex) => {
        const srcRow = Array.isArray(kit.pattern[trackIndex]) ? kit.pattern[trackIndex] : [];
        return Array.from({ length: SEQ_STEPS }, (_, step) => Boolean(srcRow[step]));
      });
      this.stepAutomation = Array.from({ length: SEQ_STEPS }, () => ({}));
      this.renderAllSteps();

      this.sampleBanks = Array.from({ length: TRACKS.length }, () => Array.from({ length: SLOTS_PER_VOICE }, () => null));

      const samplesToLoad = [];
      if (Array.isArray(kit.sampleBanks)) {
        samplesToLoad.push(...kit.sampleBanks);
      } else if (Array.isArray(kit.samples)) {
        // Legacy format (per-track sample) fallback.
        kit.samples.forEach((sample) => {
          samplesToLoad.push({
            voice: VOICES[Number(sample.track)]?.letter,
            slot: 0,
            name: sample.name,
            type: sample.type,
            data: sample.data
          });
        });
      }

      for (const sample of samplesToLoad) {
        const voiceIndex = typeof sample.voice === "string" ? VOICES.findIndex((voice) => voice.letter === sample.voice) : -1;
        const slotIndex = Number(sample.slot);
        if (voiceIndex < 0 || voiceIndex >= TRACKS.length || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS_PER_VOICE) {
          continue;
        }

        if (typeof sample.data !== "string") {
          continue;
        }

        try {
          const buffer = this.base64ToArrayBuffer(sample.data);
          await this.loadArrayBufferToSlot(
            voiceIndex,
            slotIndex,
            buffer,
            sample.name || `${slotIndex}.wav`,
            sample.type || "audio/wav",
            { silent: true, skipRender: true, dataBase64: sample.data }
          );
        } catch (_error) {
          // Keep loading remaining samples.
        }
      }

      if (Array.isArray(kit.voiceActiveSlots)) {
        kit.voiceActiveSlots.forEach((slot, voiceIndex) => {
          const value = this.normalizePlaybackSlot(slot);
          if (voiceIndex < TRACKS.length) {
            this.voiceActiveSlots[voiceIndex] = value;
          }
        });
      } else if (Array.isArray(kit.samples)) {
        this.voiceActiveSlots = this.voiceActiveSlots.map(() => 0);
      }

      this.activeVoiceIndex = 0;
      this.selectedTrackIndex = 0;
      this.selectedSlotIndex = this.voiceActiveSlots[0] || 0;
      this.normalizeVoiceSlotsToLoadedSamples();

      this.updateSampleReadyLed();
      this.syncToneControlsForSelectedTrack();
      this.setSelectedTrack(0, { syncVoice: true });
      this.renderVoiceManager();
      this.applyControlState();
      this.setStatus("Kit loaded from JSON.", "ok");
    } catch (_error) {
      this.setStatus("Invalid or unsupported kit JSON file.", "warn");
    }
  }

  setStatus(message, type = "") {
    this.statusLine.textContent = message;
    this.statusLine.classList.remove("ok", "warn");
    if (type) {
      this.statusLine.classList.add(type);
    }
  }

  formatValue(id, value) {
    if (id.startsWith("level-") || id === "volume" || id === "drive" || id === "loopPoint") {
      return `${Math.round(value * 100)}%`;
    }
    if (id === "tempo") {
      if (this.dataMode === "track") {
        return `Track ${Math.round(value) + 1}`;
      }
      if (this.dataMode === "sample") {
        return `S${String(Math.round(value)).padStart(2, "0")}`;
      }
      if (this.dataMode === "kit") {
        return `K${String(Math.round(value)).padStart(2, "0")}`;
      }
      if (this.dataMode === "lastStep") {
        return `${Math.round(value)} stp`;
      }
      if (this.dataMode === "start") {
        return `S${Math.round(value)}`;
      }
      if (this.dataMode === "end") {
        return `E${Math.round(value)}`;
      }
      if (this.dataMode === "pattern") {
        return `P${Math.round(value)}`;
      }
      if (this.dataMode === "odds") {
        return `${Math.round(value)}%`;
      }
      if (this.dataMode === "ratchet") {
        return `x${Math.round(value)}`;
      }
      if (this.dataMode === "accent") {
        return `${Math.round(value)}%`;
      }
      if (this.dataMode === "loop") {
        return Math.round(value) >= 1 ? "ON" : "OFF";
      }
      return `${Math.round(value)} bpm`;
    }
    if (id === "pitch") {
      return `${value >= 0 ? "+" : ""}${value.toFixed(1)} st`;
    }
    if (id === "cutoff") {
      return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
    }
    if (id === "resonance") {
      return value.toFixed(1);
    }
    if (id === "pan") {
      return `${value.toFixed(2)}`;
    }
    if (id === "decay") {
      return `${value.toFixed(2)} s`;
    }
    return String(value);
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  snap(value, step) {
    if (!step || step <= 0) {
      return value;
    }
    return Math.round(value / step) * step;
  }

  arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new BullfrogDrums();
});
