  // ═══════════════════════════════════
  //  DATA STORE
  // ═══════════════════════════════════
  const STORAGE_KEY = 'cellar_inventory_v1';

  function loadData() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let inventory = loadData(); // { id: { name, level, updatedAt } }
  let sortMode = 'date';
  let pendingParse = null;

  // ═══════════════════════════════════
  //  VOICE RECOGNITION
  // ═══════════════════════════════════
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('listening');
      micStatus.textContent = 'Listening…';
      micStatus.classList.add('active');
      transcriptText.textContent = '…';
      hideParseUI();
    };

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      transcriptText.textContent = transcript;

      if (e.results[e.results.length - 1].isFinal) {
        processTranscript(transcript);
      }
    };

    recognition.onerror = (e) => {
      stopListening();
      showError('Recognition Error: ' + e.error);
    };

    recognition.onend = () => {
      stopListening();
    };
  }

  const micBtn = document.getElementById('micBtn');
  const micStatus = document.getElementById('micStatus');
  const transcriptText = document.getElementById('transcriptText');

  micBtn.addEventListener('click', () => {
    if (!SpeechRecognition) {
      showError('Speech Recognition Not Supported in This Browser. Try Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch(e) {}
    }
  });

  function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    micStatus.textContent = 'Click to Speak';
    micStatus.classList.remove('active');
  }

  // ═══════════════════════════════════
  //  PARSING
  // ═══════════════════════════════════
  /*
    Supported formats:
    "hendrick's gin .7"
    "hendrick's gin 0.7"
    "absolut vodka point five"
    "jack daniels 1"
    "campari 0"
  */

  const WORD_NUMBERS = {
    'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,
    'six':6,'seven':7,'eight':8,'nine':9,'ten':10,
    'point':'.','dot':'.','decimal':'.'
  };

  function parseTranscript(text) {
    let t = text.toLowerCase().trim();

    // Replace word numbers and point synonyms
    t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|point|dot|decimal)\b/g, m => WORD_NUMBERS[m]);

    // Extract trailing decimal number (0–1 range)
    // Match patterns like: .7, 0.7, 1, 0, .75 at end of string
    const numMatch = t.match(/\s+(0?\.\d+|1(?:\.0+)?|0(?:\.0+)?)\s*$/);
    if (!numMatch) return null;

    const levelStr = numMatch[1];
    const level = parseFloat(levelStr);
    if (isNaN(level) || level < 0 || level > 1) return null;

    const namePart = t.slice(0, t.lastIndexOf(numMatch[0])).trim();
    if (!namePart) return null;

    // Capitalise each word
    const name = namePart.replace(/\b\w/g, c => c.toUpperCase());
    return { name, level };
  }

  function processTranscript(transcript) {
    const result = parseTranscript(transcript);
    if (!result) {
      showError(`Could Not Parse "${transcript}". Try: "[Bottle Name] [0.0–1.0]"`);
      return;
    }
    pendingParse = result;
    showParseConfirm(result);
  }

  // ═══════════════════════════════════
  //  PARSE CONFIRM UI
  // ═══════════════════════════════════
  const parseConfirm = document.getElementById('parseConfirm');
  const parsedName = document.getElementById('parsedName');
  const parsedLevel = document.getElementById('parsedLevel');
  const parseError = document.getElementById('parseError');
  const btnConfirm = document.getElementById('btnConfirm');
  const btnDiscard = document.getElementById('btnDiscard');

  function showParseConfirm({ name, level }) {
    parseError.classList.remove('visible');
    parsedName.value = name;
    const snapped = Math.round(level * 10) / 10;
    parsedLevel.value = snapped.toFixed(1);
    document.getElementById('parsedLevelDisplay').textContent = snapped.toFixed(1);
    parseConfirm.classList.add('visible');
    parsedName.focus();
    parsedName.select();
  }

  document.getElementById('parsedLevel').addEventListener('input', () => {
    const v = parseFloat(document.getElementById('parsedLevel').value);
    document.getElementById('parsedLevelDisplay').textContent = isNaN(v) ? '0.0' : v.toFixed(1);
  });

  function hideParseUI() {
    parseConfirm.classList.remove('visible');
    parseError.classList.remove('visible');
    pendingParse = null;
  }

  function showError(msg) {
    parseConfirm.classList.remove('visible');
    parseError.textContent = msg;
    parseError.classList.add('visible');
  }

  btnConfirm.addEventListener('click', () => {
    if (!pendingParse) return;
    const name = document.getElementById('parsedName').value.trim();
    const level = parseFloat(document.getElementById('parsedLevel').value);
    if (!name) { showError('Bottle Name Cannot Be Empty.'); return; }
    if (isNaN(level) || level < 0 || level > 1) { showError('Level Must Be Between 0 and 1.'); return; }
    applyUpdate(name, level);
    hideParseUI();
    showToast(`Updated: ${name}`);
    pendingParse = null;
  });

  btnDiscard.addEventListener('click', () => {
    hideParseUI();
    transcriptText.textContent = '—';
  });

  // ═══════════════════════════════════
  //  INVENTORY OPERATIONS
  // ═══════════════════════════════════
  function makeId(name) {
    return name.toLowerCase().replace(/[''']/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  function applyUpdate(name, level) {
    const id = makeId(name);
    inventory[id] = {
      name,
      level: Math.max(0, Math.min(1, level)),
      updatedAt: new Date().toISOString()
    };
    saveData(inventory);
    renderInventory();
    // Flash the card
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.classList.add('just-updated');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  function renameBottle(id) {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    const nameEl = card.querySelector('.bottle-name');
    const currentName = inventory[id].name;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'edit-input name-edit-input';

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;

    function save() {
      if (saved) return;
      saved = true;
      const newName = input.value.trim();
      if (!newName || newName === currentName) { renderInventory(); return; }
      const newId = makeId(newName);
      const bottle = inventory[id];
      if (newId !== id) delete inventory[id];
      inventory[newId] = { ...bottle, name: newName };
      saveData(inventory);
      renderInventory();
      showToast(`Renamed to: ${newName}`);
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { saved = true; renderInventory(); }
    });
  }

  function deleteBottle(id) {
    if (!confirm(`Remove "${inventory[id]?.name}"?`)) return;
    delete inventory[id];
    saveData(inventory);
    renderInventory();
    showToast('Bottle Removed');
  }

  function updateLevel(id, val) {
    const level = parseFloat(val);
    if (isNaN(level) || level < 0 || level > 1) {
      showToast('Level Must Be Between 0 and 1');
      return;
    }
    inventory[id].level = level;
    inventory[id].updatedAt = new Date().toISOString();
    saveData(inventory);
    renderInventory();
    showToast('Level Updated');
  }

  function updateManualBar(val) {
    const level = parseFloat(val);
    const pct = Math.round(level * 100);
    const color = getLevelColor(level);
    document.getElementById('manualLevelFill').style.width = pct + '%';
    document.getElementById('manualLevelFill').style.background = `linear-gradient(90deg, ${color}88, ${color})`;
    document.getElementById('manualLevelPct').textContent = pct + '%';
    document.getElementById('manualLevelPct').style.color = color;
    document.getElementById('manualLevelVal').textContent = level.toFixed(1);
  }

  function addManual() {
    const nameEl = document.getElementById('manualName');
    const levelEl = document.getElementById('manualLevel');
    const name = nameEl.value.trim();
    const level = parseFloat(levelEl.value);
    if (!name) { showToast('Enter a Bottle Name'); return; }
    if (isNaN(level) || level < 0 || level > 1) { showToast('Level Must Be 0–1'); return; }
    applyUpdate(name, level);
    nameEl.value = '';
    levelEl.value = '1';
    updateManualBar('1');
    showToast(`Added: ${name}`);
  }

  // ═══════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════
  function setSort(mode) {
    sortMode = mode;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sort' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
    renderInventory();
  }

  function getLevelColor(level) {
    if (level >= 0.6) return '#4d7c5a';
    if (level >= 0.3) return '#8b6040';
    return '#8a4a4a';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  }

  function renderInventory() {
    const container = document.getElementById('inventoryContainer');
    const emptyState = document.getElementById('emptyState');
    const search = document.getElementById('searchInput').value.toLowerCase().trim();

    let items = Object.entries(inventory).map(([id, data]) => ({ id, ...data }));

    if (search) {
      items = items.filter(b => b.name.toLowerCase().includes(search));
    }

    // Sort
    if (sortMode === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'level') {
      items.sort((a, b) => b.level - a.level);
    } else if (sortMode === 'date') {
      items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    // Update counts
    const total = Object.keys(inventory).length;
    document.getElementById('bottleCount').textContent = items.length === total
      ? `${total} bottle${total !== 1 ? 's' : ''}`
      : `${items.length} of ${total} shown`;

    if (items.length === 0) {
      if (!emptyState.parentNode || emptyState.parentNode !== container) {
        container.innerHTML = '';
        container.appendChild(emptyState);
      }
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    const grid = document.createElement('div');
    grid.className = 'bottles-grid';

    items.forEach(bottle => {
      const pct = Math.round(bottle.level * 100);
      const fillH = Math.max(0, Math.min(66, Math.round(bottle.level * 66)));
      const color = getLevelColor(bottle.level);
      const sid = bottle.id.replace(/'/g, "\\'");

      const card = document.createElement('div');
      card.className = 'bottle-card';
      card.dataset.id = bottle.id;

      card.innerHTML = `
        <button class="btn-delete" onclick="deleteBottle('${sid}')" title="Remove" style="position:absolute; top:0.5rem; right:0.5rem; z-index:2;">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
        <div class="bottle-name" onclick="renameBottle('${sid}')" title="Click to rename">${escHtml(bottle.name)}</div>

<div class="level-container" style="position:relative; cursor:pointer; padding-right:2rem;">
          <input type="range" class="level-slider-overlay" min="0" max="1" step="0.1"
            value="${(Math.round(bottle.level * 10) / 10).toFixed(1)}"
            id="inp_${bottle.id}"
            oninput="liveLevel('${sid}', this.value)"
            onchange="setLevel('${sid}')"
          />
          <div class="level-bar-track">
            <div class="level-bar-fill" style="width:${pct}%; background:linear-gradient(90deg, ${color}88, ${color});"></div>
          </div>
          <div class="level-labels">
            <span class="level-pct" style="color:${color}">${pct}%</span>
            <span class="level-fraction">${bottle.level.toFixed(2)}</span>
          </div>
        </div>


<div class="last-updated">Updated ${formatDate(bottle.updatedAt)}</div>
      `;

      grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);
    container.appendChild(emptyState);
  }

  function liveLevel(id, val) {
    const level = parseFloat(val);
    const pct = Math.round(level * 100);
    const color = getLevelColor(level);
    const card = document.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    card.querySelector('.level-bar-fill').style.width = pct + '%';
    card.querySelector('.level-bar-fill').style.background = `linear-gradient(90deg, ${color}88, ${color})`;
    card.querySelector('.level-pct').textContent = pct + '%';
    card.querySelector('.level-pct').style.color = color;
    card.querySelector('.level-fraction').textContent = level.toFixed(2);
  }

  function setLevel(id) {
    const inp = document.getElementById('inp_' + id);
    if (!inp) return;
    updateLevel(id, inp.value);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Guess spirit category from name
  function guessCategory(name) {
    const n = name.toLowerCase();
    if (/gin/.test(n)) return 'Gin';
    if (/vodka/.test(n)) return 'Vodka';
    if (/whisky|whiskey|bourbon|scotch|rye/.test(n)) return 'Whisky';
    if (/rum/.test(n)) return 'Rum';
    if (/tequila|mezcal/.test(n)) return 'Tequila';
    if (/brandy|cognac|armagnac/.test(n)) return 'Brandy';
    if (/champagne|prosecco|cava/.test(n)) return 'Sparkling';
    if (/wine|merlot|cabernet|chardonnay|rosé|rose/.test(n)) return 'Wine';
    if (/beer|lager|ale|stout/.test(n)) return 'Beer';
    if (/liqueur|schnapps|amaretto|campari|aperol/.test(n)) return 'Liqueur';
    if (/vermouth/.test(n)) return 'Vermouth';
    if (/bitters/.test(n)) return 'Bitters';
    return 'Spirit';
  }

  // ═══════════════════════════════════
  //  EXPORT XLSX
  // ═══════════════════════════════════
  document.getElementById('btnDownload').addEventListener('click', exportXlsx);

  function exportXlsx() {
    const items = Object.values(inventory);
    if (!items.length) { showToast('No Bottles to Export'); return; }

    const rows = items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(b => ({
        'Bottle': b.name,
        'Level (0–1)': parseFloat(b.level.toFixed(3)),
        'Last Updated': b.updatedAt ? new Date(b.updatedAt).toLocaleString() : ''
      }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

    // Summary sheet
    const categories = {};
    items.forEach(b => {
      const cat = guessCategory(b.name);
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(b);
    });

    const summaryRows = Object.entries(categories).map(([cat, bottles]) => ({
      'Category': cat,
      'Count': bottles.length,
      'Avg Level': parseFloat((bottles.reduce((s, b) => s + b.level, 0) / bottles.length).toFixed(3)),
      'Low (< 0.35)': bottles.filter(b => b.level < 0.35).length
    }));

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `nighthawk-inventory-${date}.xlsx`);
    showToast('Exported Inventory');
  }

  // ═══════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════
  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  // ═══════════════════════════════════
  //  INIT
  // ═══════════════════════════════════
  renderInventory();
