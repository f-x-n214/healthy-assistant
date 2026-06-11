import { runFirstLayer } from "../frontend/intent/firstLayer.js";
import { mapToSubIntent } from "../frontend/intent/replyLogic.js";
import { extractExerciseData, extractDietData, parseDurationFromText, chineseToNumber } from "../frontend/intent/dataExtractor.js";

const tests = [
  "今天散步了三十分钟",
  "刚刚吃了一碗焖面",
  "晚餐 七分饱",
  "查看我的饮食记录",
];

console.log("=== Intent Tests ===");
for (const t of tests) {
  const f = runFirstLayer(t);
  const sub = mapToSubIntent({ aiIntent: f.intent || "INT_OTHER", utterance: t });
  console.log(`${t}\n  -> ${f.intent} | ${sub}`);
}

console.log("\n=== Duration Tests ===");
console.log("三十分钟 ->", parseDurationFromText("今天散步了三十分钟"));
console.log("30分钟 ->", parseDurationFromText("散步30分钟"));
console.log("三十 ->", chineseToNumber("三十"));

console.log("\n=== Diet Extract Tests ===");
console.log(extractDietData(null, "刚刚吃了一碗焖面"));
console.log(extractExerciseData(null, "今天散步了三十分钟"));
