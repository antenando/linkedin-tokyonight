// paste into the DevTools console on a signed-in LinkedIn page. It downloads
// a report: light elements and low-contrast text (searching shadow roots and
// same-origin iframes), the stylesheets, and the page's colour custom
// properties, which linkedin-tokyonight-gen.py reads from tools/dumps/
(() => {
  const nums = c => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b, a = 1] = nums(c); return a < 0.5 ? -1 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const out = [`URL ${location.pathname}`];
  const html = document.documentElement;
  out.push(`HTML class="${html.className}" data-color-scheme=${html.getAttribute('data-color-scheme')} scheme=${getComputedStyle(html).colorScheme}`);
  out.push(`BODY class="${document.body.className}"`);

  const roots = [];
  const walk = (root, label) => {
    roots.push([root, label]);
    out.push(`ROOT ${label} stylus-styles=${root.querySelectorAll('style.stylus, style[id^="stylus"]').length}`);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot, `${label} > ${el.tagName.toLowerCase()}#shadow`);
      if (el.tagName === 'IFRAME') {
        let d = null;
        try { d = el.contentDocument; } catch (e) {}
        const r = el.getBoundingClientRect();
        out.push(`IFRAME ${d ? 'same-origin' : 'cross-origin'} ${Math.round(r.width)}x${Math.round(r.height)} src=${(el.src || '').slice(0, 90)}`);
        if (d && d.documentElement) walk(d, `${label} > iframe`);
      }
    }
  };
  walk(document, 'doc');

  // name the variables that produce an element's colour: a child inherits
  // them, so resolve each one on a throwaway child. SVG cannot hold one, so
  // icons are resolved on their nearest HTML ancestor
  const varsFor = (el, prop, value) => {
    const host = el instanceof el.ownerDocument.defaultView.SVGElement ? el.closest('svg')?.parentElement : el;
    if (!host) return [];
    const doc = host.ownerDocument, probe = doc.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;';
    host.appendChild(probe);
    const cs = doc.defaultView.getComputedStyle(host), pcs = doc.defaultView.getComputedStyle(probe), via = [];
    for (let i = 0; i < cs.length; i++) {
      const n = cs[i];
      if (!n.startsWith('--')) continue;
      // a non-colour value is invalid for color, which then inherits the
      // host's colour and would match every variable on the page
      if (!CSS.supports('color', cs.getPropertyValue(n).trim())) continue;
      probe.style[prop] = `var(${n})`;
      if (pcs[prop] === value) via.push(n);
    }
    probe.remove();
    // readable names first: they are the stable ones worth fixing
    via.sort((a, b) => (a.slice(2).includes('-') ? 0 : 1) - (b.slice(2).includes('-') ? 0 : 1));
    return via;
  };
  const describe = via => `vars(${via.length})=[${via.slice(0, 30).join(' ')}]`;

  out.push('', 'LIGHT ELEMENTS');
  const seen = new Set();
  for (const [root, label] of roots) {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16) continue;
      const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (lum(cs.backgroundColor) < 0.7) continue;
      const key = `${label} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 5).join('.')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${key}\n    bg=${cs.backgroundColor} scheme=${cs.colorScheme} ${Math.round(r.width)}x${Math.round(r.height)}`);
      out.push(`    ${describe(varsFor(el, 'backgroundColor', cs.backgroundColor))}`);
      if (seen.size > 80) break;
    }
  }

  // text and icons too close to the colour behind them (WCAG ratio under 3)
  out.push('', 'LOW CONTRAST');
  // [r, g, b, a] on 0-255, from rgb() or the color(srgb 0-1) form Chrome
  // returns for colours made with color-mix()
  const rgba = c => {
    const n = nums(c);
    if (/^color\(srgb/.test(c)) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
    return [n[0], n[1], n[2], n[3] ?? 1];
  };
  const rel = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // a translucent colour is seen blended over what is behind it
  const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
  const chainOf = el => {
    const rows = [];
    for (let e = el.parentElement; e && rows.length < 5; e = e.parentElement) {
      const cs = e.ownerDocument.defaultView.getComputedStyle(e);
      const scope = e.getAttribute('data-color-scheme');
      rows.push(`      ${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 5).join('.')} color=${cs.color} scheme=${cs.colorScheme}${scope ? ` data-color-scheme=${scope}` : ''}`);
    }
    return rows.join('\n');
  };
  // the nearest opaque background, climbing out of shadow roots and frames
  const up = e => e.parentElement || e.getRootNode().host || e.ownerDocument.defaultView.frameElement;
  const canvas = getComputedStyle(document.documentElement).backgroundColor;
  const backdrop = el => {
    for (let e = el; e; e = up(e)) {
      const bg = e.ownerDocument.defaultView.getComputedStyle(e).backgroundColor;
      if (rgba(bg)[3] >= 0.5) return bg;
    }
    return rgba(canvas)[3] >= 0.5 ? canvas : 'rgb(255, 255, 255)';
  };
  const lowSeen = new Set();
  for (const [root, label] of roots) {
    for (const el of root.querySelectorAll('*')) {
      const isIcon = el.tagName.toLowerCase() === 'svg';
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!isIcon && !hasText) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      // an icon is painted by its shapes, whose fill resolves currentColor
      const shape = isIcon && el.querySelector('path, rect, circle, ellipse, polygon, use');
      const shapeFill = shape && el.ownerDocument.defaultView.getComputedStyle(shape).fill;
      const fg = shapeFill && /^rgb/.test(shapeFill) ? shapeFill : cs.color;
      const bg = backdrop(el), bgc = rgba(bg);
      const [l1, l2] = [rel(over(rgba(fg), bgc)), rel(bgc)].sort((a, b) => b - a);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      if (ratio >= 3) continue;
      const key = `${label} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 5).join('.')}`;
      if (lowSeen.has(key)) continue;
      lowSeen.add(key);
      out.push(`${key}\n    fg=${fg} on ${bg} ratio=${ratio.toFixed(2)} scheme=${cs.colorScheme} text="${el.textContent.trim().slice(0, 24)}"`);
      out.push(`    ${describe(varsFor(el, 'color', fg))}`);
      out.push(`    parents:\n${chainOf(el)}`);
      if (lowSeen.size > 60) break;
    }
  }

  // the stylesheets are public, so the generator and fixes can read them offline
  out.push('', 'STYLESHEETS');
  for (const [root, label] of roots) {
    for (const s of root.styleSheets || []) if (s.href) out.push(`${label} ${s.href}`);
  }

  // notification counters: small, saturated red boxes, whatever their class
  out.push('', 'RED BADGES');
  const toHsl = c => {
    const [r, g, b] = nums(c).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [(h + 360) % 360, s, l];
  };
  let badges = 0;
  for (const [root, label] of roots) {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.width > 40 || r.height > 30) continue;
      const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (nums(cs.backgroundColor)[3] === 0) continue;
      const [h, s] = toHsl(cs.backgroundColor);
      if (s < 0.5 || (h > 20 && h < 330)) continue;
      const chain = [];
      for (let e = el; e && chain.length < 4; e = e.parentElement) chain.push(`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 4).join('.')}`);
      out.push(`${label} ${chain.join(' < ')}\n    bg=${cs.backgroundColor} color=${cs.color} ${Math.round(r.width)}x${Math.round(r.height)} text="${el.textContent.trim().slice(0, 5)}"`);
      if (++badges > 20) break;
    }
  }

  // the app runs inside a same-origin iframe, so read every document
  out.push('', 'DUMP');
  const dumped = new Set();
  for (const [root] of roots) {
    // shadow roots have no window; only documents carry the palette
    if (root.nodeType !== Node.DOCUMENT_NODE || !root.documentElement) continue;
    const cs = root.defaultView.getComputedStyle(root.documentElement);
    for (let i = 0; i < cs.length; i++) {
      const n = cs[i];
      if (!n.startsWith('--') || dumped.has(n) || /^--(ln|vimium|jer)/.test(n)) continue;
      const v = cs.getPropertyValue(n).trim();
      if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|light-dark\()/i.test(v)) { dumped.add(n); out.push(`${n}: ${v}`); }
    }
  }
  // a download survives clipboard managers that overwrite the clipboard
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/plain' }));
  // the generator ages hashed names by the date in the file name
  a.download = `${new Date().toISOString().slice(0, 10)}-${location.pathname.split('/')[1] || 'home'}.txt`;
  a.click();
  return `saved ${a.download} (${out.length} lines)`;
})()
