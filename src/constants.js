// Worker 与 Durable Object 共用的全局配置
// 集中放置，避免 MAX_USER / TICK_MS 等常量在多个文件里各写一份而产生偏差

// 单个房间最多玩家数
export const MAX_USER = 6;

// 单个房间最多连接数（含观战，超出后拒绝新连接）
export const MAX_CLIENT = 30;

// 游戏主循环间隔（ms），17ms ≈ 60Hz，与原 Node 版一致
export const TICK_MS = 17;

// 按访客所在洲给 Room DO 选择就近机房（Cloudflare locationHint）
// 房间由第一位进入的玩家创建，因此整局游戏会落在离他最近的数据中心
export const CONTINENT_HINT = {
	AF: "afr",
	AS: "apac",
	EU: "weur",
	NA: "wnam",
	SA: "sam",
	OC: "oc",
};
