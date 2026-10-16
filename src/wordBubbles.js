// Kids' Dream-Builder Pop-Up Word & Spelling Bubbles + Speech-to-Text & Viseme Lip-Sync Engine
// Pure safe DOM construction + Web Speech API (TTS & STT) + Web Audio API procedural chimes & phoneme viseme sequencer

export const WORD_CATEGORIES = {
  starter: {
    label: 'Starter (3–4 Letters)',
    words: [
      { word: 'STAR', icon: '⭐', hint: 'A bright light shining in the night sky!' },
      { word: 'WISH', icon: '🌠', hint: 'A special hope you make in your heart!' },
      { word: 'MOON', icon: '🌙', hint: 'Our glowing nighttime friend in the sky!' },
      { word: 'KIND', icon: '💖', hint: 'Helping and caring for others with a warm heart!' },
      { word: 'GLOW', icon: '✨', hint: 'To shine softly with warm, magical light!' },
      { word: 'COZY', icon: '🧸', hint: 'Warm, snuggly, and safe—like a big hug!' },
      { word: 'PLAY', icon: '🎈', hint: 'Having fun, exploring, and laughing together!' },
      { word: 'HOPE', icon: '🌱', hint: 'Believing that wonderful things can happen!' }
    ]
  },
  dreamer: {
    label: 'Dream Builder (5–6 Letters)',
    words: [
      { word: 'DREAM', icon: '☁️', hint: 'A big, magical idea you build in your mind!' },
      { word: 'MAGIC', icon: '🪄', hint: 'Something wonderful and full of surprise!' },
      { word: 'CLOUD', icon: '⛅', hint: 'A fluffy puff floating high in the cozy sky!' },
      { word: 'SMILE', icon: '😊', hint: 'A happy curve on your face that shares joy!' },
      { word: 'HAPPY', icon: '☀️', hint: 'Feeling bright, cheerful, and full of sunshine!' },
      { word: 'CREATE', icon: '🎨', hint: 'Making something brand new with your imagination!' },
      { word: 'FRIEND', icon: '🤝', hint: 'Someone who plays, listens, and cares about you!' },
      { word: 'WONDER', icon: '🔮', hint: 'Feeling curious and amazed by the world!' }
    ]
  },
  explorer: {
    label: 'Big Dreamer (7+ Letters)',
    words: [
      { word: 'RAINBOW', icon: '🌈', hint: 'Colorful arches painted across the sky!' },
      { word: 'IMAGINE', icon: '🚀', hint: 'Picturing amazing new worlds inside your mind!' },
      { word: 'SPARKLE', icon: '💎', hint: 'Shining with tiny, dancing flashes of light!' },
      { word: 'BELIEVE', icon: '🌟', hint: 'Trusting in yourself and your biggest dreams!' },
      { word: 'SUNSHINE', icon: '🌻', hint: 'Warm golden light that helps everything grow!' },
      { word: 'ADVENTURE', icon: '🧭', hint: 'An exciting journey to discover something new!' }
    ]
  }
};

import { VISEME_PRESETS } from './blobCreature.js';

// Map letters or phoneme codes to 8-channel facial morph target parameters + legacy (open, width, smile)
export function getVisemeForChar(ch) {
  const c = (ch || '').toUpperCase();
  let phoneme = 'SIL';
  switch (c) {
    case 'A':
      phoneme = 'AA';
      break;
    case 'E':
      phoneme = 'EE';
      break;
    case 'I':
    case 'Y':
      phoneme = 'IH';
      break;
    case 'O':
      phoneme = 'OH';
      break;
    case 'U':
      phoneme = 'OO';
      break;
    case 'W':
    case 'Q':
    case 'R':
      phoneme = 'WQ';
      break;
    case 'M':
    case 'B':
    case 'P':
      phoneme = 'BMP';
      break;
    case 'F':
    case 'V':
      phoneme = 'FV';
      break;
    case 'L':
    case 'N':
    case 'D':
    case 'T':
      phoneme = 'L_TH';
      break;
    case 'J':
      phoneme = 'SH_CH';
      break;
    case 'S':
    case 'Z':
    case 'C':
    case 'K':
    case 'G':
    case 'X':
      phoneme = 'KG';
      break;
    case 'H':
      phoneme = 'AA';
      break;
    default:
      if (VISEME_PRESETS[c]) {
        phoneme = c;
      } else if (/[A-Z]/.test(c)) {
        phoneme = 'IH';
      } else {
        phoneme = 'SIL';
      }
      break;
  }

  const p = VISEME_PRESETS[phoneme] || VISEME_PRESETS.SIL;
  return {
    phoneme: p.id,
    label: p.label,
    ipa: p.ipa,
    open: p.jawOpen,
    width: 1.0 + p.mouthWide * 0.35 - p.lipRound * 0.32,
    smile: Math.max(0.25, p.mouthWide),
    weights: {
      jawOpen: p.jawOpen,
      mouthWide: p.mouthWide,
      lipRound: p.lipRound,
      lipPress: p.lipPress,
      cheekPuff: p.cheekPuff,
      lipTuckFV: p.lipTuckFV,
      tongueUp: p.tongueUp,
      browLift: p.browLift
    }
  };
}

