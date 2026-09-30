// Ham ben duoi chay trong trinh duyet (qua page.evaluate) nen phai tu chua moi
// thu ben trong, khong duoc dung bien hay ham o ben ngoai.

// Tra ve danh sach message nao co nut bam, dung de xac nhung gi co the bam
function dumpInPage() {
  const fn = function dump() {
    const INTERACTIVE = 'button, [role="button"], a[class*="linkButton"], div[class*="button"]';
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isSnowflake = (s) => /^\d{17,20}$/.test(s || '');
    // Giu nguyen chu hoa thuong de nguoi dung copy dung vao plan,
    // con normChi de so sanh.
    const rawLabel = (el) => (el.getAttribute('data-tooltip-content')
      || el.getAttribute('aria-label')
      || el.textContent || '').replace(/\s+/g, ' ').trim();

    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[id]')) {
      if (!isSnowflake(el.id) || seen.has(el)) continue;
      seen.add(el);

      const buttons = Array.from(el.querySelectorAll(INTERACTIVE))
        .map((b) => ({
          label: rawLabel(b),
          tag: b.tagName.toLowerCase(),
          cls: (b.className || '').toString().slice(0, 60),
          disabled: Boolean(b.disabled) || b.getAttribute('aria-disabled') === 'true',
        }))
        .filter((b) => b.label);

      if (buttons.length === 0) continue;

      out.push({
        messageId: el.id,
        text: norm(el.textContent).slice(0, 80),
        buttons,
      });
    }
    return out;
  };
  return fn;
}

// Discord web khong phai luc nao cung dat id cua message bang snowflake.
// Tho 1, tim qua permalink: nut "Copy Link" cua message tro toi /channels/G/C/M
// => M chinh la message id. Cach nay ben hon getElementById.
function findScopeInPage() {
  const fn = function findScope({ messageId, messageText }) {
    const isSnowflake = (s) => /^\d{17,20}$/.test(s || '');
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

    const real = (el) => {
      // Len toi phan tử chua toan bo message
      let node = el;
      for (let i = 0; i < 8 && node; i += 1) {
        node = node.parentElement;
        if (!node) break;
        if (/message|messageListItem|contents/i.test(node.className || '')) return node;
        if (isSnowflake(node.id)) return node;
      }
      return el;
    };

    if (messageId) {
      const id = String(messageId);
      const direct = document.getElementById(id)
        || document.querySelector('[data-list-item-id="' + id + '"]');
      if (direct) return real(direct);

      // tim qua href chua message id
      for (const a of document.querySelectorAll('a[href*="/channels/"]')) {
        const href = a.getAttribute('href') || '';
        if (href.endsWith('/' + id) || href.endsWith('?messageId=' + id)) {
          return real(a);
        }
      }
      return null;
    }

    if (messageText) {
      const want = norm(messageText);
      const cands = [];
      for (const el of document.querySelectorAll('[id]')) {
        if (!isSnowflake(el.id)) continue;
        if (norm(el.textContent).includes(want)) cands.push(el);
      }
      cands.sort((a, b) => a.textContent.length - b.textContent.length);
      return cands[0] || null;
    }

    return null;
  };
  return fn;
}

