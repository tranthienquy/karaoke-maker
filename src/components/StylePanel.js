/**
 * StylePanel - Text styling controls with live preview
 */

const FONT_STYLE_MAP = {
  'regular':      { weight: 400, italic: false },
  'light':        { weight: 300, italic: false },
  'bold':         { weight: 700, italic: false },
  'extrabold':    { weight: 800, italic: false },
  'black':        { weight: 900, italic: false },
  'italic':       { weight: 400, italic: true },
  'light-italic': { weight: 300, italic: true },
  'bold-italic':  { weight: 700, italic: true },
};

export class StylePanel {
  constructor(app) {
    this.app = app;
    this.styles = {
      colorInactive: '#ffffff',
      colorActive: '#00e5ff',
      bgColor: '#000000',
      bgEnabled: false,
      fontSize: 36,
      fontFamily: "'Be Vietnam Pro', sans-serif",
      fontStyleKey: 'regular',
      bold: false,
      italic: false,
      fontWeight: 400,
      stroke: true,
      strokeColor: '#000000',
      strokeWidth: 3,
      glow: false,
      glowColor: '#00e5ff',
      glowBlur: 15,
      position: 'bottom',
      posX: 50,  // percentage 0-100
      posY: 88,  // percentage 0-100
      opacity: 100,
    };
    this._fontPreviewBox = document.getElementById('font-preview-box');
    this._setupEvents();
    this._updateFontPreview();
  }

  _setupEvents() {
    // Color pickers synced with hex inputs
    this._syncColor('color-inactive', 'color-inactive-hex', 'colorInactive');
    this._syncColor('color-active', 'color-active-hex', 'colorActive');
    this._syncColor('color-bg', 'color-bg-hex', 'bgColor');
    this._syncColor('color-stroke', 'color-stroke-hex', 'strokeColor');
    this._syncColor('color-glow', 'color-glow-hex', 'glowColor');

    // Checkbox
    this._bindCheckbox('bg-enabled', 'bgEnabled');
    this._bindCheckbox('effect-stroke', 'stroke', () => {
      document.getElementById('stroke-options').style.display = this.styles.stroke ? 'flex' : 'none';
    });
    this._bindCheckbox('effect-glow', 'glow', () => {
      document.getElementById('glow-options').style.display = this.styles.glow ? 'flex' : 'none';
      document.getElementById('glow-blur-row').style.display = this.styles.glow ? 'flex' : 'none';
    });

    // Sliders
    this._bindSlider('font-size', 'fontSize', 'font-size-value');
    this._bindSlider('stroke-width', 'strokeWidth', 'stroke-width-value');
    this._bindSlider('glow-blur', 'glowBlur', 'glow-blur-value');
    this._bindSlider('text-opacity', 'opacity', 'opacity-value');
    this._bindSlider('pos-x', 'posX', 'pos-x-value');
    this._bindSlider('pos-y', 'posY', 'pos-y-value');

    // Font family select
    const fontSelect = document.getElementById('font-family');
    fontSelect.addEventListener('change', () => {
      this.styles.fontFamily = fontSelect.value;
      this._updateFontPreview();
      this._notify();
    });

    // Font style select
    const fontStyleSelect = document.getElementById('font-style');
    fontStyleSelect.addEventListener('change', () => {
      this._applyFontStyle(fontStyleSelect.value);
      this._updateFontPreview();
      this._notify();
    });

    // Position preset buttons — update X/Y sliders accordingly
    const posPresets = { top: { x: 50, y: 12 }, center: { x: 50, y: 50 }, bottom: { x: 50, y: 88 } };
    document.querySelectorAll('.pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = posPresets[btn.dataset.pos];
        this.styles.position = btn.dataset.pos;
        this.styles.posX = preset.x;
        this.styles.posY = preset.y;
        // Update sliders
        document.getElementById('pos-x').value = preset.x;
        document.getElementById('pos-x-value').textContent = preset.x;
        document.getElementById('pos-y').value = preset.y;
        document.getElementById('pos-y-value').textContent = preset.y;
        this._notify();
      });
    });
  }

  _applyFontStyle(styleKey) {
    const mapping = FONT_STYLE_MAP[styleKey] || FONT_STYLE_MAP['regular'];
    this.styles.fontStyleKey = styleKey;
    this.styles.fontWeight = mapping.weight;
    this.styles.bold = mapping.weight >= 700;
    this.styles.italic = mapping.italic;
  }

  _updateFontPreview() {
    if (!this._fontPreviewBox) return;
    const s = this.styles;
    let fontStyle = '';
    if (s.italic) fontStyle += 'italic ';
    fontStyle += `${s.fontWeight} 20px ${s.fontFamily}`;
    this._fontPreviewBox.style.font = fontStyle;
  }

  _syncColor(pickerId, hexId, key) {
    const picker = document.getElementById(pickerId);
    const hex = document.getElementById(hexId);
    picker.addEventListener('input', () => {
      hex.value = picker.value;
      this.styles[key] = picker.value;
      this._notify();
    });
    hex.addEventListener('change', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
        picker.value = hex.value;
        this.styles[key] = hex.value;
        this._notify();
      }
    });
  }

  _bindCheckbox(id, key, cb) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      this.styles[key] = el.checked;
      if (cb) cb();
      this._notify();
    });
  }

  _bindSlider(id, key, valueId) {
    const slider = document.getElementById(id);
    const display = document.getElementById(valueId);
    slider.addEventListener('input', () => {
      this.styles[key] = parseFloat(slider.value);
      display.textContent = slider.value;
      // Deactivate preset buttons when manually adjusting X/Y
      if (key === 'posX' || key === 'posY') {
        document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        this.styles.position = 'custom';
      }
      this._notify();
    });
  }

  _notify() {
    this.app.onStyleChanged(this.styles);
  }

  getStyles() { return { ...this.styles }; }

  setStyles(s) {
    Object.assign(this.styles, s);
    // Restore font style from saved data
    if (s.fontStyleKey) {
      this._applyFontStyle(s.fontStyleKey);
      const fontStyleSelect = document.getElementById('font-style');
      if (fontStyleSelect) fontStyleSelect.value = s.fontStyleKey;
    }
    // Update UI from state (for load)
    document.getElementById('color-inactive').value = s.colorInactive || '#ffffff';
    document.getElementById('color-active').value = s.colorActive || '#00e5ff';
    document.getElementById('font-size').value = s.fontSize || 36;
    document.getElementById('font-size-value').textContent = s.fontSize || 36;
    if (s.fontFamily) {
      document.getElementById('font-family').value = s.fontFamily;
    }
    if (s.posX !== undefined) {
      document.getElementById('pos-x').value = s.posX;
      document.getElementById('pos-x-value').textContent = s.posX;
    }
    if (s.posY !== undefined) {
      document.getElementById('pos-y').value = s.posY;
      document.getElementById('pos-y-value').textContent = s.posY;
    }
    this._updateFontPreview();
  }

  resetToDefaults() {
    const defaults = {
      colorInactive: '#ffffff', colorActive: '#00e5ff',
      bgColor: '#000000', bgEnabled: false,
      fontSize: 36, fontFamily: "'Be Vietnam Pro', sans-serif",
      fontStyleKey: 'regular', bold: false, italic: false, fontWeight: 400,
      stroke: true, strokeColor: '#000000', strokeWidth: 3,
      glow: false, glowColor: '#00e5ff', glowBlur: 15,
      position: 'bottom', posX: 50, posY: 88, opacity: 100,
    };
    this.styles = { ...defaults };
    this.setStyles(defaults);
  }
}
