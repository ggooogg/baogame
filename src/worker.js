// 主 Worker 入口
// 职责：
//  1. 提供静态资源（HTML/CSS/JS/图片）
//  2. HTTP 路由：/createRoom、/join、/roomsData
//  3. 将 WebSocket 升级请求路由到对应房间的 Room Durable Object
import { Room } from "./room-do.js";
import { Lobby } from "./lobby-do.js";
import { CONTINENT_HINT } from "./constants.js";

export { Room, Lobby };

// 无扩展名的页面路径 -> assets 中的 html 文件
// 不依赖 assets 的 html_handling 猜测，避免 /rooms、/admin 返回 404
const PAGES = {
	"/": "/index.html",
	"/rooms": "/rooms.html",
	"/admin": "/admin.html",
};

// 文本资源统一声明 charset=utf-8，否则在 Windows 中文系统上浏览器按 GBK 解码会导致中文乱码
const CHARSET = {
	js: "text/javascript; charset=utf-8",
	css: "text/css; charset=utf-8",
	html: "text/html; charset=utf-8",
};

function lobbyStub(env) {
	return env.LOBBY.get(env.LOBBY.idFromName("global"));
}

// 按访客所在洲给出 Room DO 的机房提示（可用 ROOM_LOCATION 变量强制指定，如 "apac"）
function locationHint(env, request) {
	if (env.ROOM_LOCATION && env.ROOM_LOCATION !== "auto") {
		return env.ROOM_LOCATION;
	}
	const continent = request.cf && request.cf.continent;
	return CONTINENT_HINT[continent] || "auto";
}

// 取房间对应的 Room DO 句柄：优先用 Lobby 记录的（带机房提示的）DO id
async function roomStub(env, request, roomID) {
	const res = await lobbyStub(env).fetch(
		new Request(
			"https://lobby/do?roomID=" +
				encodeURIComponent(roomID) +
				"&location=" +
				encodeURIComponent(locationHint(env, request))
		)
	);
	const doId = res.ok ? (await res.text()).trim() : "";
	// 注意：idFromString 返回的是 id，还要再 get() 一次才拿到 stub
	return doId
		? env.ROOM.get(env.ROOM.idFromString(doId))
		: env.ROOM.get(env.ROOM.idFromName(String(roomID)));
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;

		// ---- WebSocket 升级：路由到对应 Room DO ----
		if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
			const roomID = url.searchParams.get("roomID") || "1";
			try {
				const stub = await roomStub(env, request, roomID);
				return await stub.fetch(request);
			} catch (e) {
				// 路由/升级失败时给出可读的错误，而不是一个空的 500
				return new Response("ws route failed: " + (e && e.stack ? e.stack : e), {
					status: 500,
				});
			}
		}

		// ---- 创建房间 ----
		if (path === "/createRoom") {
			const type = url.searchParams.get("type") || "大乱斗";
			const res = await lobbyStub(env).fetch(
				new Request(
					"https://lobby/register?type=" +
						encodeURIComponent(type) +
						"&location=" +
						encodeURIComponent(locationHint(env, request))
				)
			);
			return new Response(await res.text());
		}

		// ---- 自动选房：未满则加入，全满则新建，重定向到 /?roomID=xxx ----
		// 与 Node 端 app.js 的 /join 路由行为保持一致
		if (path === "/join") {
			const type = url.searchParams.get("type") || "大乱斗";
			const res = await lobbyStub(env).fetch(
				new Request(
					"https://lobby/findOrCreate?type=" +
						encodeURIComponent(type) +
						"&location=" +
						encodeURIComponent(locationHint(env, request))
				)
			);
			const roomID = await res.text();
			return Response.redirect(
				new URL("/?roomID=" + encodeURIComponent(roomID), request.url).toString(),
				302
			);
		}

		// ---- 房间列表 ----
		if (path === "/roomsData") {
			const res = await lobbyStub(env).fetch(new Request("https://lobby/list"));
			return new Response(await res.text(), {
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			});
		}

		// ---- 静态资源 / 页面 ----
		// 交给 Workers Assets 处理（已配置 assets.directory）
		// 与 Node 端 app.js 的 noCache.setHeaders 行为一致：html/js/css 强制 no-store，
		// 避免构建产物（如 vue.js）更新后仍加载到旧版本
		const assetPath = PAGES[path] || path;
		const assetResp =
			assetPath === path
				? await env.ASSETS.fetch(request)
				: await env.ASSETS.fetch(
						new Request(new URL(assetPath, request.url).toString(), request)
				  );
		const ext = assetPath.match(/\.(js|css|html)$/);
		if (ext) {
			const headers = new Headers(assetResp.headers);
			headers.set("Content-Type", CHARSET[ext[1]]);
			headers.set("Cache-Control", "no-store");
			return new Response(assetResp.body, {
				status: assetResp.status,
				statusText: assetResp.statusText,
				headers,
			});
		}
		return assetResp;
	},
};
