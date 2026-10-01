// Lobby Durable Object（单例）：维护房间注册表
// 房间列表在多人部署下无法靠单进程内存，统一收口到此处
import { DurableObject } from "cloudflare:workers";
import { MAX_USER } from "./constants.js";

export class Lobby extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.ctx = ctx;
		this.env = env;
		// 标记是否已初始化默认房间
		this.initialized = false;
	}

	async getRooms() {
		return (await this.ctx.storage.get("rooms")) || {};
	}

	async saveRooms(rooms) {
		await this.ctx.storage.put("rooms", rooms);
	}

	async getCounter() {
		return (await this.ctx.storage.get("counter")) || 1;
	}

	// 首次访问时懒初始化：预置一个持久的"大乱斗"默认房间
	// 与 Node 端 app.js 启动时 Room.createRoom("大乱斗", true) 行为保持一致
	async ensureDefaultRoom(location) {
		if (this.initialized) return;
		this.initialized = true;
		const rooms = await this.getRooms();
		const hasDefault = Object.values(rooms).some((r) => r.presist);
		if (!hasDefault) {
			const id = String(await this.getCounter());
			await this.ctx.storage.put("counter", Number(id) + 1);
			rooms[id] = {
				id: id,
				name: "大乱斗",
				type: "大乱斗",
				users: 0,
				maxUser: MAX_USER,
				presist: true,
				doId: this.createRoomId(location),
			};
			await this.saveRooms(rooms);
		}
	}

	// 为房间分配一个 Room DO id。
	// 带上 locationHint 让 DO 落在离玩家最近的数据中心（房间由第一位玩家创建），
	// 这是跨洲部署时降低延迟最有效的一步；解析失败时退回随机分配。
	createRoomId(location) {
		try {
			const opts = location && location !== "auto" ? { locationHint: location } : undefined;
			return this.env.ROOM.newUniqueId(opts).toString();
		} catch (e) {
			try {
				return this.env.ROOM.newUniqueId().toString();
			} catch (e2) {
				return null;
			}
		}
	}

	// 注册新房间，返回房间 id
	async register(type, location) {
		await this.ensureDefaultRoom(location);
		const rooms = await this.getRooms();
		const id = String(await this.getCounter());
		await this.ctx.storage.put("counter", Number(id) + 1);
		rooms[id] = {
			id: id,
			name: type,
			type: type,
			users: 0,
			maxUser: MAX_USER,
			doId: this.createRoomId(location),
		};
		await this.saveRooms(rooms);
		return id;
	}

	// 更新某房间人数；人数归零的非持久房间直接回收，避免注册表无限增长
	async updateCount(roomID, users) {
		const rooms = await this.getRooms();
		const room = rooms[roomID];
		if (!room) return;
		if (users <= 0 && !room.presist) {
			delete rooms[roomID];
		} else {
			room.users = users;
		}
		await this.saveRooms(rooms);
	}

	// 返回房间列表（过滤掉 0 人的非持久房间，保留有人的）
	async list() {
		await this.ensureDefaultRoom();
		const rooms = await this.getRooms();
		const result = [];
		for (const id of Object.keys(rooms).sort((a, b) => Number(a) - Number(b))) {
			const r = rooms[id];
			if (r.users > 0 || r.presist) {
				result.push({ id: r.id, name: r.name, users: r.users, maxUser: r.maxUser });
			}
		}
		return new Response(JSON.stringify(result));
	}

	// 按 roomID 查询房间类型
	// 返回空字符串表示房间不存在（用于 Room DO 判断是否拒绝连接）
	async lookup(roomID, location) {
		await this.ensureDefaultRoom(location);
		const rooms = await this.getRooms();
		const r = rooms[roomID];
		return r ? r.type : "";
	}

	// 取房间对应的 Room DO id（为空表示历史房间，回退到 idFromName）
	async getDo(roomID, location) {
		await this.ensureDefaultRoom(location);
		const rooms = await this.getRooms();
		const r = rooms[roomID];
		return r && r.doId ? r.doId : "";
	}

	// 自动选房：找一个未满的房间（users < maxUser），全部已满则新建
	// 与 Node 端 room.js 的 joinOrCreate 行为保持一致
	// 注：Lobby 中每个房间的 users 由 Room DO 通过 /updateCount 上报，即真实连接数
	async findOrCreate(type, location) {
		await this.ensureDefaultRoom(location);
		type = type || "大乱斗";
		const rooms = await this.getRooms();
		// 按 id 升序遍历，优先复用编号较小的房间
		const ids = Object.keys(rooms).sort((a, b) => Number(a) - Number(b));
		for (const id of ids) {
			const r = rooms[id];
			if (r && r.users < r.maxUser) {
				return id;
			}
		}
		// 全部已满：注册新房间
		return await this.register(type, location);
	}

	async fetch(request) {
		const url = new URL(request.url);
		const q = url.searchParams;
		if (url.pathname === "/register") {
			const id = await this.register(q.get("type") || "大乱斗", q.get("location"));
			return new Response(id);
		}
		if (url.pathname === "/updateCount") {
			await this.updateCount(q.get("roomID"), parseInt(q.get("users") || "0", 10));
			return new Response("ok");
		}
		if (url.pathname === "/lookup") {
			return new Response(await this.lookup(q.get("roomID"), q.get("location")));
		}
		if (url.pathname === "/do") {
			return new Response(await this.getDo(q.get("roomID"), q.get("location")));
		}
		if (url.pathname === "/findOrCreate") {
			const id = await this.findOrCreate(q.get("type") || "大乱斗", q.get("location"));
			return new Response(id);
		}
		if (url.pathname === "/list") {
			return await this.list();
		}
		return new Response("not found", { status: 404 });
	}
}
