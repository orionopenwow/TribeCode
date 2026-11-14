// One shared set of minimalist stroke icons (feat/shell-polish, docs/DESIGN-SYSTEM.md §3 "Icons").
// Inline SVG, 24-unit grid drawn at 16 or 20px, 1.5px stroke in currentColor, round caps, nothing filled. Quiet on purpose:
// they sit beside a label, never instead of one. Files' icons (filesview.js) live here too, under the same names.
//   TribeIcons.svg(name, size = 16, cls?) -> '<svg …>'      an unknown name draws 'other' (a paperclip), never nothing
//   TribeIcons.has(name), TribeIcons.names()
//   <span data-icon="chat"></span>  or  <span data-icon="chat" data-icon-size="20"></span>  is filled in automatically
//     (on load and whenever such an element is added); the span gets class "ti" and aria-hidden.
(function () {
  'use strict';
  const P = {
    all: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    notes: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    docs: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h4.5"/>',
    sheets: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    designs: '<circle cx="8" cy="8" r="4"/><rect x="12" y="12" width="8" height="8" rx="1.5"/><path d="M4 20l3.5-6 3.5 6z"/>',
    sites: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    pics: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
    code: '<path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13"/>',
    other: '<path d="M20 11.5l-7.6 7.6a4.9 4.9 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.6 4.7l-7.6 7.6a1.6 1.6 0 0 1-2.3-2.3l7-7"/>',
    whiteboard: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M7 12.5c2-3 3.5-3 5 0s3 3 5-1M9 21l3-4 3 4"/>',
    template: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
    assets: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    device: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/>',
    tribe: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M14 6h7M14 11h5M14 16h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    move: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><path d="M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 19.5h16"/>',
    delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7"/>',
    // shell, tabs and features (feat/shell-polish)
    home: '<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    chat: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    files: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8.5 12.2l2.4 2.3 4.6-5"/>',
    board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.5 4v16M14.5 4v10"/>',
    preview: '<rect x="3" y="4.5" width="18" height="13" rx="1.5"/><path d="M10.5 8.5v5l4-2.5z"/><path d="M8 20.5h8"/>',
    design: '<path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',
    git: '<circle cx="6.5" cy="6" r="2"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="8" r="2"/><path d="M6.5 8v8M17.5 10c0 4-5 3.5-9.5 6.5"/>',
    work: '<rect x="3.5" y="7.5" width="17" height="12" rx="1.5"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17"/>',
    company: '<path d="M5 20V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V20M14 9.5h4a1 1 0 0 1 1 1V20M3.5 20h17M8 8h3M8 11.5h3M8 15h3"/>',
    agent: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M3 13v2M21 13v2"/>',
    people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.6c1.6.6 2.6 2.1 3 4.4"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    bug: '<rect x="7.5" y="8" width="9" height="12" rx="4.5"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0M12 12v8M4 13h3.5M16.5 13H20M5 8.5l2.5 1.5M19 8.5L16.5 10M5 18.5l2.6-1.5M19 18.5l-2.6-1.5"/>',
    vote: '<path d="M4 13.5h16v6H4zM8 13.5V5.5h8v8M10 9.5l1.5 1.5 2.5-3"/>',
    flag: '<path d="M5 21V4.5M5 5h11l-2 3.5 2 3.5H5"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    photo: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8.5 6l1.5-2h4l1.5 2"/><circle cx="12" cy="12.5" r="3.2"/>',
    inbox: '<path d="M4 13.5l2.2-8h11.6l2.2 8V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/>',
    plug: '<path d="M9 3.5v4M15 3.5v4M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0zM12 16.5V21"/>',
    map: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    merge: '<circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="12" r="2"/><path d="M7 7.5v9M7 9c0 2.5 2.5 3 8 3"/>',
    hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.2-5.6-3.6L4 13.6a1.5 1.5 0 0 1 2.5-1.6L8 14"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    quill: '<path d="M20 4c-7 0-12 4.5-13.5 12L5 20M8.5 15.5c5 0 9-3.5 11.5-11.5M10 12h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    capture: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="12" cy="12" r="3"/>',
    academy: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5M21.5 9.5v5"/>',
    store: '<path d="M4 9.5L5.5 4.5h13L20 9.5M4 9.5h16M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
    shelf: '<path d="M3.5 20h17M3.5 13h17M6 13V6.5h3V13M10.5 13V4.5h3V13M16 13l1.6-6.3 2.6.6-1.5 5.7"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8h1.7a3.5 3.5 0 0 0 3.5-3.5c0-4.7-3.8-8.5-8.5-8.5z"/><circle cx="7.5" cy="12" r=".9"/><circle cx="9.5" cy="7.8" r=".9"/><circle cx="14.5" cy="7.8" r=".9"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    shield: '<path d="M12 3.5l7 2.8V11c0 4.6-3 8.1-7 9.5-4-1.4-7-4.9-7-9.5V6.3z"/>',
    key: '<circle cx="8" cy="15" r="3.8"/><path d="M10.8 12.3L19.5 3.5M16 7l2.5 2.5M14 9l2 2"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.6 1.5A3.8 3.8 0 0 1 17.5 18.5z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.7.8-2.7 2s1.2 1.7 2.7 2c1.6.3 2.8.9 2.8 2.2s-1.2 2.1-2.8 2.1c-1.4 0-2.4-.6-2.9-1.5M12 6v1.8M12 16.2V18"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20.5h6M12 16.5v4"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 17.5h2"/>',
    tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 17.5h2"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',   // feat/widgets-v2
    timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2 1.5M10 3h4M18.5 6.5l1.2-1.2"/>',
    pulse: '<path d="M3 12h4l2.5-5 4 10 2.5-5H21"/>',
    checklist: '<path d="M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11 7h9M11 13h9M11 19h9"/>',
    gauge: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l3.5-3.5"/>',
    poll: '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>',
    sparkle: '<path d="M12 4l1.6 4.8L18.5 10l-4.9 1.4L12 16l-1.6-4.6L5.5 10l4.9-1.2z"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6.5"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3l6.5-6.5a4 4 0 0 0-2-2zM4 20l5-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/>',
    flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-2.6 1.6-4.4 3-6 .4 1.6 1.2 2.6 2.2 3C11 9 12.5 5.5 15 3.5c-.2 3 1.2 4.6 2.2 6.2.7 1.1.8 2.4.8 3.7 0 4.8-2.4 7.6-6 7.6z"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zM12 9c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z"/>',
    swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    // Invited agents, one glyph per kind (inviteagent.js). Plain shapes of our own, not anyone's logo.
    'agent-claude': '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
    'agent-cursor': '<path d="M6 4l12 7-5.2 1.6L11 18z"/>',
    'agent-codex': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 10l3 2.5-3 2.5M13 15h3.5"/>',
    'agent-chatgpt': '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
    'agent-gemini': '<path d="M12 3c.6 4.8 4.2 8.4 9 9-4.8.6-8.4 4.2-9 9-.6-4.8-4.2-8.4-9-9 4.8-.6 8.4-4.2 9-9z"/>',
    'agent-vscode': '<path d="M9 7 4 12l5 5M15 7l5 5-5 5"/>',
    'agent-windsurf': '<path d="M3 16c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3M3 10c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3"/>',
    'agent-cline': '<rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9.5 12v2M14.5 12v2M12 3v3"/>',
    'agent-zed': '<path d="M6 6h12L6 18h12"/>',
    'agent-other': '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  };
  const ALIAS = { messages: 'chat', 'task-board': 'tasks', code: 'code', repo: 'git', agents: 'agent', fleet: 'agent', settings: 'gear', notes: 'notes', website: 'sites', plan: 'coin', credits: 'bolt', pictures: 'pics', canvas: 'design' };
  const name = n => (P[n] ? n : P[ALIAS[n]] ? ALIAS[n] : 'other');
  function svg(n, size = 16, cls = '') {
    const s = Number(size) || 16;
    return `<svg class="ti-svg${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${(1.5 * 24 / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-i="${name(n)}">${P[name(n)]}</svg>`;
  }
  function fill(root) {
    const r = root && root.querySelectorAll ? root : document;
    const list = r.matches && r.matches('[data-icon]') ? [r, ...r.querySelectorAll('[data-icon]')] : r.querySelectorAll('[data-icon]');
    for (const el of list) {
      const k = el.getAttribute('data-icon') + '|' + (el.getAttribute('data-icon-size') || 16);
      if (el._ti === k) continue; el._ti = k;
      el.classList.add('ti'); el.setAttribute('aria-hidden', 'true');
      el.innerHTML = svg(el.getAttribute('data-icon'), el.getAttribute('data-icon-size') || 16);
    }
  }
  if (typeof document !== 'undefined') {
    const go = () => {
      fill(document);
      new MutationObserver(ms => { for (const m of ms) {
        if (m.type === 'attributes') { fill(m.target); continue; }
        for (const n of m.addedNodes) if (n.nodeType === 1 && (n.hasAttribute('data-icon') || n.querySelector('[data-icon]'))) fill(n);
      } }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-icon', 'data-icon-size'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
  // agent(kind): the glyph for an invited agent's kind ('claude', 'cursor'…); an unknown kind draws the plug.
  const agent = (kind, size = 16, cls = '') => svg(P['agent-' + kind] ? 'agent-' + kind : 'agent-other', size, cls);
  window.TribeIcons = { svg, fill, agent, has: n => !!P[n] || !!P[ALIAS[n]], names: () => Object.keys(P), paths: P };
})();
