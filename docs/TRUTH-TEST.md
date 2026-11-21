# Truth test

Run: 2026-11-21 16:23 · `python app/test/e2e_truth.py`

Does every screen reach a real backend, without errors, and is chat light?

- Server calls made by the UI: **639** (1 answered 4xx/5xx; expected 401/403/404/409 are allowed)
- Chat send → on screen: **1354 ms** (budget 1500)
- One message over the WebSocket: **169 bytes** (budget 4096)
- DOM nodes one message adds: **22** (budget 60)
- Chat history response: **247 bytes**

- Visited 49 destinations; 48 made at least one server call.

## Problems

None.
