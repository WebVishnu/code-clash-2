function runWithTimeout(fn, input, timeout = 300) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject("Timeout"), timeout);

    try {
      const result = fn(input);
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function runCode(userCode) {
  const question = {
    testcases: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, output: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, output: [1, 2] },
    ],
  };

  const fn = new Function("input", userCode);

  let passed = 0;
  let execTime = 0;

  for (let test of question.testcases) {
    const start = performance.now();

    try {
      const out = await runWithTimeout(fn, test.input);
      const end = performance.now();
      execTime += end - start;

      if (JSON.stringify(out) === JSON.stringify(test.output)) passed++;
    } catch {
      // ignore fail
    }
  }

  return {
    passed,
    total: question.testcases.length,
    execTime: Math.round(execTime),
    codeLength: userCode.length,
  };
}

module.exports = { runCode };
