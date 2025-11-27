// server/questions.js

const questions = [
  {
    id: "two-sum",
    title: "Two Sum",
    description:
      "Given an array nums and a target, return indices of the two numbers such that they add up to target.",
    starterCode: `module.exports = function (input) {
  const { nums, target } = input;

  // Write your logic here.
  // Example:
  // for (let i = 0; i < nums.length; i++) {
  //   for (let j = i + 1; j < nums.length; j++) {
  //     if (nums[i] + nums[j] === target) {
  //       return [i, j];
  //     }
  //   }
  // }
  // return [];

}`,
    testcases: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, output: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, output: [1, 2] },
      { input: { nums: [3, 3], target: 6 }, output: [0, 1] },
    ],
  },
];

function getRandomQuestion() {
  // For now always send first, easy to test
  return questions[0];
}

module.exports = { getRandomQuestion };