/**
 * Digraph-aware English Grapheme-to-Phoneme (G2P) tokenizer for natural coarticulated speech
 */
function tokenizeWordToPhonemes(wordStr) {
  const clean = String(wordStr || '').toUpperCase().replace(/[^A-Z]/g, '');
  const tokens = [];
  let i = 0;
  while (i < clean.length) {
    const pair = clean.slice(i, i + 2);
    if (pair === 'SH' || pair === 'CH' || pair === 'TCH') {
      tokens.push({ phoneme: 'SH_CH', dur: 0.095 });
      i += 2;
    } else if (pair === 'TH') {
      tokens.push({ phoneme: 'L_TH', dur: 0.09 });
      i += 2;
    } else if (pair === 'PH') {
      tokens.push({ phoneme: 'FV', dur: 0.09 });
      i += 2;
    } else if (pair === 'OO' || pair === 'OU' || pair === 'EW') {
      tokens.push({ phoneme: 'OO', dur: 0.125 });
      i += 2;
    } else if (pair === 'EE' || pair === 'EA' || pair === 'EY' || pair === 'AY') {
      tokens.push({ phoneme: 'EE', dur: 0.125 });
      i += 2;
    } else if (pair === 'OA' || pair === 'OW' || pair === 'OI' || pair === 'OY') {
      tokens.push({ phoneme: 'OH', dur: 0.125 });
      i += 2;
    } else if (pair === 'AU' || pair === 'AW' || pair === 'AR') {
      tokens.push({ phoneme: 'AA', dur: 0.125 });
      i += 2;
    } else if (pair === 'WH' || pair === 'QU') {
      tokens.push({ phoneme: 'WQ', dur: 0.095 });
      i += 2;
    } else {
      const ch = clean[i];
      const vis = getVisemeForChar(ch);
      const isVowel = /[AEIOUY]/.test(ch);
      tokens.push({ phoneme: vis.phoneme, dur: isVowel ? 0.11 : 0.075 });
      i += 1;
    }
  }
  return tokens;
}

