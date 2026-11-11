// dsh-subagent-model-pill · host 侧：子代理会话的模型切换 RPC。
//
// 为什么需要 host 半侧：
//   官方 remote.session.selectModel 对子代理会话会被拒——它走 resolveAgent →
//   liveAgent → hasApiSessionSubagentOwner，而后者对 session.header.origin === "subagent"
//   直接返回 true，产出 RemoteError("session/agent-busy", "owned by subagent routing")。
//
//   但那条鉴权只挡在 resolveAgent 门口。sessionController 内部的
//   selectForNextRequest(agent, selection) 只做两件事：
//       agent.session.append("model/selection", selection)
//       this.selectionFor(agent).current = selection
//   ——完全不看会话来源。而 ctx.agents.get(id) 返回 live Agent 时也不校验归属。
//
//   所以本插件在 host 侧复刻这一步：拿到 live agent → 校验 provider/model 可路由
//   → append 事件 + 写执行缓存。下一次提示词组装会用新模型（模型/selection 事件
//   会被 modelSelection 投影折成 pending，request/header 到达后转 lastUsed）。
//
// 边界：
//   - 只对**已挂载的 live 子代理**生效（冷会话/一次性子代理没有 live agent，无从改）
//   - 若会话正跑到一半，当前步骤保留启动时的模型；新模型从下一次请求开始
//   - 这是绕过官方鉴权的插件行为。DSH 升级若改动 sessionController 内部形态
//     （selectForNextRequest / selections 私有字段），本 RPC 会失效并抛错
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";

var looseSchema = { parse: function (v) { return v; } };

var INVOCATIONS = [
	{
		id: "dsh-subagent-model-pill#subagentModelPill/selectChildModel",
		service: "subagent-model-pill-service",
		namespace: "subagentModelPill",
		method: "selectChildModel",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "request", wire: "request", source: "json", codec: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#SelectRequest", schema: looseSchema } }
		],
		result: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#Selected", schema: looseSchema },
		sourceLocation: { file: "dsh-subagent-model-pill/index.js", line: 1, column: 1 }
	},
	{
		// 批量把一个父会话下的所有子代理设为同一模型
		id: "dsh-subagent-model-pill#subagentModelPill/applyToChildren",
		service: "subagent-model-pill-service",
		namespace: "subagentModelPill",
		method: "applyToChildren",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "request", wire: "request", source: "json", codec: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#ApplyRequest", schema: looseSchema } }
		],
		result: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#Applied", schema: looseSchema },
		sourceLocation: { file: "dsh-subagent-model-pill/index.js", line: 1, column: 1 }
	},
	{
		// 读一个会话当前在用的模型（用于「跟随父会话」）
		id: "dsh-subagent-model-pill#subagentModelPill/readRoute",
		service: "subagent-model-pill-service",
		namespace: "subagentModelPill",
		method: "readRoute",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "request", wire: "request", source: "json", codec: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#ReadRequest", schema: looseSchema } }
		],
		result: { mode: "strict", typeSymbol: "dsh-subagent-model-pill/types#Route", schema: looseSchema },
		sourceLocation: { file: "dsh-subagent-model-pill/index.js", line: 1, column: 1 }
	}
];

var TYPERT = {
	package: "dsh-subagent-model-pill",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(INVOCATIONS)
};

