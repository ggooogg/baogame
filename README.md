![demo](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/demo1.gif)
# 在线游戏
访问： http://guanyuxin.com/

由于官方服务器带宽和延迟较大，想玩的同学可以通过搭建私服在局域网中和好朋友一起玩。搭建私服方法在末尾给出。
<br>
*2016-01-17修改了手雷的控制方式：按住act扔出，按住的时间越久，扔的越远，扔出后一段时间爆炸；蹲下时扔出的手雷会贴着地滚。*

--
# 游戏简介

### 游戏目标:
	把其他人推下水
	使用道具消灭其他人
	have fun

### 加入:
	通过浏览器打开后可以查看目前的游戏状态，选择加入后可以进行游戏
	
	加入前给自己起个有个性的名字吧
	
	自己的角色顶部有黄色名称，敌人角色顶部有红色名称

### 移动碰撞：
	wasd控制移动，当玩家处于平台上时，w为跳跃，d为下蹲；当玩家处于梯子附近时（头顶出现上下箭头），w,d为爬梯子上下
	
    ** 手机上使用虚拟按键控制 **

	两个玩家接触后会产生碰撞，将两个玩家弹开，使用这个机制把敌人推下平台吧
	
	通常情况下，两个玩家碰撞时，跳起或者蹲下的一方会有优势

### 道具：
	游戏中有紫色的能量球，玩家吃到后会产生各种能力或者效果，有些道具的效果能力强大，好好使用他们。详情在道具部分介绍。

![demo](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/demo2.gif)

# 道具
### 毒药:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/drug.png)

*大部分道具是强大而有益的，但是看到毒药你还是离他远一些为好，他会让吃到他的玩家立即死亡*

### 手枪:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/gun.png)

*按q向面前发射一颗子弹，消灭任何敢于正面对抗你的敌人，注意：只有三发子弹，请节约使用。无法消灭下蹲或者跳起的敌人*

### 无敌:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/power.png)

*并不是真正的无敌，但是会让你直接消灭所有敢于触碰你的敌人，并且他们无法给你造成碰撞*

### 隐身:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/hide.png)

*使用后慢慢从你的敌人视野里面消失，谁能和看不见的敌人战斗呢？*

### 惊喜:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/random.png)

*surprise !*

### 喷气背包:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/flypack.png)

*跳的不够高？干嘛不飞呢！跳起后再次按w进入飞行模式，让那些只会蹦跶的人羡慕吧。等等,好像没油了...*

### 手雷:
![drug](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/grenade.png)

*按住act扔出，按住的时间越久，扔的越远，扔出后一段时间爆炸；蹲下时扔出的手雷会贴着地滚。手雷扔出的速度受角色影响，所以跑动时手雷速度更快，跳起时仍的更高*

--