export function createWordBubbleSystem({ creature, onTriggerBoop, onStateChange }) {
  let audioCtx = null;
  let bubblesEnabled = true;
  let currentCategory = 'dreamer';
  let mascotName = 'Mr. M';
  let starsEarned = 0;
  let soundMuted = false;

  // Speech & Viseme timeline state
  let speechTimeline = [];
  let speechTime = 0;
  let isSpeaking = false;
  let activeWordObj = WORD_CATEGORIES.dreamer.words[0];
  let activeTileElements = [];

  // Microphone / Speech-to-Text state
  let isListening = false;
  let recognition = null;
  let micStream = null;
  let micAnalyser = null;
  let micDataArray = null;

  function ensureAudioCtx() {
    if (soundMuted) return null;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // Gentle procedural Web Audio bubble pop & harp chime (zero external audio dependencies)
  function playBubbleChime(type = 'pop', stepIdx = 0) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'pop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.11);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'letter') {
        const scaleNotes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];
        const freq = scaleNotes[stepIdx % scaleNotes.length];
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.19);
      } else if (type === 'fanfare') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.connect(g);
          g.connect(ctx.destination);
          const t0 = now + idx * 0.08;
          o.frequency.setValueAtTime(n, t0);
          g.gain.setValueAtTime(0.10, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
          o.start(t0);
          o.stop(t0 + 0.27);
        });
      }
    } catch (_e) {
      // Ignore audio errors when autoplay is blocked
    }
  }

  // =========================================================================
  // 1. FLOATING POP-UP WORD BUBBLES OVERLAY
  // =========================================================================
  const bubbleLayer = document.createElement('div');
  bubbleLayer.id = 'dream-bubble-layer';
  bubbleLayer.className = 'dream-bubble-layer';
  bubbleLayer.setAttribute('aria-label', 'Floating Kid Spelling Word Bubbles');
  document.body.appendChild(bubbleLayer);

  // Safe perimeter slots around the 3D mascot so bubbles never cover the mascot's face
  const BUBBLE_SLOTS = [
    { left: '7%', top: '20%' },
    { left: '14%', top: '48%' },
    { left: '8%', top: '71%' },
    { left: '66%', top: '16%' },
    { left: '63%', top: '66%' }
  ];

  let activeBubbles = [];

  function spawnWordBubble(wordItem, slotIdx = null) {
    if (!bubblesEnabled) return;
    const slot = BUBBLE_SLOTS[(slotIdx !== null ? slotIdx : activeBubbles.length) % BUBBLE_SLOTS.length];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'floating-word-bubble';
    btn.style.left = slot.left;
    btn.style.top = slot.top;
    btn.style.animationDelay = `${(Math.random() * 1.5).toFixed(2)}s`;
    btn.setAttribute('aria-label', `Pop bubble to spell ${wordItem.word}`);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'bubble-word-icon';
    iconSpan.textContent = wordItem.icon || '✨';

    const wordSpan = document.createElement('span');
    wordSpan.className = 'bubble-word-text';
    wordSpan.textContent = wordItem.word;

    const spellSub = document.createElement('span');
    spellSub.className = 'bubble-word-letters';
    spellSub.textContent = wordItem.word.split('').join(' · ');

    btn.appendChild(iconSpan);
    btn.appendChild(wordSpan);
    btn.appendChild(spellSub);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.classList.add('bubble-popping');
      playBubbleChime('pop');
      starsEarned++;
      updateStarCounterUI();
      if (typeof onTriggerBoop === 'function') {
        onTriggerBoop();
      }
      setTimeout(() => {
        if (btn.parentNode) btn.parentNode.removeChild(btn);
        activeBubbles = activeBubbles.filter((b) => b !== btn);
      }, 240);
      openWordStageAndSpell(wordItem);
    });

    bubbleLayer.appendChild(btn);
    activeBubbles.push(btn);
  }

  function populateCategoryBubbles(categoryKey = currentCategory) {
    currentCategory = WORD_CATEGORIES[categoryKey] ? categoryKey : 'dreamer';
    bubbleLayer.replaceChildren();
    activeBubbles = [];
    if (!bubblesEnabled) return;

    const list = WORD_CATEGORIES[currentCategory].words;
    // Pick up to 4 bubbles around the mascot
    for (let i = 0; i < Math.min(4, list.length); i++) {
      spawnWordBubble(list[i], i);
    }
  }

  // =========================================================================
  // 2. ACTIVE WORD SPELLING STAGE CARD (ABOVE MASCOT)
  // =========================================================================
  const stageCard = document.createElement('div');
  stageCard.id = 'spelling-stage-card';
  stageCard.className = 'spelling-stage-card';
  stageCard.setAttribute('aria-live', 'polite');

  const stageHeader = document.createElement('div');
  stageHeader.className = 'spelling-stage-header';

  const stageBadge = document.createElement('span');
  stageBadge.className = 'spelling-stage-badge';
  stageBadge.textContent = '✨ Dream Word Builder';

  const stageStarCount = document.createElement('span');
  stageStarCount.className = 'spelling-star-pill';
  stageStarCount.textContent = '⭐ 0 Stars';

  const stageCloseBtn = document.createElement('button');
  stageCloseBtn.type = 'button';
  stageCloseBtn.className = 'spelling-stage-close';
  stageCloseBtn.textContent = '✕';
  stageCloseBtn.setAttribute('aria-label', 'Close word bubble card');
  stageCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stageCard.classList.remove('visible');
  });

  stageHeader.appendChild(stageBadge);
  stageHeader.appendChild(stageStarCount);
  stageHeader.appendChild(stageCloseBtn);
  stageCard.appendChild(stageHeader);

  const tilesRow = document.createElement('div');
  tilesRow.className = 'spelling-tiles-row';
  stageCard.appendChild(tilesRow);

  const stageHintText = document.createElement('div');
  stageHintText.className = 'spelling-hint-text';
  stageCard.appendChild(stageHintText);

  const stageActions = document.createElement('div');
  stageActions.className = 'spelling-stage-actions';

  const spellAgainBtn = document.createElement('button');
  spellAgainBtn.type = 'button';
  spellAgainBtn.className = 'spelling-action-btn primary';
  spellAgainBtn.textContent = '🔊 Spell & Say Word';
  spellAgainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeWordObj) {
      openWordStageAndSpell(activeWordObj);
    }
  });

  const nextWordBtn = document.createElement('button');
  nextWordBtn.type = 'button';
  nextWordBtn.className = 'spelling-action-btn';
  nextWordBtn.textContent = '🫧 Next Dream Word';
  nextWordBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const list = WORD_CATEGORIES[currentCategory].words;
    const curIdx = list.findIndex((w) => w.word === (activeWordObj && activeWordObj.word));
    const nextItem = list[(curIdx + 1) % list.length];
    starsEarned++;
    updateStarCounterUI();
    openWordStageAndSpell(nextItem);
    if (activeBubbles.length < 3) {
      populateCategoryBubbles(currentCategory);
    }
  });

  stageActions.appendChild(spellAgainBtn);
  stageActions.appendChild(nextWordBtn);
  stageCard.appendChild(stageActions);
  document.body.appendChild(stageCard);

  function updateStarCounterUI() {
    stageStarCount.textContent = `⭐ ${starsEarned} ${starsEarned === 1 ? 'Star' : 'Stars'}`;
    if (typeof onStateChange === 'function') {
      onStateChange({ starsEarned, activeWord: activeWordObj });
    }
  }

  function renderWordTiles(wordItem) {
    activeWordObj = wordItem;
    tilesRow.replaceChildren();
    activeTileElements = [];

    const iconEl = document.createElement('span');
    iconEl.className = 'spelling-stage-icon';
    iconEl.textContent = wordItem.icon || '🌟';
    tilesRow.appendChild(iconEl);

    const letters = String(wordItem.word || 'DREAM').toUpperCase().split('');
    letters.forEach((ltr, idx) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'spelling-letter-tile';
      tile.textContent = ltr;
      tile.setAttribute('aria-label', `Letter ${ltr}`);
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        highlightSingleLetter(idx, ltr);
      });
      tilesRow.appendChild(tile);
      activeTileElements.push(tile);
    });

    stageHintText.textContent = wordItem.hint || `Great job spelling ${wordItem.word}!`;
    stageBadge.textContent = `${mascotName} Spells: ${wordItem.word}`;
  }

  function highlightSingleLetter(idx, ltr) {
    activeTileElements.forEach((el, i) => {
      el.classList.toggle('speaking-active', i === idx);
    });
    playBubbleChime('letter', idx);
    const vis = getVisemeForChar(ltr);
    creature.setSpeechState({
      talking: true,
      mouthOpen: vis.open,
      mouthWidth: vis.width,
      smile: vis.smile,
      phoneme: vis.phoneme,
      visemeWeights: vis.weights,
      wave: true
    });
    speakBrowserText(ltr.toLowerCase(), 1.28, 1.0);
    setTimeout(() => {
      if (!isSpeaking) {
        creature.setSpeechState({ talking: false, mouthOpen: 0, mouthWidth: 1.0, smile: 0.35 });
        activeTileElements.forEach((el) => el.classList.remove('speaking-active'));
      }
    }, 420);
  }

  // =========================================================================
  // 3. SPEECH SYNTHESIS + TIMED VISEME SEQUENCER FOR FACE MORPHING & WAVING
  // =========================================================================
  function speakBrowserText(text, pitch = 1.25, rate = 0.96) {
    if (soundMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.pitch = pitch;
      utter.rate = rate;
      utter.volume = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const friendlyVoice = voices.find(
        (v) => /en/i.test(v.lang) && /(google|samantha|victoria|zira|natural|female|child)/i.test(v.name)
      ) || voices.find((v) => /en/i.test(v.lang));
      if (friendlyVoice) {
        utter.voice = friendlyVoice;
      }
      window.speechSynthesis.speak(utter);
    } catch (_e) {
      // Ignore synthesis errors
    }
  }

  // Spoken letter names so spelling 'M', 'F', 'W', 'O' articulates realistic multi-phoneme letter names
  const LETTER_SPOKEN_PHONEMES = {
    A: ['EE'],
    B: ['BMP', 'EE'],
    C: ['KG', 'EE'],
    D: ['L_TH', 'EE'],
    E: ['EE'],
    F: ['IH', 'FV'],
    G: ['SH_CH', 'EE'],
    H: ['EE', 'SH_CH'],
    I: ['AA', 'EE'],
    J: ['SH_CH', 'EE'],
    K: ['KG', 'EE'],
    L: ['IH', 'L_TH'],
    M: ['IH', 'BMP'],
    N: ['IH', 'L_TH'],
    O: ['OH', 'OO'],
    P: ['BMP', 'EE'],
    Q: ['KG', 'OO'],
    R: ['AA', 'WQ'],
    S: ['IH', 'KG'],
    T: ['L_TH', 'EE'],
    U: ['EE', 'OO'],
    V: ['FV', 'EE'],
    W: ['L_TH', 'BMP', 'OO'],
    X: ['IH', 'KG'],
    Y: ['WQ', 'AA', 'EE'],
    Z: ['KG', 'EE']
  };

  function buildSpellingVisemeTimeline(wordItem) {
    const timeline = [];
    let t = 0.0;
    const letters = String(wordItem.word || 'DREAM').toUpperCase().split('');

    // Step 1: Letter-by-letter spelling with multi-phoneme letter articulation & tile highlights
    letters.forEach((ltr, idx) => {
      const seq = LETTER_SPOKEN_PHONEMES[ltr] || [getVisemeForChar(ltr).phoneme];
      const subDur = 0.36 / seq.length;
      seq.forEach((phKey, subIdx) => {
        const vis = getVisemeForChar(phKey);
        timeline.push({
          start: t,
          end: t + subDur,
          phoneme: vis.phoneme,
          weights: vis.weights,
          open: vis.open,
          width: vis.width,
          smile: vis.smile,
          letterIndex: idx,
          chimeIndex: subIdx === 0 ? idx : undefined,
          firedChime: false
        });
        t += subDur;
      });

      const sil = getVisemeForChar('SIL');
      timeline.push({
        start: t,
        end: t + 0.14,
        phoneme: 'SIL',
        weights: sil.weights,
        open: 0.04,
        width: 1.05,
        smile: 0.45,
        letterIndex: idx
      });
      t += 0.14;
    });

    // Step 2: Enthusiastic whole-word pronunciation + hint sentence using digraph-aware G2P
    const mainWordTokens = tokenizeWordToPhonemes(wordItem.word);
    mainWordTokens.forEach((tok) => {
      const vis = getVisemeForChar(tok.phoneme);
      timeline.push({
        start: t,
        end: t + tok.dur * 1.15,
        phoneme: vis.phoneme,
        weights: vis.weights,
        open: vis.open,
        width: vis.width,
        smile: vis.smile,
        letterIndex: -2 // -2 = highlight all tiles!
      });
      t += tok.dur * 1.15;
    });

    // Short pause after word
    t += 0.16;

    const hintWords = String(wordItem.hint || '').split(/\s+/).filter(Boolean);
    hintWords.forEach((w) => {
      const wTokens = tokenizeWordToPhonemes(w);
      wTokens.forEach((tok) => {
        const vis = getVisemeForChar(tok.phoneme);
        timeline.push({
          start: t,
          end: t + tok.dur * 0.85,
          phoneme: vis.phoneme,
          weights: vis.weights,
          open: vis.open,
          width: vis.width,
          smile: vis.smile,
          letterIndex: -1
        });
        t += tok.dur * 0.85;
      });
      // Inter-word micro-closure
      const sil = getVisemeForChar('SIL');
      timeline.push({
        start: t,
        end: t + 0.055,
        phoneme: 'SIL',
        weights: sil.weights,
        open: 0.04,
        width: 1.0,
        smile: 0.35,
        letterIndex: -1
      });
      t += 0.055;
    });

    return timeline;
  }

  function buildPhraseVisemeTimeline(text) {
    const timeline = [];
    let t = 0.0;
    const words = String(text || 'Hello dreamer!').split(/\s+/).filter(Boolean);
    words.forEach((w) => {
      const wTokens = tokenizeWordToPhonemes(w);
      wTokens.forEach((tok) => {
        const vis = getVisemeForChar(tok.phoneme);
        timeline.push({
          start: t,
          end: t + tok.dur * 0.88,
          phoneme: vis.phoneme,
          weights: vis.weights,
          open: vis.open,
          width: vis.width,
          smile: vis.smile,
          letterIndex: -1
        });
        t += tok.dur * 0.88;
      });
      const sil = getVisemeForChar('SIL');
      timeline.push({
        start: t,
        end: t + 0.06,
        phoneme: 'SIL',
        weights: sil.weights,
        open: 0.04,
        width: 1.0,
        smile: 0.35,
        letterIndex: -1
      });
      t += 0.06;
    });
    return timeline;
  }

  function openWordStageAndSpell(wordItem) {
    if (!wordItem) return;
    renderWordTiles(wordItem);
    stageCard.classList.add('visible');

    creature.triggerWave(3.8);
    speechTimeline = buildSpellingVisemeTimeline(wordItem);
    speechTime = 0.0;
    isSpeaking = true;

    const spelledOut = wordItem.word.split('').join(', ');
    speakBrowserText(`${spelledOut}. ${wordItem.word}! ${wordItem.hint || ''}`, 1.24, 0.94);
  }

  function speakMascotPhrase(phraseText, showInStage = true) {
    if (!phraseText) return;
    if (showInStage) {
      stageBadge.textContent = `💬 ${mascotName} Says:`;
      stageHintText.textContent = phraseText;
      stageCard.classList.add('visible');
    }
    creature.triggerWave(3.0);
    speechTimeline = buildPhraseVisemeTimeline(phraseText);
    speechTime = 0.0;
    isSpeaking = true;
    speakBrowserText(phraseText, 1.24, 0.98);
  }

  // =========================================================================
  // 4. BOTTOM-LEFT KID SPEECH-TO-TEXT & MASCOT COMMUNICATION DOCK
  // =========================================================================
  const commDock = document.createElement('div');
  commDock.id = 'mascot-comm-dock';
  commDock.className = 'mascot-comm-dock';
  commDock.setAttribute('aria-label', 'Talk and Spell with Mascot');

  const commTopRow = document.createElement('div');
  commTopRow.className = 'mascot-comm-top';

  const micBtn = document.createElement('button');
  micBtn.type = 'button';
  micBtn.className = 'mascot-mic-btn';
  micBtn.setAttribute('aria-label', 'Talk to Mascot with Speech-to-Text');
  micBtn.textContent = '🎤 Talk to Me';

  const waveBtn = document.createElement('button');
  waveBtn.type = 'button';
  waveBtn.className = 'mascot-quick-btn';
  waveBtn.textContent = '👋 Wave & Talk';
  waveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playBubbleChime('fanfare');
    creature.triggerWave(3.2);
    creature.triggerBlink(true);
    const greetings = [
      `Hi friend! I am ${mascotName}! Pop a bubble to spell a dream word together!`,
      `Yay! Let's build big dreams today! Tap any floating word bubble!`,
      `Hello super dreamer! Can you spell ${activeWordObj ? activeWordObj.word : 'DREAM'} with me?`
    ];
    const pick = greetings[Math.floor(Math.random() * greetings.length)];
    speakMascotPhrase(pick, true);
  });

  const bubblePartyBtn = document.createElement('button');
  bubblePartyBtn.type = 'button';
  bubblePartyBtn.className = 'mascot-quick-btn';
  bubblePartyBtn.textContent = '🫧 Word Bubbles';
  bubblePartyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    bubblesEnabled = true;
    playBubbleChime('pop');
    populateCategoryBubbles(currentCategory);
    const randomWord = WORD_CATEGORIES[currentCategory].words[
      Math.floor(Math.random() * WORD_CATEGORIES[currentCategory].words.length)
    ];
    openWordStageAndSpell(randomWord);
  });

  commTopRow.appendChild(micBtn);
  commTopRow.appendChild(waveBtn);
  commTopRow.appendChild(bubblePartyBtn);
  commDock.appendChild(commTopRow);

  // Speech-to-Text / Custom Word Input Row so kids can speak OR type any word/dream
  const inputRow = document.createElement('form');
  inputRow.className = 'mascot-input-row';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'mascot-text-input';
  textInput.placeholder = 'Say or type a word to spell (e.g. DREAM)...';
  textInput.maxLength = 60;
  textInput.setAttribute('aria-label', 'Type a word or phrase for the mascot to say and spell');

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'mascot-send-btn';
  sendBtn.textContent = 'Spell It';

  inputRow.appendChild(textInput);
  inputRow.appendChild(sendBtn);
  commDock.appendChild(inputRow);

  const sttStatusText = document.createElement('div');
  sttStatusText.className = 'mascot-stt-status';
  sttStatusText.textContent = 'Tap 🎤 to speak or pop any floating word bubble!';
  commDock.appendChild(sttStatusText);

  document.body.appendChild(commDock);

  function handleUserSpokenOrTypedText(rawText) {
    const cleaned = String(rawText || '').trim();
    if (!cleaned) return;

    const words = cleaned.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 1 && words[0].length >= 2 && words[0].length <= 12) {
      const upper = words[0].toUpperCase();
      // Check if it matches a known word or create a custom Dream Word item
      let matched = null;
      Object.values(WORD_CATEGORIES).forEach((cat) => {
        const f = cat.words.find((w) => w.word === upper);
        if (f) matched = f;
      });
      const customObj = matched || {
        word: upper,
        icon: '🌟',
        hint: `Awesome word! "${upper}" has ${upper.length} letters!`
      };
      spawnWordBubble(customObj);
      starsEarned++;
      updateStarCounterUI();
      playBubbleChime('fanfare');
      openWordStageAndSpell(customObj);
      sttStatusText.textContent = `Heard: "${upper}" — Spelling it together!`;
    } else {
      // Multi-word sentence: extract the longest dream word to spawn a bubble AND respond!
      const longestWord = words.reduce((a, b) => (b.length > a.length ? b : a), 'DREAM').toUpperCase();
      const customObj = {
        word: longestWord.slice(0, 10),
        icon: '💭',
        hint: `From your dream: "${cleaned}"`
      };
      spawnWordBubble(customObj);
      starsEarned++;
      updateStarCounterUI();
      playBubbleChime('fanfare');
      renderWordTiles(customObj);
      stageCard.classList.add('visible');
      speakMascotPhrase(`You said: ${cleaned}! Let's spell ${customObj.word}!`, false);
      sttStatusText.textContent = `You said: "${cleaned}"`;
    }
  }

  inputRow.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const val = textInput.value.trim();
    if (!val) return;
    handleUserSpokenOrTypedText(val);
    textInput.value = '';
  });

  // Live Speech-to-Text (Web Speech API + Mic Audio Volume Lip-Sync)
  async function toggleSpeechToText() {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    isListening = true;
    micBtn.classList.add('listening');
    micBtn.textContent = '🛑 Listening...';
    sttStatusText.textContent = 'Listening to your voice... Say a word or dream!';
    creature.triggerWave(2.0);

    // Optional live microphone amplitude analyzer so mascot's ears/mouth react to user's voice in real time
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
        if (!isListening) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStream = stream;
        const ctx = ensureAudioCtx();
        if (ctx) {
          const src = ctx.createMediaStreamSource(stream);
          micAnalyser = ctx.createAnalyser();
          micAnalyser.fftSize = 256;
          src.connect(micAnalyser);
          micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
        }
      }).catch(() => {});
    }

    if (SpeechRec) {
      try {
        recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
          let interim = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            sttStatusText.textContent = `Hearing: "${interim}..."`;
            const lastChar = interim.trim().slice(-1);
            const vis = getVisemeForChar(lastChar);
            creature.setSpeechState({
              talking: true,
              mouthOpen: vis.open * 0.75,
              mouthWidth: vis.width,
              smile: 0.65,
              wave: true
            });
          }
          if (finalTranscript) {
            stopListening();
            handleUserSpokenOrTypedText(finalTranscript);
          }
        };

        recognition.onerror = () => {
          stopListening();
          // Friendly interactive fallback if mic permission is blocked in sandboxed iframe
          sttStatusText.textContent = 'Mic unavailable in preview — type any word above or tap a bubble!';
          textInput.focus();
        };

        recognition.onend = () => {
          if (isListening) {
            stopListening();
          }
        };

        recognition.start();
      } catch (_err) {
        stopListening();
        textInput.focus();
      }
    } else {
      // Fallback for browsers without SpeechRecognition: demo interactive voice response
      setTimeout(() => {
        if (isListening) {
          stopListening();
          const list = WORD_CATEGORIES[currentCategory].words;
          const pick = list[Math.floor(Math.random() * list.length)];
          handleUserSpokenOrTypedText(pick.word);
        }
      }, 1600);
    }
  }

  function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤 Talk to Me';
    if (recognition) {
      try {
        recognition.stop();
      } catch (_e) {}
      recognition = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    micAnalyser = null;
    if (!isSpeaking) {
      creature.setSpeechState({ talking: false, mouthOpen: 0, mouthWidth: 1.0, smile: 0.35 });
    }
  }

  micBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSpeechToText();
  });

  // Initial floating bubbles on load
  populateCategoryBubbles(currentCategory);

  // =========================================================================
  // 5. PER-FRAME UPDATE (DRIVES 60FPS 8-CHANNEL PHONEME MORPHING & COARTICULATION)
  // =========================================================================
  function update(dt) {
    if (isSpeaking && speechTimeline.length > 0) {
      speechTime += dt;
      const lastSeg = speechTimeline[speechTimeline.length - 1];
      if (speechTime > lastSeg.end) {
        isSpeaking = false;
        speechTimeline = [];
        creature.setSpeechState({ talking: false, mouthOpen: 0.0, mouthWidth: 1.0, smile: 0.35, phoneme: 'SIL' });
        activeTileElements.forEach((el) => el.classList.remove('speaking-active'));
      } else {
        for (let i = 0; i < speechTimeline.length; i++) {
          const seg = speechTimeline[i];
          if (speechTime >= seg.start && speechTime <= seg.end) {
            const segProgress = (speechTime - seg.start) / Math.max(0.01, seg.end - seg.start);
            const syllableEnv = Math.sin(segProgress * Math.PI);

            // Look-ahead coarticulation blend into the next phoneme segment
            const nextSeg = speechTimeline[i + 1];
            const blendNext = nextSeg ? Math.max(0.0, (segProgress - 0.65) / 0.35) * 0.45 : 0.0;

            const w = seg.weights || getVisemeForChar(seg.phoneme || 'IH').weights;
            const nw = (nextSeg && nextSeg.weights) ? nextSeg.weights : w;
            const envScale = 0.72 + 0.28 * syllableEnv;

            const coarticulatedWeights = {
              jawOpen: (w.jawOpen * (1 - blendNext) + nw.jawOpen * blendNext) * envScale,
              mouthWide: (w.mouthWide * (1 - blendNext) + nw.mouthWide * blendNext) * envScale,
              lipRound: (w.lipRound * (1 - blendNext) + nw.lipRound * blendNext) * envScale,
              lipPress: w.lipPress * (1 - blendNext) + nw.lipPress * blendNext,
              cheekPuff: (w.cheekPuff * (1 - blendNext) + nw.cheekPuff * blendNext) * envScale,
              lipTuckFV: w.lipTuckFV * (1 - blendNext) + nw.lipTuckFV * blendNext,
              tongueUp: (w.tongueUp * (1 - blendNext) + nw.tongueUp * blendNext) * envScale,
              browLift: (w.browLift * (1 - blendNext) + nw.browLift * blendNext) * envScale
            };

            creature.setSpeechState({
              talking: true,
              mouthOpen: coarticulatedWeights.jawOpen,
              mouthWidth: seg.width,
              smile: coarticulatedWeights.mouthWide,
              phoneme: seg.phoneme || 'AA',
              visemeWeights: coarticulatedWeights,
              wave: true
            });

            if (seg.chimeIndex !== undefined && !seg.firedChime) {
              seg.firedChime = true;
              playBubbleChime('letter', seg.chimeIndex);
            }

            if (seg.letterIndex >= 0) {
              activeTileElements.forEach((el, idx) => {
                el.classList.toggle('speaking-active', idx === seg.letterIndex);
              });
            } else if (seg.letterIndex === -2) {
              activeTileElements.forEach((el) => el.classList.add('speaking-active'));
            } else {
              activeTileElements.forEach((el) => el.classList.remove('speaking-active'));
            }
            break;
          }
        }
      }
    } else if (isListening && micAnalyser && micDataArray) {
      // Live mic audio formant bands drive 8-channel phoneme morph targets while the user speaks!
      micAnalyser.getByteFrequencyData(micDataArray);
      let lowSum = 0;  // F1 formant band (jaw open / AA / OH)
      let midSum = 0;  // F2 formant band (smile wide / EE / IH)
      let highSum = 0; // Fricative/sibilant band (FV / SH_CH / L_TH)
      for (let i = 2; i < 12; i++) lowSum += micDataArray[i];
      for (let i = 12; i < 28; i++) midSum += micDataArray[i];
      for (let i = 28; i < 52; i++) highSum += micDataArray[i];

      const lowNorm = Math.min(1.0, Math.max(0.0, (lowSum / 10 - 18) / 95));
      const midNorm = Math.min(1.0, Math.max(0.0, (midSum / 16 - 14) / 85));
      const highNorm = Math.min(1.0, Math.max(0.0, (highSum / 24 - 10) / 75));
      const normVol = Math.max(lowNorm, midNorm, highNorm);

      if (normVol > 0.06) {
        const livePhoneme = highNorm > 0.45 ? 'FV' : lowNorm > 0.55 && midNorm < 0.35 ? 'OH' : midNorm > 0.5 ? 'EE' : 'AA';
        creature.setSpeechState({
          talking: true,
          mouthOpen: lowNorm * 0.92,
          mouthWidth: 1.0 + midNorm * 0.25 - lowNorm * 0.15,
          smile: Math.max(0.35, midNorm * 0.88),
          phoneme: livePhoneme,
          visemeWeights: {
            jawOpen: lowNorm * 0.92,
            mouthWide: midNorm * 0.88,
            lipRound: Math.max(0, lowNorm * 0.75 - midNorm * 0.45),
            lipPress: normVol < 0.15 ? 0.5 : 0.0,
            cheekPuff: midNorm * 0.72 + lowNorm * 0.25,
            lipTuckFV: highNorm * 0.78,
            tongueUp: highNorm * 0.65 + midNorm * 0.25,
            browLift: normVol * 0.55
          },
          wave: normVol > 0.25
        });
      } else {
        creature.setSpeechState({ talking: false, phoneme: 'SIL' });
      }
    }
  }

  return {
    update,
    setBubblesEnabled(enabled) {
      bubblesEnabled = Boolean(enabled);
      bubbleLayer.style.display = bubblesEnabled ? 'block' : 'none';
      if (bubblesEnabled && activeBubbles.length === 0) {
        populateCategoryBubbles(currentCategory);
      } else if (!bubblesEnabled) {
        stageCard.classList.remove('visible');
      }
    },
    setWordCategory(catKey) {
      populateCategoryBubbles(catKey);
      const list = WORD_CATEGORIES[currentCategory].words;
      if (list.length > 0) {
        openWordStageAndSpell(list[0]);
      }
    },
    launchCustomWord(wordStr, hintStr = '') {
      const clean = String(wordStr || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 12);
      if (!clean) return;
      bubblesEnabled = true;
      bubbleLayer.style.display = 'block';
      const item = {
        word: clean,
        icon: '🌈',
        hint: hintStr || `Let's spell ${clean} together and build our dreams!`
      };
      spawnWordBubble(item);
      openWordStageAndSpell(item);
    },
    triggerBubbleParty() {
      bubblesEnabled = true;
      bubbleLayer.style.display = 'block';
      playBubbleChime('fanfare');
      populateCategoryBubbles(currentCategory);
      const list = WORD_CATEGORIES[currentCategory].words;
      const randomItem = list[Math.floor(Math.random() * list.length)];
      openWordStageAndSpell(randomItem);
    },
    setMascotName(name) {
      mascotName = String(name || 'Mr. M').trim() || 'Mr. M';
    },
    setMuted(muted) {
      soundMuted = Boolean(muted);
      if (soundMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    speakPhrase: speakMascotPhrase,
    spellWord: openWordStageAndSpell
  };
}
