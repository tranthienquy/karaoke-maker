const isBreakText = (text) => {
  if (!text) return true;
  const t = text.toUpperCase();
  return t.includes('BREAK') || t.trim() === '';
};

console.log("BREAK:", isBreakText("BREAK"));
console.log("Break:", isBreakText("Break"));
console.log("[BREAK]:", isBreakText("[BREAK]"));
console.log("Nhạc dạo BREAK:", isBreakText("Nhạc dạo BREAK"));
console.log("Hello:", isBreakText("Hello"));
