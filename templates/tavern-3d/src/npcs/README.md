# NPCs lane

Owned by **NPCs**. The patrons. They are always bots and always labelled as bots.

- `patrons.json`: names, roles, homes, how restless they are, and their lines. Add a patron here: no code needed.
- `patron.js`: behaviour (go home and work or sit, wander, chat with each other, react to the player) and the
  three orders (Follow me, Stay, Go to your spot).
- `body.js`: how a patron looks (body, head, a hat per role).
- `index.js`: loads the JSON and puts everyone in the room.
