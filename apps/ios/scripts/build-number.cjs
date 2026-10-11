const MAX_BUILD = 999999999;

function parseLast(value) {
  const text = String(value).trim();
  if (!/^[1-9][0-9]{0,8}$/.test(text)) {
    throw new Error("Build number must be a positive integer of at most 9 digits.");
  }
  return Number(text);
}

function nextBuild(last, override) {
  const current = parseLast(last);
  const next = override === undefined ? current + 1 : parseLast(override);
  if (next > MAX_BUILD) throw new Error("Build number cannot exceed 999999999.");
  if (next <= current) throw new Error("Build number must be greater than the last uploaded build.");
  return next;
}

module.exports = { parseLast, nextBuild };
if (require.main === module) {
  try {
    const [mode, last, override] = process.argv.slice(2);
    if (!["parse", "next"].includes(mode)) throw new Error("Expected parse or next.");
    process.stdout.write(String(mode === "parse" ? parseLast(last) : nextBuild(last, override)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
