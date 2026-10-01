const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomDelay(min, max) {
  return min + Math.random() * Math.max(0, max - min);
}

module.exports = { sleep, randomDelay };