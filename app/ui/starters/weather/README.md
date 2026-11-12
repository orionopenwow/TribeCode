# Weather

Search a city, see today and five days ahead. Runs on mock data, with one function to swap for a real weather API.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Type a city and press Show.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Use the real Open-Meteo API") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `city` | Starting city | `Lisbon` |
| `units` | Units (C or F) | `C` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Use the real Open-Meteo API
- Remember the last cities
- Add an hourly chart
- Change the colors by the weather

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by weather apps built on free APIs like Open-Meteo.
