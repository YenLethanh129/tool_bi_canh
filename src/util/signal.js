// Gom viec "lang nghe Stop de dung som" vao mot cho, de moi noi khong phai tu
// lo forward vao process.on/off. Tra ve ham de go, luon dung trong finally.

function trapStop(handler) {
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}

module.exports = { trapStop };