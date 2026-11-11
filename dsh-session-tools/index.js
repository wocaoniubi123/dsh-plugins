// dsh-session-tools · host 侧：会话删除（平台缺的能力）。
//
// 官方只有「归档」没有「删除」，这里补上删除本体：
//   1) 先归档（官方 workspaceRegistry.archiveSession）：会话离开可见树并入归档集，
//      删除中途失败也不会留一个可见的半死会话；带 stopActivity 强推，正在跑的会话
//      先把活动停掉再归档（否则官方以 WorkspaceActiveSessionError 拒绝）。
//   2) 实时会话 flush 后从存储分离（触发 session/disposed → 客户端 host/session-removed）；
//      冷会话走 sessionPersistence.prepare + sessions.enter/announce 广播移除。
//   3) 等投影缓存落盘（whenIdle）再删缓存行，避免删除后被写回（复活）。
//   4) 级联删除 SUBAGENT 子会话（只认 origin=subagent；fork 分支是独立会话不删）。
//   5) 清 spill 目录 → 删转录目录（sessionPersistence.locate 定位）。
//   6) 从工作区记账摘除该 id，并从归档集收尾（官方 unarchiveSession 明确允许对
//      已消失的 id 收尾：移除 id 不可能引入未知会话）。
// 幽灵会话（转录目录已消失但记账残留）不报错，尽力清理并广播移除。
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { sessionDir } from "@deepseek-ai/dsh-spill-local";

var looseSchema = { parse: function (v) { return v; } };
var SESSION_TOOLS_INVOCATIONS = [
	{
		id: "dsh-session-tools#sessionTools/deleteSession",
		service: "session-tools-service",
		namespace: "sessionTools",
		method: "deleteSession",
		invocation: { kind: "direct" },
		parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: { mode: "strict", typeSymbol: "dsh-session-tools/types#SessionId", schema: looseSchema } }],
		result: { mode: "strict", typeSymbol: "dsh-session-tools/types#Deleted", schema: looseSchema },
		sourceLocation: { file: "dsh-session-tools/index.js", line: 1, column: 1 }
	}
];
var SESSION_TOOLS_TYPERT = {
	package: "dsh-session-tools",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(SESSION_TOOLS_INVOCATIONS)
};
function registerRemote(ctx) {
	var existing = ctx.get("typert");
	if (existing !== void 0) {
		existing.register(SESSION_TOOLS_TYPERT);
		return;
	}
	ctx.inject(["typert"], function (tctx) {
		tctx.typert.register(SESSION_TOOLS_TYPERT);
	});
}

