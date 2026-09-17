/**
 * SigV4 query-string presigning for a single GET object request, using only
 * node:crypto. This is deliberately small: one pure function, verified
 * against the AWS-documented presigned URL example, rather than a dependency
 * for a single signature.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */
const crypto = require("node:crypto");

const ALGORITHM = "AWS4-HMAC-SHA256";

const sha256Hex = (input) =>
  crypto.createHash("sha256").update(input, "utf8").digest("hex");

const hmac = (key, value) =>
  crypto.createHmac("sha256", key).update(value, "utf8").digest();

/** RFC 3986 percent-encoding. `/` is preserved when encodeSlash is false. */
const uriEncode = (input, encodeSlash) => {
  let result = "";
  for (const ch of String(input)) {
    if (/^[A-Za-z0-9\-_.~]$/.test(ch)) {
      result += ch;
    } else if (ch === "/" && !encodeSlash) {
      result += "/";
    } else {
      for (const byte of Buffer.from(ch, "utf8")) {
        result += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return result;
};

const toAmzDate = (date) =>
  date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace(/\.\d+/, "");

const signingKey = (secretAccessKey, dateStamp, region, service) => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
};

/**
 * Presigns a GET request via SigV4 query auth.
 *
 * For Cloudflare R2 the default host is `${accountId}.r2.cloudflarestorage.com`
 * with a path-style URI (`/${bucket}/${key}`), region `auto`, service `s3`.
 * Set `virtualHosted: true` and pass an explicit `host` to reproduce the AWS
 * documented example (virtual-hosted style, `${bucket}.s3.amazonaws.com`).
 */
const presignGetUrl = ({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  expiresIn,
  now = new Date(),
  responseContentDisposition,
  responseContentType,
  host,
  region = "auto",
  service = "s3",
  virtualHosted = false,
}) => {
  const resolvedHost = host || `${accountId}.r2.cloudflarestorage.com`;
  const path = virtualHosted ? `/${key}` : `/${bucket}/${key}`;
  const canonicalUri = uriEncode(path, false);

  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const params = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  if (responseContentDisposition) {
    params["response-content-disposition"] = responseContentDisposition;
  }
  if (responseContentType) {
    params["response-content-type"] = responseContentType;
  }

  const canonicalQueryString = Object.keys(params)
    .sort()
    .map((name) => `${uriEncode(name, true)}=${uriEncode(params[name], true)}`)
    .join("&");

  const canonicalHeaders = `host:${resolvedHost}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const key_ = signingKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto
    .createHmac("sha256", key_)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${resolvedHost}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
};

/** Reads R2 credentials/config from the environment. */
const r2Config = () => {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_PRIVATE_BUCKET || "").trim();
  const missing = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_PRIVATE_BUCKET");
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    ready: missing.length === 0,
    missing,
  };
};

module.exports = { presignGetUrl, r2Config, uriEncode };
