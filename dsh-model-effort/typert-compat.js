// dsh-ziyong · typert codec 兼容层
//
// 内核 2.0.14 起 dsh-typert-registry 的 validateCodec 要求 `mode: "strict"`
// 的 codec 带 create() 工厂，网关运行时走 codec.create().parse(value)；
// 旧内核直接读 codec.schema.parse(value)。给只写了 schema 的 strict codec
// 补一个返回同一 schema 的 create：两代内核都能通过注册与边界校验，校验强弱不变。
export function addStrictCodecFactories(invocations) {
	for (const descriptor of invocations) {
		const codecs = [descriptor.result, descriptor.invocation?.codec, descriptor.uplink?.codec];
		for (const parameter of descriptor.parameters ?? []) codecs.push(parameter.codec);
		for (const codec of codecs) {
			if (codec === void 0 || codec.mode !== "strict" || typeof codec.create === "function") continue;
			const schema = codec.schema;
			codec.create = function () { return schema; };
		}
	}
	return invocations;
}
