// server/runCodeVM.js

const { NodeVM } = require("vm2");

async function runCodeVM(userCode, testcases) {
  const vm = new NodeVM({
    console: "inherit",
    timeout: 300, // ms per execution
    sandbox: {},
    eval: false,
    wasm: false,
    allowAsync: false,
    wrapper: "commonjs",
  });
  let exportedFn;

  try {
    exportedFn = vm.run(userCode);
  } catch (e) {
    console.error("Compile error:", e);
    return {
      passed: 0,
      total: testcases.length,
      execTime: 0,
      codeLength: userCode.length,
      error: "SyntaxError: Could not compile user code.",
    };
  }

  if (typeof exportedFn !== "function") {
    return {
      passed: 0,
      total: testcases.length,
      execTime: 0,
      codeLength: userCode.length,
      error:
        "Invalid format. Expected module.exports = function (input) { ... }",
    };
  }

  let passed = 0;
  let execTime = 0;

  for (const t of testcases) {
    try {
      const start = performance.now();
      const out = exportedFn(t.input);
      const end = performance.now();
      execTime += end - start;

      if (JSON.stringify(out) === JSON.stringify(t.output)) {
        passed++;
      }
    } catch (e) {
      // treat as failed test, no crash
      console.error("Runtime error:", e);
    }
  }
  console.log({
    passed,
    total: testcases.length,
    execTime: Math.round(execTime),
    codeLength: userCode.length,
    error: null,
  });
  return {
    passed,
    total: testcases.length,
    execTime: Math.round(execTime),
    codeLength: userCode.length,
    error: null,
  };
}

module.exports = { runCodeVM };
