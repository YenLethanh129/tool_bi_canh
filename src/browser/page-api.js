// Ham nay chay TRONG trinh duyet (qua page.evaluate) nen phai tu chua moi thu
// ben trong: khong duoc dung bien, ham hay const o ben ngoai.
//
// Truoc day moi ham mot lai copy nguyen bo INTERACTIVE / norm / isSnowflake /
// real() -> 4 ban. Giom tat ca vao day, moi lenh la mot nhanh cua switch.

// Ten lenh trong trinh duyet. Dung bang PAYLOAD.cmd.
const CMD = {
  DUMP: 'dump',       // danh sach tin nhan nao dang co nut
  SCOPE: 'scope',     // tra ve phan tu chua tin nhan theo id / noi dung
  FIND: 'find',       // tra ve handle nut can bam
  SCAN: 'scan',       // bao cao trang thai trang de hien thi ra terminal
  SCROLL: 'scroll',   // cuon
  HEIGHT: 'height',   // chieu cao khung chat, dung de biet da tai het chua
  MODAL: 'modal',     // co modal popup giu man hinh hay khong
};

function pageApi(args) {
  const INTERACTIVE = 'button, [role="button"], a[class*="linkButton"], div[class*="button"]';
  const SNOWFLAKE = /^\d{17,20}$/;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Giu nguyen chu hoa thuong de nguoi dung copy dung vao plan, con norm chi
  // de so sanh.
  const rawLabel = (el) => (el.getAttribute('data-tooltip-content')
    || el.getAttribute('aria-label')
    || el.textContent || '').replace(/\s+/g, ' ').trim();
  const isDisabled = (el) => Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true';
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Len toi phan tu chua toan bo message (Discord khong gan data ro rang).
  const messageRoot = (el) => {
    let node = el;
    for (let i = 0; i < 8 && node; i += 1) {
      node = node.parentElement;
      if (!node) break;
      if (/message|messageListItem|contents/i.test(node.className || '')) return node;
      if (SNOWFLAKE.test(node.id)) return node;
    }
    return el;
  };

  // Discord web khong phai luc nao cung dat id cua message bang snowflake.
  // Tho 1, tim qua permalink: nut "Copy Link" tro toi /channels/G/C/M
  // => M chinh la message id. Cach nay ben hon getElementById.
  const byId = (id) => {
    const direct = document.getElementById(id)
      || document.querySelector('[data-list-item-id="' + id + '"]');
    if (direct) return messageRoot(direct);
    for (const a of document.querySelectorAll('a[href*="/channels/"]')) {
      const href = a.getAttribute('href') || '';
      if (href.endsWith('/' + id) || href.endsWith('?messageId=' + id)) return messageRoot(a);
    }
    return null;
  };

  const byContent = (messageText) => {
    const want = norm(messageText);
    const cands = [];
    for (const el of document.querySelectorAll('[id]')) {
      if (!SNOWFLAKE.test(el.id)) continue;
      if (norm(el.textContent).includes(want)) cands.push(el);
    }
    cands.sort((a, b) => a.textContent.length - b.textContent.length);
    return cands[0] || null;
  };

  const scopeOf = (messageId, messageText) => {
    if (messageId) return byId(String(messageId));
    if (messageText) return byContent(messageText);
    return null;
  };

  const scroller = () => {
    let el = document.querySelector('[id^="chat-messages-"]');
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 50) break;
      el = el.parentElement;
    }
    return el;
  };

  // Chuoi literal, KHONG dung CMD.xxx: ham nay bi serialize roi dan vao trinh
  // duyet, ma o do chi co gi trong body.
  switch (args.cmd) {
    case 'dump': {
      const out = [];
      for (const el of document.querySelectorAll('[id]')) {
        if (!SNOWFLAKE.test(el.id)) continue;

        const buttons = Array.from(el.querySelectorAll(INTERACTIVE))
          .map((b) => ({
            label: rawLabel(b),
            tag: b.tagName.toLowerCase(),
            cls: (b.className || '').toString().slice(0, 60),
            disabled: isDisabled(b),
          }))
          .filter((b) => b.label);

        if (buttons.length === 0) continue;
        out.push({ messageId: el.id, text: norm(el.textContent).slice(0, 80), buttons });
      }
      return out;
    }

    case 'scope':
      return scopeOf(args.messageId, args.messageText);

    // Quet TAT CA cac nut dang co tren trang, nhom theo tung tin nhan.
    // Step co messageId/messageText: chi quet trong tin nhan do (khong bao gio
    // lan sang tin nhan khac). Step chi co text: quet ca trang, uu tien tin nhan
    // MOI NHAT - day la tin nhan vua bot moi gui, dung nguon cac nut cua luong
    // hoi thoai.
    case 'find': {
      const scope = scopeOf(args.messageId, args.messageText);

      // Co dinh vi tri tin nhan ma khong tim thay -> KHONG duoc t tim trong ca
      // trang, neu vay se bam nham sang tin nhan khac.
      if ((args.messageId || args.messageText) && !scope) return null;

      const root = scope || document;
      const want = args.text ? norm(args.text) : '';
      const index = args.index | 0;

      // Gom nut theo tin nhan. Map giu thu tu DOM = tin nhan cu -> tin nhan moi.
      const groups = new Map();
      for (const el of root.querySelectorAll(INTERACTIVE)) {
        if (isDisabled(el) || !isVisible(el)) continue;
        const label = norm(rawLabel(el));
        if (!label) continue;
        if (want && !label.includes(want)) continue;
        const owner = messageRoot(el);
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(el);
      }
      if (groups.size === 0) return null;

      let list = Array.from(groups.values());
      if (args.order !== 'oldest') list.reverse();   // tin nhan moi nhat truoc

      // Trong mot tin nhan, lay nut khop `text` dau tien, neu khong chi dinh text
      // thi lay nut thu `index` (mac dinh nut dau tien chua khoa).
      const hits = list.filter((buttons) => buttons.length > index);
      const el = (hits[0] || list[0])[Math.min(index, list[0].length - 1)];
      el.setAttribute('data-toolbi-canh', '1');
      return el;
    }

    // Bao cao ket qua quet, de hien thi trong terminal. Giup thay vi
    // "thu 18 lan" khong ro dang tim gi.
    case 'scan': {
      const want = args.text ? norm(args.text) : '';
      const labels = [];
      const matches = [];
      const owners = new Set();

      for (const el of document.querySelectorAll(INTERACTIVE)) {
        if (!isVisible(el)) continue;
        const label = rawLabel(el);
        if (!label) continue;
        owners.add(messageRoot(el));
        labels.push(label);
        if (!isDisabled(el) && (!want || norm(label).includes(want))) matches.push(label);
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
    }

    case 'scroll': {
      const el = scroller();
      if (!el) return { ok: false };

      const dy = args.dy;
      const to = args.to;
      const times = args.times || 1;

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
    }

    case 'height': {
      const ol = document.querySelector('[id^="chat-messages-"]');
      return ol ? ol.scrollHeight : null;
    }

    case 'modal':
      return !!document.querySelector('[role="dialog"], [data-list-item-id*="modal"]');

    default:
      return null;
  }
}

module.exports = { pageApi, CMD };

// Ham nay chay TRONG trinh duyet, nen moi loi goi phai truyen payload vao
// pageApi: page.evaluate(pageApi, { cmd: CMD.FIND, text: '...' })