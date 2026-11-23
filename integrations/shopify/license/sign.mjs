// Licence tokens for the Shopify app (T-325). Local only: no server.
//   node integrations/shopify/license/sign.mjs keygen
//     once: writes the private key (gitignored, never commit it) and
//     public-key.txt, which build-extension.mjs embeds in assets/ifcvo.js.
//   node integrations/shopify/license/sign.mjs sign <shop.myshopify.com> <starter|business> [days=365]
//     prints a token; paste it in the shop metafield ifcvo.license (single line text).
// The private key path can be changed with IFCVO_LICENSE_PRIVATE_KEY.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PUBLIC_KEY_FILE = path.join(here, 'public-key.txt')
export const PRIVATE_KEY_FILE = process.env.IFCVO_LICENSE_PRIVATE_KEY || path.join(here, 'private', 'ed25519-private.pem')
export const SIGNED_PLANS = ['starter', 'business']

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Raw 32-byte Ed25519 public key as base64url (what the runtime imports). */
export function rawPublicKey(publicKey) {
  return b64url(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'))
}

export function keygen({ privateFile = PRIVATE_KEY_FILE, publicFile = PUBLIC_KEY_FILE, force = false } = {}) {
  if (fs.existsSync(privateFile) && !force) throw new Error(`${privateFile} exists; keep it (tokens already issued depend on it)`)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  fs.mkdirSync(path.dirname(privateFile), { recursive: true })
  fs.writeFileSync(privateFile, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  fs.writeFileSync(publicFile, rawPublicKey(publicKey) + '\n')
  return { privateFile, publicFile }
}

/** A token `base64url(JSON payload).base64url(signature)`; exp in seconds. */
export function signToken({ shop, plan, exp }, privateKey) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(shop))) throw new Error('shop must be the *.myshopify.com domain')
  if (!SIGNED_PLANS.includes(plan)) throw new Error(`plan must be one of ${SIGNED_PLANS.join(', ')}`)
  const body = Buffer.from(JSON.stringify({ shop, plan, exp }))
  const key = typeof privateKey === 'string' ? crypto.createPrivateKey(privateKey) : privateKey
  return b64url(body) + '.' + b64url(crypto.sign(null, body, key))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, shop, plan, days = '365'] = process.argv.slice(2)
  if (cmd === 'keygen') {
    const out = keygen()
    console.log(`Private key: ${out.privateFile}\nPublic key: ${out.publicFile}\nRun node integrations/shopify/build-extension.mjs to embed it.`)
  } else if (cmd === 'sign') {
    const exp = Math.floor(Date.now() / 1000) + Number(days) * 86400
    console.log(signToken({ shop: String(shop || '').toLowerCase(), plan, exp }, fs.readFileSync(PRIVATE_KEY_FILE, 'utf8')))
  } else {
    console.log('Usage: sign.mjs keygen | sign <shop.myshopify.com> <starter|business> [days]')
    process.exitCode = 1
  }
}