// Tra ve handle cua nut can bam, hoac null.
// Quet TAT CA cac nut dang co tren trang, nhom theo tung tin nhan.
// Step co messageId: chi quet trong tin nhan do (khong bao gio lan sang tin nhan khac).
// Step chi co text: quet ca trang, uu tien tin nhan MOI NHAT - day la tin nhan
// vua bot moi gui, dung nguon cac nut cua luong hoi thoai.
function findButtonInPage() {
  const fn = function findButton({ messageId, messageText, text, index = 0, order = 'newest' }) {
    const INTERACTIVE = 'button, [role="button"], a[class*="linkButton"], div[class*="button"]';
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isSnowflake = (s) => /^\d{17,20}$/.test(s || '');
    const labelOf = (el) => norm(
      el.getAttribute('data-tooltip-content') || el.getAttribute('aria-label') || el.textContent,
    );

    const real = (el) => {
      let node = el;
      for (let i = 0; i < 8 && node; i += 1) {
        node = node.parentElement;
        if (!node) break;
        if (/message|messageListItem|contents/i.test(node.className || '')) return node;
        if (isSnowflake(node.id)) return node;
      }
      return el;
    };

    let scope = null;
    if (messageId) {
      const id = String(messageId);
      const direct = document.getElementById(id)
        || document.querySelector('[data-list-item-id="' + id + '"]');
      if (direct) scope = real(direct);
      if (!scope) {
        for (const a of document.querySelectorAll('a[href*="/channels/"]')) {
          const href = a.getAttribute('href') || '';
          if (href.endsWith('/' + id) || href.endsWith('?messageId=' + id)) {
            scope = real(a);
            break;
          }
        }
      }
    } else if (messageText) {
      const want = norm(messageText);
      const cands = [];
      for (const el of document.querySelectorAll('[id]')) {
        if (!isSnowflake(el.id)) continue;
        if (norm(el.textContent).includes(want)) cands.push(el);
      }
      cands.sort((a, b) => a.textContent.length - b.textContent.length);
      scope = cands[0] || null;
    }

    // Co dinh vi tri tin nhan ma khong tim thay -> KHONG duoc t tim trong ca trang,
    // neu vay se bam nham sang tin nhan khac.
    if ((messageId || messageText) && !scope) return null;

    const root = scope || document;
    const want = text ? norm(text) : '';

    // Gom nut theo tin nhan. Map giu thu tu DOM = tin nhan cu -> tin nhan moi.
    const groups = new Map();
    for (const el of root.querySelectorAll(INTERACTIVE)) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = labelOf(el);
      if (!label) continue;
      if (want && !label.includes(want)) continue;
      const owner = real(el);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(el);
    }

    if (groups.size === 0) return null;

    let list = Array.from(groups.values());
    if (order !== 'oldest') list.reverse();   // tin nhan moi nhat truoc

    // Trong mot tin nhan, lay nut khop `text` dau tien, neu khong chi dinh text
    // thi lay nut thu `index` (mac dinh nut dau tien chua khoa).
    const hits = list.filter((buttons) => buttons.length > (index | 0));
    const el = (hits[0] || list[0])[Math.min(index | 0, list[0].length - 1)];
    el.setAttribute('data-toolbi-canh', '1');
    return el;
  };
  return fn;
}

// Bao cao ket qua quet, de hien thi trong terminal.
// Giup thay vi "thu 18 lan" khong ro dang tim gi.
function scanInPage() {
  const fn = function scan({ text }) {
    const INTERACTIVE = 'button, [role="button"], a[class*="linkButton"], div[class*="button"]';
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isSnowflake = (s) => /^\d{17,20}$/.test(s || '');
    const want = text ? norm(text) : '';
    const labels = [];
    const matches = [];
    const owners = new Set();

    const real = (el) => {
      let node = el;
      for (let i = 0; i < 8 && node; i += 1) {
        node = node.parentElement;
        if (!node) break;
        if (/message|messageListItem|contents/i.test(node.className || '')) return node;
        if (isSnowflake(node.id)) return node;
      }
      return el;
    };

    for (const el of document.querySelectorAll(INTERACTIVE)) {
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = (
        el.getAttribute('data-tooltip-content') || el.getAttribute('aria-label') || el.textContent
      ).replace(/\s+/g, ' ').trim();
      if (!label) continue;
      owners.add(real(el));
      labels.push(label);
      if (!disabled && (!want || norm(label).includes(want))) matches.push(label);
    }

    // Dem tat ca tin nhan dang co tren trang, ke ca tin nhan khong co nut
    let messages = document.querySelectorAll(
      '[data-list-item-id], li[id], [class*="messageListItem"]',
    ).length;
    if (messages === 0) messages = owners.size;

    const ol = document.querySelector('[id^="chat-messages-"]');
    return {
      messages,
      buttons: labels.length,
      matches,
      sample: labels.slice(-6),
      atBottom: ol ? ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 40 : null,
    };
  };
  return fn;
}

// Keo len phan trang chua chuoi can tim
function scrollInPage() {
  const fn = function scrollStep({ dy, to, times = 1 }) {
    const ol = document.querySelector('[id^="chat-messages-"]');
    let el = ol;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 50) break;
      el = el.parentElement;
    }
    if (!el) return { ok: false };

    // Cuon xuong day lap lai: Discord nap tin nhan moi theo lo, phai cuon nhieu
    // lan moi chan duoi cung. Dung khi scrollHeight khong con tang.
    if (to === 'bottom' && times > 1) {
      let prev = -1;
      for (let i = 0; i < times; i += 1) {
        el.scrollTop = el.scrollHeight;
        if (el.scrollHeight === prev) break;
        prev = el.scrollHeight;
      }
    } else if (to === 'top') {
      el.scrollTop = 0;
    } else if (to === 'bottom') {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTop += dy;
    }

    return {
      ok: true,
      scrollTop: el.scrollTop,
      atTop: el.scrollTop <= 2,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 40,
    };
  };
  return fn;
}

module.exports = { dumpInPage, findButtonInPage, findScopeInPage, scanInPage, scrollInPage };
