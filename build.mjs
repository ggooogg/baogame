import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { copyFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

// 把 Vue3 完整版（含运行时模板编译器）覆盖到 static/js/vue.js
// 注意：必须用 global(.prod).js 完整版，不能用 runtime-only 版，
// 否则 mount 时编译字符串模板会报 "i.call is not a function"
// static/js/vue.js 是被 .gitignore 忽略的构建产物，本地启动 / 部署前都必须先执行本脚本
const src = resolve(root, "node_modules/vue/dist/vue.global.prod.js");
const dest = resolve(root, "static/js/vue.js");
if (!existsSync(src)) {
	console.error("[构建失败] 缺少 node_modules/vue，请先执行: npm install");
	process.exit(1);
}
copyFileSync(src, dest);

console.log("build done -> static/js/vue.js");
