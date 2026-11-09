// Export docs, sheets and slides (v0.20), zero dependencies: real Word (.docx), Excel (.xlsx) and PowerPoint (.pptx)
// files built in the browser (a small store-only ZIP writer plus the minimal Office XML each format needs), Markdown,
// CSV and HTML, and the Google route: "Copy for Google Docs/Sheets" puts rich text or a table on the clipboard and
// opens docs.new / sheets.new, where one paste keeps the formatting; Slides imports the .pptx (File › Import slides).
// On the host computer, "Save to Desktop" writes into Desktop/TribeCode Projects/<project>/Exports (server/export.js);
// everywhere else the file downloads. Google Drive linking is planned (docs/EXPORT.md).
//
//   TribeExport.docx(title, markdown) -> Blob      TribeExport.xlsx(name, grid, values?) -> Blob
//   TribeExport.pptx(title, slides)   -> Blob      slides: [{ md, notes }]
//   TribeExport.save(blob, filename)  -> Promise<{ path } | { downloaded }>
//   TribeExport.menu(anchor, doc)     the Export menu for a doc { title, body, kind: 'doc'|'sheet'|'deck' }
(function () {
  'use strict';
  const enc = new TextEncoder();
  const X = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const esc = X;

  // ---------- ZIP (store only: Office reads it, and it needs no deflate) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files, mime) {
    const parts = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const [name, text] of files) {
      const nb = enc.encode(name), data = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(10, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint32(12, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const size = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: mime });
  }
  const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

  // ---------- Markdown, read into simple blocks ----------
  function blocks(md) {
    const out = [], L = String(md || '').replace(/\r/g, '').split('\n');
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (/^```/.test(l)) { const code = []; while (++i < L.length && !/^```/.test(L[i])) code.push(L[i]); out.push({ t: 'code', lines: code }); continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
        const rows = [l]; i += 1; while (i + 1 < L.length && /^\s*\|.*\|\s*$/.test(L[i + 1])) rows.push(L[++i]);
        out.push({ t: 'table', rows: rows.map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())) }); continue;
      }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) out.push({ t: 'h', level: m[1].length, text: m[2] });
      else if ((m = /^(\s*)[-*+]\s+(?:\[( |x)\]\s+)?(.*)$/i.exec(l))) out.push({ t: 'li', depth: Math.min(3, Math.floor(m[1].length / 2)), text: (m[2] ? (m[2].toLowerCase() === 'x' ? '☑ ' : '☐ ') : '') + m[3] });
      else if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(l))) out.push({ t: 'ol', depth: Math.min(3, Math.floor(m[1].length / 2)), n: m[2], text: m[3] });
      else if ((m = /^>\s?(.*)$/.exec(l))) out.push({ t: 'quote', text: m[1] });
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) out.push({ t: 'hr' });
      else if (!l.trim()) out.push({ t: 'blank' });
      else { const last = out[out.length - 1]; if (last && last.t === 'p') last.text += ' ' + l.trim(); else out.push({ t: 'p', text: l.trim() }); }
    }
    return out.filter((b, i, a) => b.t !== 'blank' || (a[i - 1] && a[i - 1].t !== 'blank'));
  }
  // inline: **bold**, *italic* / _italic_, `code`, [text](url), ~~strike~~ -> runs
  function runs(text) {
    const out = []; let s = String(text || '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|~~([^~]+)~~)/;
    while (s) {
      const m = re.exec(s); if (!m) { out.push({ text: s }); break; }
      if (m.index) out.push({ text: s.slice(0, m.index) });
      if (m[2] || m[3]) out.push({ text: m[2] || m[3], b: true });
      else if (m[4] || m[5]) out.push({ text: m[4] || m[5], i: true });
      else if (m[6]) out.push({ text: m[6], code: true });
      else if (m[7]) out.push({ text: m[7], link: m[8] });
      else if (m[9]) out.push({ text: m[9], strike: true });
      s = s.slice(m.index + m[0].length);
    }
    return out;
  }
  const plain = t => runs(t).map(r => r.text).join('');

  // ---------- Word ----------
  function docx(title, md) {
    const links = [];
    const wr = r => {
      const pr = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.strike ? '<w:strike/>' : '') + (r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '') + (r.link ? '<w:rStyle w:val="Hyperlink"/>' : '');
      const t = `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${X(r.text)}</w:t></w:r>`;
      if (r.link && /^https?:\/\//i.test(r.link)) { links.push(r.link); return `<w:hyperlink r:id="rIdL${links.length}">${t}</w:hyperlink>`; }
      return t;
    };
    const para = (text, style, extra = '') => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${runs(text).map(wr).join('')}</w:p>`;
    let body = '';
    for (const b of blocks(md)) {
      if (b.t === 'h') body += para(b.text, b.level === 1 ? 'Heading1' : b.level === 2 ? 'Heading2' : 'Heading3');
      else if (b.t === 'p') body += para(b.text);
      else if (b.t === 'li') body += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="${360 + b.depth * 360}" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">•  </w:t></w:r>${runs(b.text).map(wr).join('')}</w:p>`;
      else if (b.t === 'ol') body += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="${360 + b.depth * 360}" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">${X(b.n)}. </w:t></w:r>${runs(b.text).map(wr).join('')}</w:p>`;
      else if (b.t === 'quote') body += para(b.text, 'Quote');
      else if (b.t === 'hr') body += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>';
      else if (b.t === 'code') body += b.lines.map(l => `<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr><w:r><w:t xml:space="preserve">${X(l)}</w:t></w:r></w:p>`).join('');
      else if (b.t === 'table') {
        const n = Math.max(...b.rows.map(r => r.length)), w = Math.floor(9360 / n);
        body += `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${('<w:gridCol w:w="' + w + '"/>').repeat(n)}</w:tblGrid>` +
          b.rows.map((r, ri) => `<w:tr>${Array.from({ length: n }, (_, ci) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr><w:p>${runs(r[ci] || '').map(x => wr(ri === 0 ? { ...x, b: true } : x)).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('') + '</w:tbl><w:p/>';
      }
    }
    if (!body) body = '<w:p/>';
    const doc = `${XMLH}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const H = (id, name, size, before, color = '1D232C') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${id.slice(-1) - 1}"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
    const styles = `${XMLH}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${H('Heading1', 'heading 1', 36, 360)}${H('Heading2', 'heading 2', 28, 280)}${H('Heading3', 'heading 3', 24, 240)}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="F26B1D"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F5FBF"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return zip([
      ['[Content_Types].xml', `${XMLH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `${XMLH}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(title)}</dc:title><dc:creator>TribeCode</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`],
      ['word/_rels/document.xml.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rIdS" Type="${REL}/styles" Target="styles.xml"/>${links.map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="${REL}/hyperlink" Target="${X(u)}" TargetMode="External"/>`).join('')}</Relationships>`],
      ['word/document.xml', doc],
      ['word/styles.xml', styles],
    ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  // ---------- Excel ----------
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function xlsx(name, grid, values) {
    const rows = (grid || []).map(r => r.map(c => String(c ?? '')));
    while (rows.length && rows[rows.length - 1].every(c => !c.trim())) rows.pop();
    const isNum = s => /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(s);
    let width = 0; rows.forEach(r => { for (let c = r.length - 1; c >= 0; c--) if (r[c].trim()) { width = Math.max(width, c + 1); break; } });
    const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.slice(0, width).map((raw, ci) => {
      const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
      if (!raw.trim()) return '';
      if (raw.startsWith('=')) {
        const v = values ? values(ri, ci) : null;
        const f = `<f>${X(raw.slice(1))}</f>`;
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}>${f}<v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}"${st} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
        return `<c r="${ref}"${st} t="str">${f}<v>${X(v && v.err ? v.err : v ?? '')}</v></c>`;
      }
      if (isNum(raw)) return `<c r="${ref}"${st}><v>${Number(raw)}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${X(raw)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = width ? `<cols>${Array.from({ length: width }, (_, i) => { const w = Math.min(60, Math.max(10, ...rows.map(r => (r[i] || '').length + 2))); return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`; }).join('')}</cols>` : '';
    const sheetName = X(String(name || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    return zip([
      ['[Content_Types].xml', `${XMLH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `${XMLH}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', `${XMLH}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ['xl/worksheets/sheet1.xml', `${XMLH}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">${rows.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''}${cols}<sheetData>${sheetRows}</sheetData></worksheet>`],
    ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  // ---------- PowerPoint (16:9, a title and a body per slide, speaker notes kept as plain text on the slide's notes) ----------
  function pptx(title, slides) {
    const EMU = 12700, W = 960 * EMU, Hh = 540 * EMU;
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', Pn = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    const para = (text, opt = {}) => `<a:p>${opt.bullet ? `<a:pPr marL="${342900 + (opt.depth || 0) * 342900}" indent="-342900"><a:buChar char="•"/></a:pPr>` : '<a:pPr><a:buNone/></a:pPr>'}${runs(text).map(r => `<a:r><a:rPr lang="en-US" sz="${opt.sz || 2400}"${r.b || opt.b ? ' b="1"' : ''}${r.i ? ' i="1"' : ''} dirty="0">${opt.color ? `<a:solidFill><a:srgbClr val="${opt.color}"/></a:solidFill>` : ''}${r.code ? '<a:latin typeface="Consolas"/>' : ''}</a:rPr><a:t>${X(r.text)}</a:t></a:r>`).join('') || `<a:endParaRPr lang="en-US" sz="${opt.sz || 2400}"/>`}</a:p>`;
    const box = (id, name, x, y, w, h, ps) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${ps}</p:txBody></p:sp>`;
    const files = [], list = (slides && slides.length ? slides : [{ md: `# ${title || 'Slides'}` }]);
    list.forEach((s, i) => {
      const bl = blocks(s.md || ''), head = bl.find(b => b.t === 'h'), rest = bl.filter(b => b !== head && b.t !== 'blank' && b.t !== 'hr');
      const titleOnly = head && head.level === 1 && rest.length <= 2 && rest.every(b => b.t === 'p');
      let ps = '';
      for (const b of rest) {
        if (b.t === 'li' || b.t === 'ol') ps += para((b.t === 'ol' ? b.n + '. ' : '') + b.text, { bullet: b.t === 'li', depth: b.depth, sz: 2200 });
        else if (b.t === 'code') ps += b.lines.map(l => para('`' + l.replace(/`/g, "'") + '`', { sz: 1600 })).join('');
        else if (b.t === 'table') ps += b.rows.map((r, ri) => para(r.map(plain).join('   ·   '), { sz: 1800, b: ri === 0 })).join('');
        else if (b.t === 'h') ps += para(b.text, { sz: 2600, b: true });
        else ps += para(b.text || '', { sz: titleOnly ? 2600 : 2200, color: titleOnly ? '555555' : null });
      }
      const sp = titleOnly
        ? box(2, 'Title', 72 * EMU, 170 * EMU, 816 * EMU, 110 * EMU, para(head.text, { sz: 5000, b: true })) + (ps ? box(3, 'Subtitle', 72 * EMU, 300 * EMU, 816 * EMU, 120 * EMU, ps) : '')
        : (head ? box(2, 'Title', 72 * EMU, 48 * EMU, 816 * EMU, 72 * EMU, para(head.text, { sz: 3600, b: true })) : '') + box(3, 'Body', 72 * EMU, (head ? 140 : 56) * EMU, 816 * EMU, (head ? 360 : 440) * EMU, ps || para(''));
      files.push([`ppt/slides/slide${i + 1}.xml`, `${XMLH}<p:sld xmlns:a="${A}" xmlns:r="${REL}" xmlns:p="${Pn}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${sp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`]);
      files.push([`ppt/slides/_rels/slide${i + 1}.xml.rels`, `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`]);
    });
    const n = list.length;
    const theme = `${XMLH}<a:theme xmlns:a="${A}" name="TribeCode"><a:themeElements><a:clrScheme name="TribeCode"><a:dk1><a:srgbClr val="1D232C"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="12151A"/></a:dk2><a:lt2><a:srgbClr val="F4F4F4"/></a:lt2><a:accent1><a:srgbClr val="F26B1D"/></a:accent1><a:accent2><a:srgbClr val="38C6B1"/></a:accent2><a:accent3><a:srgbClr val="6C7CFF"/></a:accent3><a:accent4><a:srgbClr val="FABD2F"/></a:accent4><a:accent5><a:srgbClr val="8EC07C"/></a:accent5><a:accent6><a:srgbClr val="B4512A"/></a:accent6><a:hlink><a:srgbClr val="1F5FBF"/></a:hlink><a:folHlink><a:srgbClr val="6C7CFF"/></a:folHlink></a:clrScheme><a:fontScheme name="TribeCode"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="TribeCode"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const empty = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>';
    return zip([
      ['[Content_Types].xml', `${XMLH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${list.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`],
      ['_rels/.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
      ['ppt/presentation.xml', `${XMLH}<p:presentation xmlns:a="${A}" xmlns:r="${REL}" xmlns:p="${Pn}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst><p:sldIdLst>${list.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${Hh}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
      ['ppt/_rels/presentation.xml.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rIdM" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdT" Type="${REL}/theme" Target="theme/theme1.xml"/>${list.map((_, i) => `<Relationship Id="rIdS${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`],
      ['ppt/slideMasters/slideMaster1.xml', `${XMLH}<p:sldMaster xmlns:a="${A}" xmlns:r="${REL}" xmlns:p="${Pn}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`],
      ['ppt/slideLayouts/slideLayout1.xml', `${XMLH}<p:sldLayout xmlns:a="${A}" xmlns:r="${REL}" xmlns:p="${Pn}" type="blank" preserve="1">${empty.replace('<p:cSld>', '<p:cSld name="Blank">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
      ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${XMLH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
      ['ppt/theme/theme1.xml', theme],
      ...files,
    ], 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    void n;
  }

  // ---------- saving ----------
  const C = () => window.TribeClient;
  const safe = n => (String(n || 'Untitled').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim() || 'Untitled').slice(0, 100);
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return { downloaded: name };
  }
  async function hostDesk() {   // the host's own computer, where "Save to Desktop" can write a real folder
    try { if (!C() || !C().connected()) return null; const r = await C().api('/export'); return r && r.local ? r : null; } catch { return null; }
  }
  async function save(blob, name, { desktop = 'auto', reveal = false } = {}) {
    if (desktop && (window.TribeHost && window.TribeHost.isDesktop || desktop === true)) {
      const h = await hostDesk();
      if (h) { try { return await C().api('/export/file', { method: 'POST', body: { name, data: await toB64(blob), reveal } }); } catch {} }
    }
    return download(blob, name);
  }
  const toast = t => { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(t); };

  // Google: copy rich text / a table, then open a new Doc or Sheet where one paste keeps the formatting
  async function copyRich(html, text) {
    try {
      if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); return true; }
    } catch {}
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  const sheetOf = body => { const S = window.TribeSheet; if (!S) return { grid: [], values: null }; const p = S.parse(body); const ev = S.evaluate(p.grid); return { grid: p.grid, values: (r, c) => ev.at(r, c), pre: p.pre }; };
  const deckOf = body => { const D = window.TribeDeck; return D ? D.parse(body).slides : [{ md: body, notes: '' }]; };
  const tsv = (grid, values) => grid.map((r, ri) => r.map((c, ci) => { const v = String(c ?? '').startsWith('=') && values ? values(ri, ci) : c; return String(v && v.err ? v.err : v ?? '').replace(/[\t\n]/g, ' '); }).join('\t')).join('\n');
  const mdHtml = md => (window.TribeMD ? window.TribeMD.render(md) : `<pre>${esc(md)}</pre>`);

  function options(doc) {
    const t = safe(doc.title), kind = doc.kind === 'sheet' ? 'sheet' : doc.kind === 'deck' ? 'deck' : 'doc';
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop);
    const fileOpts = kind === 'sheet' ? [['xlsx', 'Excel (.xlsx)', () => { const s = sheetOf(doc.body); return [xlsx(t, s.grid, s.values), `${t}.xlsx`]; }], ['csv', 'CSV', () => { const s = sheetOf(doc.body); return [new Blob([s.grid.map(r => r.map(c => /[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n')], { type: 'text/csv' }), `${t}.csv`]; }]]
      : kind === 'deck' ? [['pptx', 'PowerPoint (.pptx)', () => [pptx(t, deckOf(doc.body)), `${t}.pptx`]], ['html', 'One web page (.html)', () => [new Blob([window.TribeDeck ? window.TribeDeck.html(window.TribeDeck.parse(doc.body), t) : doc.body], { type: 'text/html' }), `${t}.html`]]]
      : [['docx', 'Word (.docx)', () => [docx(t, doc.body), `${t}.docx`]], ['md', 'Markdown (.md)', () => [new Blob([doc.body], { type: 'text/markdown' }), `${t}.md`]], ['html', 'Web page (.html)', () => [new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(t)}</title><body style="font:16px/1.6 Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 16px">${mdHtml(doc.body)}</body>`], { type: 'text/html' }), `${t}.html`]]];
    const google = kind === 'sheet' ? { label: 'Copy for Google Sheets', open: 'https://sheets.new', how: 'Copied. Paste into the new sheet (Ctrl+V).', run: () => { const s = sheetOf(doc.body); const text = tsv(s.grid, s.values); return copyRich(`<table>${text.split('\n').map(r => `<tr>${r.split('\t').map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`, text); } }
      : kind === 'deck' ? { label: 'Open in Google Slides', open: 'https://slides.new', how: 'Saved the .pptx. In the new deck: File › Import slides › Upload.', run: async () => { await save(pptx(t, deckOf(doc.body)), `${t}.pptx`, { desktop: false }); return true; } }
      : { label: 'Copy for Google Docs', open: 'https://docs.new', how: 'Copied with formatting. Paste into the new doc (Ctrl+V).', run: () => copyRich(`<h1>${esc(doc.title)}</h1>${mdHtml(doc.body)}`, doc.body) };
    return { kind, t, desk, fileOpts, google };
  }
  // the Export menu: Save as … · Save to Desktop (host computer) · Google · Print / PDF
  function menu(anchor, doc) {
    const o = options(doc);
    const items = o.fileOpts.map(([k, label, make]) => ({ label: `Download ${label}`, run: async () => { const [b, n] = make(); const r = await save(b, n, { desktop: false }); toast(r.path ? `Saved to ${r.path}` : `Downloaded ${n}`); } }));
    if (o.desk) items.push({ label: 'Save to Desktop', run: async () => { const [b, n] = o.fileOpts[0][2](); const r = await save(b, n, { desktop: true, reveal: true }); toast(r.path ? `Saved to ${r.path}` : `Downloaded ${n}`); } });
    items.push({ label: o.google.label, run: async () => { const okd = await o.google.run(); window.open(o.google.open, '_blank', 'noopener'); toast(okd ? o.google.how : 'Copy did not work here. Download the file and upload it instead.'); } });
    if (o.kind === 'doc') items.push({ label: 'Print or save as PDF', run: () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(o.t)}</title><body style="font:15px/1.6 Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 16px">${mdHtml(doc.body)}<script>setTimeout(()=>print(),300)<\/script>`); w.document.close(); } });
    items.push({ label: 'Google Drive (coming soon)', disabled: true, run: () => {} });
    let pop = document.getElementById('ex-pop'); if (pop) pop.remove();
    pop = document.createElement('div'); pop.id = 'ex-pop'; pop.className = 'ex-pop'; pop.setAttribute('role', 'menu');
    pop.innerHTML = `<p class="ex-h">Export “${esc(doc.title || 'Untitled')}”</p>` + items.map((x, i) => `<button type="button" role="menuitem" class="ex-i" data-i="${i}" ${x.disabled ? 'disabled' : ''}>${esc(x.label)}</button>`).join('');
    document.body.appendChild(pop);
    const r = anchor ? anchor.getBoundingClientRect() : { left: 20, bottom: 60, right: 260 };
    pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    pop.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { pop.remove(); try { await items[+b.dataset.i].run(); } catch (e) { toast(e.message || 'Export failed'); } });
    setTimeout(() => document.addEventListener('click', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', off, true); } }, true), 0);
    return pop;
  }
  window.TribeExport = { docx, xlsx, pptx, zip, save, menu, options, blocks, runs };
})();
