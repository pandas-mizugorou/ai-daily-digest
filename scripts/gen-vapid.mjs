// VAPID 鍵ペア生成 (web-push npm 不要、Node 標準 crypto のみ)。
// ローカルで 1 回だけ実行する。出力された公開鍵を assets/app.js の
// VAPID_PUBLIC_KEY に埋め込み、秘密鍵を GitHub Secret VAPID_PRIVATE_KEY へ登録する。
//
//   node scripts/gen-vapid.mjs
//
// 形式は web-push の generateVAPIDKeys と互換:
//   公開鍵 = 非圧縮 EC point (0x04 || X || Y) の base64url (≈87 文字)
//   秘密鍵 = d (32 byte) の base64url (≈43 文字)

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

const x = Buffer.from(pub.x, "base64url");
const y = Buffer.from(pub.y, "base64url");
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);

const VAPID_PUBLIC_KEY = uncompressed.toString("base64url");
const VAPID_PRIVATE_KEY = priv.d; // JWK の d は既に base64url

console.log("# --- VAPID keys (generated " + new Date().toISOString() + ") ---");
console.log("# 公開鍵: assets/app.js の VAPID_PUBLIC_KEY に貼る (公開してよい)");
console.log("VAPID_PUBLIC_KEY=" + VAPID_PUBLIC_KEY);
console.log("");
console.log("# 秘密鍵: GitHub リポジトリ Settings → Secrets and variables → Actions");
console.log("#         に VAPID_PRIVATE_KEY という名前で登録する (絶対に公開しない)");
console.log("VAPID_PRIVATE_KEY=" + VAPID_PRIVATE_KEY);
