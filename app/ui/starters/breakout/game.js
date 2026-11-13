// Breakout, from the MDN "2D breakout game using pure JavaScript" tutorial by Andrzej Mazur and Mozilla contributors
// (code dedicated to the public domain, CC0; see LICENSE). TribeCode: the numbers and colors come from config.js,
// touch controls, a restart instead of alert(), and the bricks fill the width whatever the rows and columns.
(function () {
  var C = window.CONFIG || {};
  var canvas = document.getElementById("myCanvas");
  var ctx = canvas.getContext("2d");
  var ballRadius = 8;
  var speed = C.ballSpeed || 3;
  var x, y, dx, dy;
  var paddleHeight = 10;
  var paddleWidth = C.paddleWidth || 75;
  var paddleX = (canvas.width - paddleWidth) / 2;
  var rightPressed = false, leftPressed = false;
  var brickRowCount = C.rows || 3;
  var brickColumnCount = C.columns || 5;
  var brickPadding = 10, brickOffsetTop = 34, brickOffsetLeft = 20;
  var brickWidth = (canvas.width - brickOffsetLeft * 2 - brickPadding * (brickColumnCount - 1)) / brickColumnCount;
  var brickHeight = 18;
  var score = 0, lives = C.lives || 3, over = '';
  var bricks = [];
  function reset() { x = canvas.width / 2; y = canvas.height - 30; dx = speed; dy = -speed; paddleX = (canvas.width - paddleWidth) / 2; }
  function build() {
    bricks = [];
    for (var c = 0; c < brickColumnCount; c++) { bricks[c] = []; for (var r = 0; r < brickRowCount; r++) bricks[c][r] = { x: 0, y: 0, status: 1 }; }
  }
  build(); reset();

  document.addEventListener("keydown", function (e) { if (e.code == "ArrowRight") rightPressed = true; else if (e.code == "ArrowLeft") leftPressed = true; else if (over && e.code == "Space") restart(); }, false);
  document.addEventListener("keyup", function (e) { if (e.code == "ArrowRight") rightPressed = false; else if (e.code == "ArrowLeft") leftPressed = false; }, false);
  function follow(clientX) {
    var r = canvas.getBoundingClientRect(), rel = (clientX - r.left) * canvas.width / r.width;
    if (rel > 0 && rel < canvas.width) paddleX = Math.max(0, Math.min(canvas.width - paddleWidth, rel - paddleWidth / 2));
  }
  document.addEventListener("mousemove", function (e) { follow(e.clientX); }, false);
  canvas.addEventListener("touchmove", function (e) { follow(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  canvas.addEventListener("pointerdown", function () { if (over) restart(); });
  function restart() { score = 0; lives = C.lives || 3; over = ''; build(); reset(); }

  function collisionDetection() {
    for (var c = 0; c < brickColumnCount; c++) for (var r = 0; r < brickRowCount; r++) {
      var b = bricks[c][r];
      if (b.status == 1 && x > b.x && x < b.x + brickWidth && y > b.y && y < b.y + brickHeight) {
        dy = -dy; b.status = 0; score++;
        if (score == brickRowCount * brickColumnCount) over = 'You win! Tap or press Space to play again';
      }
    }
  }
  function drawBall() { ctx.beginPath(); ctx.arc(x, y, ballRadius, 0, Math.PI * 2); ctx.fillStyle = C.ball || "#F8FAFC"; ctx.fill(); ctx.closePath(); }
  function drawPaddle() { ctx.fillStyle = C.paddle || "#F26B1D"; ctx.fillRect(paddleX, canvas.height - paddleHeight, paddleWidth, paddleHeight); }
  function drawBricks() {
    for (var c = 0; c < brickColumnCount; c++) for (var r = 0; r < brickRowCount; r++) {
      if (bricks[c][r].status != 1) continue;
      var bx = c * (brickWidth + brickPadding) + brickOffsetLeft, by = r * (brickHeight + brickPadding) + brickOffsetTop;
      bricks[c][r].x = bx; bricks[c][r].y = by;
      ctx.fillStyle = r % 2 ? (C.brick2 || "#6C7CFF") : (C.brick || "#38C6B1");
      ctx.fillRect(bx, by, brickWidth, brickHeight);
    }
  }
  function drawText() {
    ctx.font = "14px system-ui, sans-serif"; ctx.fillStyle = C.ink || "#E7E9EE";
    ctx.textAlign = "left"; ctx.fillText("Score: " + score, 8, 20);
    ctx.textAlign = "right"; ctx.fillText("Lives: " + lives, canvas.width - 8, 20);
    if (over) { ctx.textAlign = "center"; ctx.font = "bold 18px system-ui, sans-serif"; ctx.fillText(over, canvas.width / 2, canvas.height / 2 + 30); }
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBricks(); drawBall(); drawPaddle(); drawText();
    if (!over) {
      collisionDetection();
      if (x + dx > canvas.width - ballRadius || x + dx < ballRadius) dx = -dx;
      if (y + dy < ballRadius) dy = -dy;
      else if (y + dy > canvas.height - ballRadius - paddleHeight) {
        if (x > paddleX && x < paddleX + paddleWidth) dy = -Math.abs(dy);
        else if (y + dy > canvas.height - ballRadius) {
          lives--;
          if (!lives) over = 'Game over. Tap or press Space to try again'; else reset();
        }
      }
      if (rightPressed && paddleX < canvas.width - paddleWidth) paddleX += 7;
      else if (leftPressed && paddleX > 0) paddleX -= 7;
      x += dx; y += dy;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