var SessionToolsService = class extends Service {
	static inject = [];
	constructor(ctx) {
		super(ctx, "session-tools-service");
		this.typertRemote = bindTypertRemote(this, "session-tools-service", { namespace: "sessionTools" });
		registerRemote(ctx);
	}

	/** 删除一个会话（含子代理级联）。返回 { deleted: true }；失败抛错由调用方提示。 */
	async deleteSession(sessionId) {
		if (typeof sessionId !== "string" || sessionId.length === 0) throw new TypeError("sessionId must be a non-empty string");
		var registry = this.ctx.get("workspaceRegistry");
		var sessions = this.ctx.get("sessions");
		var persistence = this.ctx.get("sessionPersistence");
		var projCache = this.ctx.get("sessionProjectionCache");

		var known = sessions !== void 0 && sessions.get(sessionId) !== void 0;
		if (!known && registry !== void 0 && typeof registry.sessionKnown === "function") {
			try {
				known = await registry.sessionKnown(sessionId);
			} catch (error) {
				this.warn("sessionKnown probe failed for '" + sessionId + "': " + String(error));
			}
		}

		if (known) {
			// 1) 先归档（幂等；已归档直接返回；活动会话带 stopActivity 强推）
			if (registry !== void 0 && typeof registry.archiveSession === "function") {
				try {
					await registry.archiveSession(sessionId, { stopActivity: true });
				} catch (error) {
					this.warn("archive before delete failed for '" + sessionId + "': " + String(error));
				}
			}
			// 2) 分离实时会话 / 广播冷会话移除
			var live = sessions === void 0 ? void 0 : sessions.get(sessionId);
			if (live !== void 0) {
				await sessions.flush(live);
				sessions.detachEntered(sessions.liveEntryFor(live));
			} else if (sessions !== void 0) {
				await this.publishColdRemoval(sessionId, sessions, persistence);
			}
		} else if (sessions !== void 0) {
			await this.publishColdRemoval(sessionId, sessions, persistence);
		}

		// 3) 投影缓存：先等落盘再删行
		if (projCache !== void 0) {
			try {
				if (typeof projCache.whenIdle === "function") await projCache.whenIdle();
			} catch (error) {
				this.warn("projection cache idle wait failed for '" + sessionId + "': " + String(error));
			}
			try {
				if (typeof projCache.delete === "function") await projCache.delete(sessionId);
			} catch (error) {
				this.warn("projection cache row delete failed for '" + sessionId + "': " + String(error));
			}
		}

		// 4) 级联删子代理会话
		await this.deleteDescendants(sessionId, sessions, persistence);

		// 5) spill 目录 + 转录目录
		await this.cleanSpill(sessionId);
		if (known) await this.removeTranscript(sessionId, persistence, registry);

		// 6) 工作区记账摘除 + 归档集收尾
		await this.detachFromWorkspaces(sessionId, registry);
		if (registry !== void 0 && typeof registry.unarchiveSession === "function") {
			try {
				await registry.unarchiveSession(sessionId);
			} catch (error) {
				this.warn("unarchive cleanup failed for '" + sessionId + "': " + String(error));
			}
		}
		return { deleted: true };
	}

	/** 广播一个"已存但未挂载"会话的移除（冷会话删除路径）。 */
	async publishColdRemoval(sessionId, sessions, persistence) {
		if (persistence === void 0 || typeof persistence.prepare !== "function") return;
		try {
			var preparation = await persistence.prepare(sessionId);
			var detach = sessions.enter(preparation.session);
			try {
				sessions.announce(preparation.session);
			} finally {
				detach();
				preparation[Symbol.dispose]();
			}
		} catch (error) {
			this.warn("could not publish removal for stored session '" + sessionId + "': " + String(error));
		}
	}

	/** 尽力而为的级联删除：只删头部 origin=subagent 的子会话（fork 分支不删）。 */
	async deleteDescendants(sessionId, sessions, persistence) {
		var descendants = [];
		try {
			if (sessions !== void 0 && typeof sessions.list === "function") {
				for (const session of sessions.list()) {
					if (session.header !== void 0 && session.header.parentSession === sessionId && session.header.origin === "subagent") descendants.push(session.id);
				}
			}
			if (persistence !== void 0 && typeof persistence.list === "function") {
				for (const header of await persistence.list()) {
					if (header.parentSession === sessionId && header.origin === "subagent" && descendants.indexOf(header.id) === -1) descendants.push(header.id);
				}
			}
		} catch (error) {
			this.warn("descendant enumeration failed for '" + sessionId + "': " + String(error));
			return;
		}
		for (const childId of descendants) {
			try {
				await this.deleteSession(childId);
			} catch (error) {
				this.warn("cascade delete of subagent session '" + childId + "' (child of '" + sessionId + "') failed: " + String(error));
			}
		}
	}

	/** 尽力而为的 spill 清理：移除该会话作用域的 spill 目录。 */
	async cleanSpill(sessionId) {
		try {
			var spill = this.ctx.get("spillStore");
			if (spill === void 0 || typeof spill.root !== "string") return;
			await rm(sessionDir(spill.root, sessionId), { recursive: true, force: true });
		} catch (error) {
			this.warn("spill cleanup for deleted session '" + sessionId + "' failed: " + String(error));
		}
	}

	/** 删除会话的转录目录（仅记账清理完成后调用）。 */
	async removeTranscript(sessionId, persistence, registry) {
		try {
			if (persistence === void 0 || typeof persistence.locate !== "function") {
				throw new Error("session persistence backend does not expose locate()");
			}
			var header = registry !== void 0 && typeof registry.readSessionHeader === "function"
				? await registry.readSessionHeader(sessionId)
				: (await persistence.prepare(sessionId)).session.header;
			var location = persistence.locate(header);
			if (location === void 0 || typeof location.path !== "string") {
				throw new Error("session persistence backend could not resolve the transcript directory");
			}
			await rm(dirname(location.path), { recursive: true, force: true });
		} catch (error) {
			var detail = "transcript directory for '" + sessionId + "' was not removed: " + String(error);
			this.warn(detail);
			throw new Error(detail, { cause: error });
		}
	}

	/** 把 id 从每个工作区记录中摘除（官方 entity API，幂等）。 */
	async detachFromWorkspaces(sessionId, registry) {
		if (registry === void 0 || typeof registry.list !== "function") return;
		var entities;
		try {
			entities = registry.list();
		} catch (error) {
			this.warn("workspace enumeration failed for '" + sessionId + "': " + String(error));
			return;
		}
		for (const entity of entities) {
			var record = entity.record;
			if (record === void 0 || !Array.isArray(record.sessionIds) || record.sessionIds.indexOf(sessionId) === -1) continue;
			try {
				await entity.detachSession(sessionId);
			} catch (error) {
				this.warn("detach from workspace '" + record.id + "' failed for '" + sessionId + "': " + String(error));
			}
		}
	}

	warn(message) {
		if (this.ctx.logger !== void 0 && typeof this.ctx.logger.warn === "function") this.ctx.logger.warn("session-tools: " + message);
	}
};

function apply(ctx) {
	new SessionToolsService(ctx);
}

export { SessionToolsService };
export default { apply };
