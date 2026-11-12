// Start the board (from the original src/js/init.js, MIT). TribeCode: no console logging, the speed from config.js.
(function () {
  var mode = document.querySelector('#selectMode option[selected]');
  if (mode && window.CONFIG && CONFIG.stepMs) mode.value = String(CONFIG.stepMs);
  var gamepad = document.getElementById('snake-gamepad');
  var gamepadOffset = gamepad && gamepad.offsetHeight ? Math.round(window.innerHeight - gamepad.getBoundingClientRect().top) : 0;
  var board = new SNAKE.Board({ boardContainer: 'game-area', fullScreen: true, bottomOffset: gamepadOffset, premoveOnPause: false, dialogControls: document.getElementById('snake-dialog-controls') });
  document.querySelectorAll('#snake-gamepad button').forEach(function (btn) {
    btn.addEventListener('pointerdown', function (evt) { evt.preventDefault(); board.simulateKeyPress(parseInt(btn.dataset.key, 10)); });
  });
})();