![demo](https://raw.githubusercontent.com/guanyuxin/baogame/master/doc/demo3.gif)

# 搭建私服方法--通过npm [稳定版]

1.安装node4.2.4(或者以上版本)和npm
# **如果安装出现问题请尝试将node升级至最新版本

2.shell中执行以下代码：

```
npm install fuzion-game &&
cd node_modules/fuzion-game/ &&
npm run build &&
node app.js
```

3.打开http://localhost:8030  就可以开始玩了

4.把localhost替换成你的域名或者ip，然后分享给你的朋友，一起玩吧

--

# 搭建私服方法--使用github [最新版]

将上面方法的第二部替换为：

```
git clone https://github.com/guanyuxin/baogame
cd baogame
npm install
npm run build
node app.js
```
--

# 服务器管理

```
#启动参数：
node app.js [port=端口，默认8030] [code=管理员口令，默认admin] [room=房间数目，默认1]
```
http://localhost:port/admin  可以进入管理界面，需要localStorage中设置code=管理员口令，然后可以创建物品或者封禁用户ip

--
# 部署到 Cloudflare Workers

本项目既可本地用 Node 运行（见上），也可部署到 Cloudflare Workers（推荐，免服务器、全球低延迟）。

## 架构

- **主 Worker (`src/worker.js`)**：提供静态资源（`static/`、`build/` 下的 HTML/CSS/JS/图片）、HTTP 路由（`/createRoom`、`/roomsData`），并将 WebSocket 升级请求转发到对应房间。
- **Room Durable Object (`src/room-do.js`)**：每个房间一个实例，持有 `game/Game` 实例，用 `setInterval` 驱动 17ms 游戏主循环，连接为常驻 WebSocket（不休眠，原因见下）。所有玩家掉线后自动停止循环并释放 Game。
- **Lobby Durable Object (`src/lobby-do.js`)**：单例房间注册表，维护房间列表与在线人数（替代原 Node 版的内存 `rooms` 数组）。

游戏核心逻辑（`game/` 目录）**完全复用**，仅做了两处解耦：
1. `Game` 新增第 5 个参数 `autoTick`：Node 版默认自启 `setInterval`；Workers 版传 `false`，由 Durable Object 的 `ctx.setInterval` 驱动。
2. `static/js/JPack.js`、`static/js/const.js` 的导出判断改为同时兼容浏览器与模块环境。

## 本地测试

```bash
npm install
npm run build             # 生成 static/js/vue.js（构建产物，被 .gitignore 忽略，不可省）
npx wrangler dev
# 打开 http://localhost:8787
```

## 部署

```bash
npm run build             # 同上，部署前必须执行，否则页面缺少 vue.js
npx wrangler login        # 首次需登录 Cloudflare
npm run deploy            # 等价于 wrangler deploy
```

## 关于 WebSocket 休眠（重要）

房间使用常驻 WebSocket（`ws.accept()`）而不是 Hibernatable WebSocket。

原因是本游戏是 17ms 一帧的实时模拟：DO 一旦被驱逐，内存里的 `Game` 实例、玩家角色和主循环
全部丢失，而客户端连接还开着 —— 表现就是"房间突然不动了，刷新重进才好"。
常驻连接的代价是房间有人时按在线时长计费，换来的是状态不会丢。

## 降低延迟

1. **让房间落在离玩家最近的机房（最有效）**
   `Room` DO 是单实例的，默认机房由 Cloudflare 分配，跨洲时 RTT 能差 200ms 以上。
   现在会按**第一位进入房间的玩家所在洲**自动选择（见 `src/constants.js` 的 `CONTINENT_HINT`）。
   需要固定机房时，在 `wrangler.toml` 加：

   ```toml
   [vars]
   ROOM_LOCATION = "apac"   # apac / wnam / enam / sam / weur / eeur / oc / afr / me
   ```

2. **用自定义域名，不要长期用 `*.workers.dev`**
   `workers.dev` 在部分地区（含中国大陆）解析慢甚至不可达；绑定自己的域名并接入 Cloudflare
   才能走最近的边缘节点。

3. **游戏内可实时看延迟**：顶栏会显示 `延迟：xx ms`（每 2 秒一次心跳测得的往返时间），
   便于判断是机房太远还是网络本身的问题。

4. **如果玩家主要在中国大陆**：Cloudflare 在中国大陆没有节点，且中国大陆访问 Cloudflare
   的线路抖动较大，此时 Workers 并不是最优选 —— 建议用上面的 Node 私服部署一台离玩家近的
   VPS（`node app.js`），延迟通常能低一个数量级。

5. **每帧广播开销**：`Game.sendTick` 已把全房间共用的 users/items 每帧只序列化一次，
   逐客户端只拼接字符串，房间人越多省得越多。

部署后通过分配的 `*.workers.dev` 域名访问即可。`/admin` 管理界面需在浏览器 localStorage 设置 `code=管理员口令`（默认 `admin`，可用 `wrangler secret put ADMIN_CODE` 修改）。

## 配置说明 (`wrangler.toml`)

- `compatibility_flags = ["nodejs_compat"]`：启用 Node.js 兼容（游戏逻辑使用 CommonJS 风格）。
- `durable_objects.bindings`：声明 `ROOM`（房间）与 `LOBBY`（房间列表）两个 Durable Object。
- `assets.directory = "static"`：用 Workers Assets 直接托管静态文件，无需额外对象存储。

