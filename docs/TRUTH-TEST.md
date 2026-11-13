# Truth test

Run: 2026-11-12 18:35 · `python app/test/e2e_truth.py`

Does every screen reach a real backend, without errors, and is chat light?

- Server calls made by the UI: **332** (0 answered 4xx/5xx; expected 401/403/404/409 are allowed)
- Chat send → on screen: **45 ms** (budget 1500)
- One message over the WebSocket: **169 bytes** (budget 4096)
- DOM nodes one message adds: **16** (budget 60)
- Chat history response: **247 bytes**

- Visited 48 destinations; 47 made at least one server call.

## Problems

None.