var SubagentModelPillService = class extends Service {
	static inject = [];
	/** 待命子代理的选择：sessionId -> { provider, model, reasoningEffort? } */
	pendingSelections = new Map();
	constructor(ctx) {
		super(ctx, "subagent-model-pill-service");
		this.typertRemote = bindTypertRemote(this, "subagent-model-pill-service", { namespace: "subagentModelPill" });
		// 依赖在构造时尚未就绪，必须等 inject 回调再注册 RPC 与探测
		ctx.inject(["typert", "agents", "llm", "sessionController"], (readyCtx) => {
			try {
				readyCtx.typert.register(TYPERT);
			} catch (error) {
				this.warn("typert.register FAILED: " + String(error && error.message ? error.message : error));
				return;
			}
			// 关键：待命子代理被唤醒时会触发 agent/created。
			// 在这里把预先记下的选择应用上去，赶在它第一次请求之前。
			try {
				readyCtx.on("agent/created", (payload) => {
					try {
						var agent = payload !== null && payload !== void 0 ? payload.agent : void 0;
						if (agent === void 0 || agent.session === void 0) return;
						var id = agent.session.id;
						var pending = this.pendingSelections.get(id);
						if (pending === void 0) return;
						this.pendingSelections.delete(id);
						this.applySelection(agent, pending);
						this.info("applied deferred selection to " + id + " -> " + JSON.stringify(pending));
					} catch (error) {
						this.warn("apply deferred selection failed: " + String(error && error.message ? error.message : error));
					}
				});
			} catch (error) {
				this.warn("could not hook agent/created: " + String(error && error.message ? error.message : error));
			}
		});
	}

	/**
	 * 给一个（子代理）会话切换后续请求使用的模型。
	 * @returns { selected: { provider, model, reasoningEffort? } }
	 */
	async selectChildModel(request) {
		var sessionId = request !== null && request !== void 0 ? request.sessionId : void 0;
		var provider = request !== null && request !== void 0 ? request.provider : void 0;
		var model = request !== null && request !== void 0 ? request.model : void 0;
		if (typeof sessionId !== "string" || sessionId.length === 0) throw new TypeError("sessionId must be a non-empty string");
		if (typeof provider !== "string" || provider.length === 0) throw new TypeError("provider must be a non-empty string");
		if (typeof model !== "string" || model.length === 0) throw new TypeError("model must be a non-empty string");
		this.info("selectChildModel called: session=" + sessionId + " " + provider + "/" + model);

		var agents = this.ctx.get("agents");
		if (agents === void 0 || typeof agents.get !== "function") throw new Error("agent registry is unavailable");
		// 直接取 live Agent，绕开官方 resolveAgent 对子代理会话的归属拒绝
		var agent = agents.get(sessionId);
		if (agent === void 0) {
			this.warn("no live agent for session " + sessionId + " (cold or already-settled child)");
			throw new Error("session \"" + sessionId + "\" has no live agent (cold or one-shot child); start it before switching models");
		}
		this.info("live agent found for " + sessionId + ", origin=" + (agent.session && agent.session.header ? agent.session.header.origin : "?"));

		// 与官方一致：先让适配器解析并规范化这次选择，拒绝不可路由的路由
		var llm = this.ctx.get("llm");
		if (llm === void 0 || typeof llm.resolveCallConfig !== "function") throw new Error("llm service is unavailable");
		var resolved = await llm.resolveCallConfig({
			provider: provider,
			model: model,
			...(reasoningEffort === void 0 || reasoningEffort === null || reasoningEffort === "" ? {} : { reasoningEffort: reasoningEffort })
		});
		var selection = {
			provider: resolved.provider,
			model: resolved.model,
			...(resolved.reasoningEffort === void 0 ? {} : { reasoningEffort: String(resolved.reasoningEffort) })
		};

		// selectForNextRequest 在 SessionController 的内部 ApiSessionAgentController 上，
		// 即 sessionController.agents（官方 selectModel 第 808 行也是 this.agents.selectForNextRequest）
		var controller = this.ctx.get("sessionController");
		var inner = controller === void 0 ? void 0 : controller.agents;
		if (inner === void 0 || typeof inner.selectForNextRequest !== "function") {
			throw new Error("sessionController.agents.selectForNextRequest is unavailable; this DSH build may have changed its internals");
		}
		inner.selectForNextRequest(agent, selection);
		this.info("selectForNextRequest committed: " + JSON.stringify(selection) + " for " + sessionId);
		return { selected: selection };
	}

	info(message) {
		if (this.ctx.logger !== void 0 && typeof this.ctx.logger.info === "function") this.ctx.logger.info("subagent-model-pill: " + message);
	}

	warn(message) {
		if (this.ctx.logger !== void 0 && typeof this.ctx.logger.warn === "function") this.ctx.logger.warn("subagent-model-pill: " + message);
	}
};

function apply(ctx) {
	new SubagentModelPillService(ctx);
}

export { SubagentModelPillService };
export default { apply };
