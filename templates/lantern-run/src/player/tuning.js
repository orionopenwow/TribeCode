// How Wick moves. Pixels and seconds. Change a number, reload, feel the difference.
export const TUNING = {
  width: 7, height: 9,        // hitbox
  runSpeed: 110,              // top speed on the ground
  accel: 900,                 // how fast you reach it
  airAccel: 620,              // steering in the air
  friction: 1100,             // how fast you stop when you let go
  gravity: 900,
  maxFall: 320,
  jumpSpeed: 300,             // ~5 tiles high
  jumpCut: 0.45,              // let go of jump early -> shorter hop
  coyoteTime: 0.1,            // you can still jump this long after running off a ledge
  jumpBuffer: 0.12,           // a jump pressed this long before landing still counts
  bounceSpeed: 460,           // bounce mushrooms
};
