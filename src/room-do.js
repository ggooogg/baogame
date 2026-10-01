// Durable Object：每个房间一个实例
// 负责持有 Game 实例、驱动游戏循环、管理 WebSocket 连接
import { DurableObject } from "cloudflare:workers";

import Game from "../game/game.js";
import { MAX_CLIENT, MAX_USER, TICK_MS } from "./constants.js";

// 序列化时跳过反向引用字段，避免循环引用（与 Node 版 app.js 行为一致）
function replacer(key, val) {
	if (
		key === "game" ||
		key === "socket" ||
		key === "client" ||
		key === "targetMob" ||
		key === "targetItem" ||
		key === "AI"
	) {
		return undefined;
	}
	return val;
}

// 解析 "eventName$jsonData" 协议帧（与 Node 版 app.js、game/client.js 保持一致）
// 入参 raw 可为字符串或 ArrayBuffer；返回 {name, data}，解析失败返回 null
function parseMessage(raw) {
	let message = raw;
	if (typeof message !== "string") {
		try {
			message = new TextDecoder().decode(message);
		} catch (e) {
			return null;
		}
	}
	const idx = message.indexOf("$");
	if (idx === -1) {
		return { name: message, data: {} };
	}
	try {
		return {
			name: message.substring(0, idx),
			data: JSON.parse(message.substring(idx + 1)),
		};
	} catch (e) {
		return null;
	}
}

// 把 WebSocket 包装成 game/client.js 期望的 socket 接口
// 协议：消息格式为 "eventName$jsonData"，与原有 Node 版 app.js 完全一致
function createSocket(ws, request) {
	const socket = {
		// 发送：eventName + "$" + JSON
		// data 为字符串时按原样发送（Game.sendTick 会预先序列化并复用同一份字符串）
		emit: function (name, data) {
			try {
				// 已关闭/正在关闭的连接直接跳过（readyState 缺失时按可用处理）
				if (ws.readyState !== undefined && ws.readyState > 1) return;
				const body =
					typeof data === "string" ? data : JSON.stringify(data || {}, replacer);
				ws.send(name + "$" + body);
			} catch (e) {
				// 连接已断开，忽略
			}
		},
		// 注册事件回调（由 game/client.js 在 connect() 中调用）
		on: function (name, callback) {
			this.listeners[name] = callback;
		},
		// 由 message 事件回调调用，解析并分发一条消息
		dispatch: function (raw) {
			const msg = parseMessage(raw);
			if (!msg) return;
			// 心跳：直接在网关层回包，不进入游戏逻辑（用于客户端测延迟）
			if (msg.name === "ping") {
				socket.emit("pong", msg.data);
				return;
			}
			if (socket.listeners[msg.name]) {
				socket.listeners[msg.name](msg.data);
			}
		},
		close: function () {
			try {
				ws.close(1000, "bye");
			} catch (e) {}
		},
		ip: request.headers.get("cf-connecting-ip") || "unknown",
		listeners: {},
	};
	return socket;
}

export class Room extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.ctx = ctx;
		this.env = env;
		this.game = null;
		this.tickTimer = null;
		this.roomID = null;
		this.adminCode = env.ADMIN_CODE || "admin";
		// ws -> socket，连接关闭时用于反查并移除客户端
		this.sockets = new Map();
	}

	// 向 Lobby 查询本房间类型（ws 连接 URL 不带 type 参数）
	async lookupRoomType(roomID) {
		if (!this.env || !this.env.LOBBY || !roomID) return "";
		try {
			const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
			const res = await lobby.fetch(
				new Request("https://lobby/lookup?roomID=" + encodeURIComponent(roomID))
			);
			if (res.ok) return await res.text();
		} catch (e) {
			console.log("lookup roomType failed", e);
		}
		return "";
	}

	// 确保 Game 实例存在并启动游戏循环
	// 返回 true 表示 Game 就绪，false 表示房间未注册（与 Node 端 app.js 拒绝未找到房间行为一致）
	async ensureGame(roomID) {
		if (this.game) return true;
		const roomType = await this.lookupRoomType(roomID);
		if (!roomType) return false;
		this.roomID = roomID;
		// autoTick=false：游戏主循环由本 DO 显式驱动（不依赖 Game 内部 setInterval）
		this.game = new Game(this.adminCode, MAX_USER, roomType, null, false);
		this.startLoop();
		return true;
	}

	// 启动 17ms 主循环；已启动则跳过
	startLoop() {
		if (this.tickTimer) return;
		this.tickTimer = setInterval(() => {
			if (this.game && this.game.clients.length > 0) {
				this.game.update();
			}
		}, TICK_MS);
	}

	stopLoop() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	}

	// 接受连接后立即关闭并给出原因（房间不存在 / 已满）
	reject(reason) {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();
		server.send("close$" + JSON.stringify(reason));
		server.close();
		return new Response(null, { status: 101, webSocket: client });
	}

	async fetch(request) {
		const url = new URL(request.url);

		// 仅处理 WebSocket 升级请求
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket connection", { status: 426 });
		}

		const roomID = url.searchParams.get("roomID") || "1";
		const UUID = url.searchParams.get("UUID") || String(Math.random());

		const gameReady = await this.ensureGame(roomID);
		if (!gameReady) {
			return this.reject("未找到房间");
		}
		if (this.game.clients.length >= MAX_CLIENT) {
			return this.reject("房间链接已满");
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// 使用常驻连接（ws.accept）而非 Hibernatable WebSocket：
		// 游戏是 17ms 一帧的实时模拟，DO 一旦被驱逐，内存里的 Game 实例与主循环都会丢失，
		// 之后进入房间的玩家会拿到一个"死房间"（无 tick、指令被丢弃），必须刷新重进才恢复。
		// 常驻连接的代价是房间有人时按在线时长计费，换来的是状态与循环不会丢。
		server.accept();

		const socket = createSocket(server, request);
		server.addEventListener("message", (event) => {
			socket.dispatch(event.data);
		});
		// 连接断开（含 DO 被驱逐导致的断开）：清理客户端，无人时停循环让 DO 可回收
		server.addEventListener("close", () => this.onClose(server));
		server.addEventListener("error", () => this.onClose(server));

		this.sockets.set(server, socket);
		this.game.addClient(socket, UUID);
		this.notifyLobby();

		return new Response(null, { status: 101, webSocket: client });
	}

	onClose(ws) {
		const socket = this.sockets.get(ws);
		this.sockets.delete(ws);
		if (socket && this.game) {
			this.game.removeClient(socket);
		}
		// 所有连接断开后停止游戏循环并释放 Game，允许 DO 被回收
		if (this.sockets.size === 0) {
			this.notifyLobby();
			this.stopLoop();
			this.game = null;
		}
	}

	// 通知 Lobby 更新本房间人数
	notifyLobby() {
		if (!this.roomID || !this.env || !this.env.LOBBY) return;
		try {
			const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
			const users = this.game ? this.game.clients.length : 0;
			lobby
				.fetch(
					new Request(
						"https://lobby/updateCount?roomID=" +
							encodeURIComponent(this.roomID) +
							"&users=" +
							users
					)
				)
				.catch(() => {});
		} catch (e) {
			console.log("notifyLobby failed", e);
		}
	}
}
